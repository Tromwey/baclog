import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// Reportar y bloquear, and the blocked accounts list.
extension AppStore {
    // MARK: Safety (reportar · bloquear)

    func isBlocked(_ handle: String) -> Bool { blocked.contains(handle) }

    /// Reviews to show for a title: nobody you blocked (the server already filters; this covers
    /// what was cached before the block).
    func visibleReviews(_ titleID: String) -> [Review] {
        reviewList(titleID).filter { !blocked.contains($0.authorID) }
    }

    /// Sends a report and says "Gracias" only once the server answered 204. A failure offers
    /// Reintentar with the same reason (nothing is lost); a 404 means it's already gone.
    @discardableResult
    func report(_ target: ReportTarget, reason: String, details: String? = nil) async -> Bool {
        do {
            switch target {
            case .person(let handle):
                try await api.reportPerson(handle: handle, reason: reason, details: details)
            case .review(let id, _, _):
                try await api.reportReview(id: id, reason: reason)
            }
            online()
            if case .review(let id, _, _) = target { reportedReviews.insert(id) }
            KHaptic.impact(.light)
            showToast(ToastModel(text: target.isReview ? "Gracias. La revisamos." : "Gracias. Lo revisamos.", kind: .info))
            return true
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized:
                break
            case .notFound:
                showToast(ToastModel(text: target.isReview ? "Esa reseña ya no existe." : "Ese perfil ya no existe.", kind: .info))
            default:
                let text = e == .offline ? "Sin conexión. No se envió tu reporte."
                    : (e.isRateLimit ? e.toast : "No se pudo enviar tu reporte.")
                showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.report(target, reason: reason, details: details) }
                })
            }
            return false
        }
    }

    /// `PUT /me/blocks/{handle}`; the local state changes only after the 204 (the server
    /// drops the follows both ways — the app mirrors it, it doesn't guess ahead).
    @discardableResult
    func block(_ handle: String) async -> Bool {
        do {
            try await api.block(handle: handle)
            online()
            applyBlock(handle)
            KHaptic.impact(.medium)
            showToast(ToastModel(text: "Bloqueaste a @\(handle).", kind: .info))
            return true
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized:
                break
            case .notFound:
                showToast(ToastModel(text: "@\(handle) ya no existe.", kind: .info))
            default:
                let text = e == .offline ? "Sin conexión. No se bloqueó a @\(handle)." : "No se pudo bloquear a @\(handle)."
                showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.block(handle) }
                })
            }
            return false
        }
    }

    /// Mirrors the server's block: no follow either way, and nothing of theirs left on screen.
    private func applyBlock(_ handle: String) {
        blocked.insert(handle)
        let wasFollowing = following.remove(handle) != nil
        if wasFollowing { me.followingCount = max(0, me.followingCount - 1) }
        if var p = people[handle] {
            p.isBlocked = true
            p.isFollowing = false
            if wasFollowing { p.followers = max(0, p.followers - 1) }
            people[handle] = p
        }
        requested.remove(handle)
        feed.removeAll { e in
            if e.authorID == handle { return true }
            if case .suggestion(let pid, _, _, _) = e.kind { return pid == handle }
            return false
        }
        for tid in Array(s.reviewsByTitle.keys) { removeReviews(of: tid) { $0.authorID == handle } }
        for (k, v) in titleActivity { titleActivity[k] = v.filter { $0.personID != handle } }
        for (k, v) in peopleLists { peopleLists[k] = v.filter { $0.id != handle } }
        searchPeople.removeAll { $0.id == handle }
        onboardingPeople.removeAll { $0.id == handle }
        feedDirty = true
        if var list = blockedAccounts, !list.contains(where: { $0.handle == handle }) {
            let p = people[handle]
            list.insert(BlockedAccount(id: handle, handle: handle, name: p?.name ?? handle, avatarURL: p?.avatarURL), at: 0)
            blockedAccounts = list
        }
    }

    /// `DELETE /me/blocks/{handleOrId}`. Follows don't come back (the block removed them);
    /// their activity and reviews do, on the next read of each screen.
    @discardableResult
    func unblock(_ key: String, handle: String?) async -> Bool {
        let shown = handle.map { "@\($0)" } ?? "esta cuenta"
        do {
            try await api.unblock(key)
            online()
            if let handle {
                blocked.remove(handle)
                if var p = people[handle] { p.isBlocked = false; people[handle] = p }
            }
            blockedAccounts?.removeAll { $0.key == key || $0.id == key }
            feedDirty = true
            loadedTitles.removeAll() // fichas re-read their reviews on the next visit
            KHaptic.impact(.light)
            showToast(ToastModel(text: "Desbloqueaste a \(shown).", kind: .info))
            if let handle, people[handle] != nil { await loadPerson(handle, force: true) }
            return true
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized:
                break
            case .notFound:
                // Nothing to undo on the server: the list just catches up.
                if let handle { blocked.remove(handle) }
                blockedAccounts?.removeAll { $0.key == key || $0.id == key }
            default:
                let text = e == .offline ? "Sin conexión. No se desbloqueó a \(shown)." : "No se pudo desbloquear a \(shown)."
                showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.unblock(key, handle: handle) }
                })
            }
            return false
        }
    }

    /// `GET /me/blocks` (Ajustes › Cuentas bloqueadas), on every visit.
    func loadBlocks() async {
        let session = s
        do {
            let items = try await api.blocks()
            try check(session)
            loaded(.blocks)
            blocked.formUnion(items.compactMap(\.handle))
            blockedAccounts = items
        } catch {
            guard s === session else { return }
            fail(.blocks, error)
        }
    }
}
