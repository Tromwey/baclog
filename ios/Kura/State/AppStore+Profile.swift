import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// Your profile: release alerts, Editar perfil, the photo, borrar la cuenta and the ribbon
/// counters.
extension AppStore {
    func toggleAlert(_ titleID: String) {
        if alerts.contains(titleID) { alerts.remove(titleID) } else {
            alerts.insert(titleID)
            KHaptic.impact(.light)
        }
        saveLocal()
    }

    /// 20f · Editar perfil: name via `PATCH /me`, handle via `PUT /me/username`
    /// (409 → "ya está tomado"); featured obsession and "en común" stay local.
    func saveProfile(name: String, handle: String, featured: String?, isPrivate: Bool, showCommon: Bool) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cleanHandle = handle.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" }
        let oldName = me.name
        let oldHandle = me.handle
        var updated = me
        if !cleanName.isEmpty { updated.name = cleanName; updated.initials = Person.initials(of: cleanName) }
        if let featured {
            updated.featuredTitleID = featured
            if let t = titles[featured] { updated.hexes = t.palette }
        }
        let newHandle = cleanHandle.isEmpty ? oldHandle : cleanHandle
        let handleChanged = newHandle != oldHandle
        if handleChanged {
            updated = Self.rehandled(updated, newHandle)
            people[oldHandle] = nil
        }
        me = updated
        if !me.id.isEmpty { people[me.id] = me }
        profilePrivate = isPrivate
        self.showCommon = showCommon
        saveLocal()
        if !cleanName.isEmpty, cleanName != oldName { patchMe(MePatch(name: cleanName)) }
        if handleChanged {
            sync(key: WriteKey.username, onError: { [weak self] e in
                // Taken (409) or rejected (400): the server kept the old handle, so the app does too.
                let text: String
                switch e {
                case .conflict: text = "@\(newHandle) ya está tomado"
                case .invalid(let fields, let m): text = fields["username"] ?? (m.isEmpty ? "Ese @ no se puede usar." : m)
                default: return false
                }
                self?.revertHandle(from: newHandle, to: oldHandle)
                self?.showToast(ToastModel(text: text, kind: .info))
                return true
            }) { [weak self] api in
                let store = self
                let m = try await api.claimUsername(newHandle)
                await MainActor.run { store?.account = m }
            }
        }
        showToast(ToastModel(text: "Perfil actualizado", kind: .info))
    }

    /// The same person under another handle (`Person.handle` is its identity, so it's rebuilt).
    private static func rehandled(_ p: Person, _ handle: String) -> Person {
        var out = Person(handle: handle, name: p.name, initials: p.initials, hexes: p.hexes,
                         featuredTitleID: p.featuredTitleID, isPrivate: p.isPrivate,
                         followers: p.followers, followingCount: p.followingCount, stats: p.stats)
        out.avatarURL = p.avatarURL
        return out
    }

    /// `PUT /me/username` refused the new handle: `me` and `people` go back to the old one (the
    /// rest of the edit — name, featured — stays, it went through `PATCH /me` on its own).
    private func revertHandle(from newHandle: String, to oldHandle: String) {
        guard me.handle == newHandle else { return }
        me = Self.rehandled(me, oldHandle)
        people[newHandle] = nil
        if !oldHandle.isEmpty { people[oldHandle] = me }
    }

    /// 20f · Cambiar foto: square crop + 512 px + JPEG on the device (the server only
    /// re-checks size and sniffs magic bytes, AGENTS.md F3.11), then `PUT /me/avatar`.
    func uploadAvatar(_ picked: UIImage) async {
        guard !avatarBusy else { return }
        guard let (data, preview) = AvatarEncoder.encode(picked) else {
            showToast(ToastModel(text: "Esa imagen no se pudo leer. Prueba con otra.", kind: .info))
            return
        }
        avatarBusy = true
        defer { avatarBusy = false }
        do {
            let m = try await api.uploadAvatar(data, contentType: "image/jpeg")
            if let url = m.avatarURL { AvatarStore.shared.prime(url, preview) }
            adoptAvatar(from: m)
            online()
            showToast(ToastModel(text: "Foto actualizada", kind: .info))
        } catch {
            let e = noteError(error)
            guard e != .unauthorized, e != .cancelled else { return }
            let text: String
            if case .invalid(_, let m) = e, !m.isEmpty { text = m } else { text = e == .offline ? "Sin conexión. La foto no se subió." : "No se pudo subir la foto" }
            showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                Task { await self?.uploadAvatar(picked) }
            })
        }
    }

    /// Only the photo changes: `applyMe` would replace `me` whole and undo a featured
    /// obsession / tint chosen locally or a name PATCH still in flight.
    private func adoptAvatar(from m: Me) {
        account = m
        me.avatarURL = m.avatarURL
        if !me.id.isEmpty { people[me.id]?.avatarURL = m.avatarURL }
    }

    func removeAvatar() async {
        guard !avatarBusy, me.avatarURL != nil else { return }
        avatarBusy = true
        defer { avatarBusy = false }
        do {
            adoptAvatar(from: try await api.deleteAvatar())
            showToast(ToastModel(text: "Foto quitada", kind: .info))
        } catch {
            let e = noteError(error)
            guard e != .unauthorized, e != .cancelled else { return }
            showToast(ToastModel(text: e.toast, kind: .retry) { [weak self] in Task { await self?.removeAvatar() } })
        }
    }

    /// C3 · the second irreversible action (typing your @ confirms it).
    func deleteAccount() {
        Task { [weak self] in
            guard let self else { return }
            do {
                try await api.deleteAccount()
            } catch {
                // Only a 204 confirms the deletion. A 401 is a revoked/expired bearer (logout on
                // another device, token past `exp`) on an account that is still ALIVE: say so and
                // send them to sign in again — never "Tu cuenta se borró.".
                let e = error is CancellationError ? .cancelled : ((error as? KuraAPIError) ?? .server(String(describing: error)))
                switch e {
                case .cancelled:
                    return
                case .unauthorized:
                    api.forgetSession()
                    sessionExpired(message: "Tu sesión terminó. Entra de nuevo para borrar tu cuenta.")
                default:
                    if e == .offline { offline = true }
                    let text = e == .offline ? "Sin conexión. Tu cuenta sigue aquí." : "No se pudo borrar tu cuenta."
                    showToast(ToastModel(text: text, kind: .retry) { [weak self] in self?.deleteAccount() })
                }
                return
            }
            await leaveDeletedAccount()
        }
    }

    /// After a 204 on `DELETE /me`: forget the token, local prefs, avatar cache, the web
    /// session of the in-app browser and every loaded resource, and go back to the welcome.
    /// No `POST auth/logout`: the account is gone, there's nothing left to revoke.
    private func leaveDeletedAccount() async {
        api.forgetSession()
        leaveSession(message: "Tu cuenta se borró.")
    }

    // MARK: Counters (profile ribbon)

    func count(of mark: Mark) -> Int { userTitles.values.filter { $0.mark == mark }.count }
}
