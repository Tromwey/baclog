import SwiftUI
import os

/// Colecciones de fiesta (`.claude/knowledge/state/fiesta-contract.md`, design `fiesta-app-v2`).
///
/// A party is NOT a `KCollection`: it lives in its own per-account maps (`SessionData.parties`,
/// `partyCards`, `invites`) and its writes are awaited, not optimistic — the server decides every
/// rule (tope, duplicado, bloqueo, solo ver) and answers with the whole `Party`, which replaces ours.
/// That keeps "Pusiste 2 de 3" honest when two guests add at the same time.
///
/// The server answers `503 unavailable` to all of it while `MIGRATION_0033_LIVE` is off: reads
/// remember it (`partiesUnavailable`: the list shows none, a party page and a link say "las
/// fiestas llegan muy pronto."), writes say it in a toast. Nothing crashes, nothing retries in a loop.
extension AppStore {
    // MARK: Lookups

    func party(_ id: String) -> Party? { s.parties[id] }
    var partyCards: [PartyCard] { s.partyCards ?? [] }
    var partiesUnavailable: Bool { s.partiesUnavailable }
    func invite(_ token: String) -> InvitePreview? { s.invites[token] }
    func inviteIsDead(_ token: String) -> Bool { s.deadInvites.contains(token) }
    func partyIsMissing(_ id: String) -> Bool { s.missingParties.contains(id) }

    // MARK: Reads

    /// `GET /parties` — "De fiesta" in Tus colecciones. A 503 is the feature not being there yet:
    /// silent, no parties. Anything else is a real failure: `loadError(.parties)` puts a
    /// Reintentar strip on the carousel (the parties already listed stay), and it's logged — a
    /// contract change must not look like "you have no parties".
    func loadParties(force: Bool = false) async {
        guard force || s.partyCards == nil else { return }
        let session = s
        do {
            let cards = try await api.parties()
            try check(session)
            loaded(.parties)
            s.partiesUnavailable = false
            s.partyCards = cards
        } catch {
            guard s === session else { return }
            let e = fail(.parties, error)
            switch e {
            case .unavailable:
                loadErrors[.parties] = nil
                s.partiesUnavailable = true
                s.partyCards = []
            case .cancelled, .unauthorized:
                break
            default:
                KuraLog.party.error("GET /parties failed: \(String(describing: e), privacy: .public)")
            }
        }
    }

    func loadParty(_ id: String, force: Bool = false) async {
        guard force || s.parties[id] == nil else { return }
        let session = s
        do {
            let p = try await api.party(id: id)
            try check(session)
            loaded(.party(id))
            s.partiesUnavailable = false
            s.missingParties.remove(id)
            applyParty(p)
        } catch {
            guard s === session else { return }
            let e = fail(.party(id), error)
            if e == .notFound {
                // Deleted, you left, or a block with the host (the server never says which). One
                // we had on screen or in the list: out of every tab + "Esa fiesta ya no está." and
                // the list re-read. One we never had (a link to someone else's): the page says so.
                let known = s.parties[id] != nil || s.partyCards?.contains { $0.id == id } == true
                s.missingParties.insert(id)
                if known { partyGone(id) }
            }
            if e == .unavailable { s.partiesUnavailable = true }
        }
    }

    /// A party that isn't there for you any more: off the maps, the list and every tab's stack
    /// (its page and its search), its sheet down, and `GET /parties` again.
    private func partyGone(_ id: String, toast: String? = PartyCopy.gone) {
        dropParty(id)
        if let toast { showToast(ToastModel(text: toast, kind: .info)) }
        Task { await loadParties(force: true) }
    }

    /// Forget a party locally (deleted, left, gone) and pop it from every tab.
    private func dropParty(_ id: String) {
        s.parties[id] = nil
        s.partyCards?.removeAll { $0.id == id }
        if let sh = sheet, sh.partyID == id { dismissSheet() }
        if s.partyExport?.partyID == id { closePartyExport(force: true) }
        for t in Tab.allCases { paths[t]?.removeAll { $0 == .party(id) || $0 == .partySearch(id) } }
    }

    /// `GET /invites/{token}` (the landing, signed in or out).
    func loadInvite(_ token: String, force: Bool = false) async {
        guard force || (s.invites[token] == nil && !s.deadInvites.contains(token)) else { return }
        let session = s
        do {
            let p = try await api.invitePreview(token: token)
            try check(session)
            loaded(.invite(token))
            s.partiesUnavailable = false
            s.deadInvites.remove(token)
            s.invites[token] = p
            fillSongPalettes(partyID: p.party.id, p.party.songs, via: false)
        } catch {
            guard s === session else { return }
            let e = fail(.invite(token), error)
            if e == .notFound { s.deadInvites.insert(token); s.invites[token] = nil }
            // 503 = the server has no parties yet: "las fiestas llegan muy pronto.", and the token
            // is NOT dead — the same link works once they're on.
            if e == .unavailable { s.partiesUnavailable = true; s.deadInvites.remove(token) }
        }
    }

    /// The server's `Party` replaces ours; the list card follows (count, covers, palette).
    func applyParty(_ p: Party) {
        s.parties[p.id] = p
        let card = PartyCard(id: p.id, name: p.name, role: p.viewer.role, perGuestLimit: p.perGuestLimit,
                             songCount: p.songs.count,
                             peopleCount: Set(p.songs.compactMap { $0.addedBy?.handle }).count
                                 + (p.songs.contains { $0.addedBy == nil } ? 1 : 0),
                             host: p.host, artworkURLs: p.songs.prefix(3).map(\.artworkURL), palette: p.tint,
                             updatedAt: Date())
        var cards = s.partyCards ?? []
        if let i = cards.firstIndex(where: { $0.id == p.id }) { cards[i] = card } else { cards.insert(card, at: 0) }
        s.partyCards = cards
        fillSongPalettes(partyID: p.id, p.songs, via: true)
    }

    // MARK: Palettes (the page tint needs the first covers' colours)

    /// The first covers without a palette are extracted here (`CoverPalette`) and sent to
    /// `PUT /parties/{id}/songs/{titleId}/palette` — a song has no `/titles/{id}/palette`. Only the
    /// first three matter to the tint and the fan; the rest wait for whoever draws them first.
    private func fillSongPalettes(partyID: String, _ songs: [PartySong], via member: Bool) {
        for song in songs.prefix(3) where song.palette.isEmpty {
            guard let url = song.artworkURL, paletteAttempts.insert(PartySong.artPrefix + song.titleID).inserted else { continue }
            let session = s
            Task { [weak self] in
                let hexes = await CoverPalette.extract(from: url)
                guard let self, !hexes.isEmpty, self.s === session else { return }
                self.setSongPalette(song.titleID, hexes)
                // Only a member may write it (the preview is anonymous-capable). A failure only
                // costs the next viewer an extraction; logged, never shown.
                guard member else { return }
                do {
                    try await self.api.fillPartySongPalette(id: partyID, titleID: song.titleID, hexes: hexes)
                } catch {
                    KuraLog.party.notice("song palette PUT failed: \(String(describing: error), privacy: .public)")
                }
            }
        }
    }

    private func setSongPalette(_ titleID: String, _ hexes: [String]) {
        for (id, var p) in s.parties {
            guard let i = p.songs.firstIndex(where: { $0.titleID == titleID && $0.palette.isEmpty }) else { continue }
            p.songs[i].palette = hexes
            s.parties[id] = p
            if let c = s.partyCards?.firstIndex(where: { $0.id == id }), s.partyCards?[c].palette.isEmpty == true {
                s.partyCards?[c].palette = p.tint
            }
        }
        for (token, var v) in s.invites {
            guard let i = v.party.songs.firstIndex(where: { $0.titleID == titleID && $0.palette.isEmpty }) else { continue }
            v.party.songs[i].palette = hexes
            s.invites[token] = v
        }
    }

    // MARK: Writes

    /// The toast for a party write that failed (the server's `message` when it wrote the copy).
    static func partyText(_ e: KuraAPIError, or fallback: String = "No se pudo guardar", rotating: Bool = false) -> String {
        switch e {
        case .unavailable: return PartyCopy.unavailable
        // The server writes the copy of every 409 (`duplicate_*`, `too_many_parties`, `conflict`…).
        case .conflict(_, let m) where !m.isEmpty: return m
        case .conflict(let code, _) where code == "too_many_parties": return PartyCopy.tooManyParties
        case .rateLimited: return rotating ? PartyCopy.rotateLimited : PartyCopy.rateLimited
        case .forbidden(let code):
            switch code {
            case "blocked": return "Ya no puedes agregar canciones a esta fiesta"
            case "view_only": return "En esta fiesta solo se puede ver la colección"
            case "not_yours": return "Solo puedes quitar las canciones que agregaste tú"
            default: return "No tienes permiso para hacer eso"
            }
        case .notFound: return "No encontramos esa fiesta. Puede que ya no exista o que no seas parte de ella."
        // A code this build doesn't know: the `message` of the server's envelope, and only that
        // (`.server` is the app's own text — a decode failure, a URL, a transport error: never shown).
        case .serverMessage(let m) where !m.isEmpty: return m
        default: return e.toast(or: fallback)
        }
    }

    /// A party write that failed. A 404 is "not there for you": re-read the party, which pops it
    /// (with "Esa fiesta ya no está.") when it's really gone; when the party is still there the
    /// 404 was about the song, and `stale` says so. Everything else is the toast.
    private func partyWriteFailed(_ partyID: String, _ e: KuraAPIError,
                                  stale: String = "Eso ya no está en la fiesta. La actualizamos.",
                                  rotating: Bool = false) async {
        guard e == .notFound else { partyToast(e, rotating: rotating); return }
        await loadParty(partyID, force: true)
        if s.parties[partyID] != nil { showToast(ToastModel(text: stale, kind: .info)) }
    }

    private func partyToast(_ e: KuraAPIError, or fallback: String = "No se pudo guardar", rotating: Bool = false) {
        // `onboarding_required` was already said (and is being routed) by `noteError`.
        guard e != .cancelled, e != .unauthorized, !e.isOnboardingRequired else { return }
        showToast(ToastModel(text: Self.partyText(e, or: fallback, rotating: rotating), kind: .info))
    }

    /// "Crear fiesta": `POST /parties`, then the party opens with the share sheet up (design:
    /// `createColl` → collection + sheet share). False = it wasn't created (the toast said why).
    @discardableResult
    func createParty(name: String, perGuestLimit: Int?) async -> Bool {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { return false }
        switch await boundWrite({ try await api.createParty(name: String(n.prefix(60)), perGuestLimit: perGuestLimit) }) {
        case .ok(let p):
            s.partiesUnavailable = false
            applyParty(p)
            if sheet != nil { dismissSheet() }
            push(.party(p.id))
            try? await Task.sleep(for: .milliseconds(350))
            present(.partyShare(p.id))
            return true
        case .failed(let e):
            if case .invalid(let fields, let m) = e {
                showToast(ToastModel(text: fields["name"] ?? (m.isEmpty ? "Revisa el nombre" : m), kind: .info))
            } else if e == .unavailable {
                s.partiesUnavailable = true
                partyToast(e)
            } else {
                partyToast(e)
            }
            return false
        case .stale:
            return false
        }
    }

    @discardableResult
    func updateParty(_ id: String, name: String?, perGuestLimit: Int??) async -> Bool {
        switch await boundWrite({ try await api.updateParty(id: id, name: name, perGuestLimit: perGuestLimit) }) {
        case .ok(let p): applyParty(p); return true
        case .failed(let e): await partyWriteFailed(id, e); return false
        case .stale: return false
        }
    }

    func deleteParty(_ id: String) async {
        switch await boundWrite({ try await api.deleteParty(id: id) }) {
        case .ok:
            dismissSheet()
            dropParty(id)
            showToast(ToastModel(text: "Borraste la fiesta", kind: .info))
        case .failed(let e): await partyWriteFailed(id, e)
        case .stale: break
        }
    }

    /// "Salir de la fiesta" (a guest, `POST /parties/{id}/leave`): out of the list and every tab,
    /// back to Colecciones. Their songs stay in the party. True = left.
    @discardableResult
    func leaveParty(_ id: String) async -> Bool {
        switch await boundWrite({ try await api.leaveParty(id: id) }) {
        case .ok:
            dismissSheet()
            dropParty(id)
            if tab != .collections { tab = .collections }
            showToast(ToastModel(text: PartyCopy.left, kind: .info))
            return true
        case .failed(let e):
            await partyWriteFailed(id, e)
            return false
        case .stale:
            return false
        }
    }

    func rotatePartyInvite(_ id: String) async {
        switch await boundWrite({ try await api.rotatePartyInvite(id: id) }) {
        case .ok(let p):
            applyParty(p)
            dismissSheet()
            showToast(ToastModel(text: "Link nuevo listo. El anterior ya no funciona.", kind: .info))
        case .failed(let e): await partyWriteFailed(id, e, rotating: true)
        case .stale: break
        }
    }

    func revokePartyInvite(_ id: String) async {
        switch await boundWrite({ try await api.revokePartyInvite(id: id) }) {
        case .ok(let p): applyParty(p)
        case .failed(let e): await partyWriteFailed(id, e)
        case .stale: break
        }
    }

    enum SongSearch: Equatable {
        case results([PartySongHit])
        case failed(KuraAPIError)
    }

    func searchPartySongs(_ id: String, query: String) async -> SongSearch {
        let session = s
        do {
            let hits = try await api.searchPartySongs(id: id, query: String(query.prefix(100)))
            guard s === session else { return .failed(.cancelled) }
            online()
            return .results(hits)
        } catch {
            guard s === session else { return .failed(.cancelled) }
            return .failed(noteError(error))
        }
    }

    enum SongAdd: Equatable { case added, capReached, failed }

    /// Agregar. The design: "Pusiste X." — or, when that was the last one you had, straight to
    /// "ya pusiste tus 3." (the cap sheet). A duplicate says who put it; a full cap opens the sheet.
    @discardableResult
    func addPartySong(_ partyID: String, _ hit: PartySongHit) async -> SongAdd {
        if let p = party(partyID), !p.isHost, p.viewer.remaining == 0 {
            present(.partyCap(partyID))
            return .capReached
        }
        let palette = hit.palette.isEmpty ? nil : hit.palette
        switch await boundWrite({ try await api.addPartySong(id: partyID, titleID: hit.titleID, paletteHex: palette) }) {
        case .ok(let p):
            applyParty(p)
            KHaptic.play(.success)
            if !p.isHost, p.viewer.remaining == 0, (p.perGuestLimit ?? 0) > 0 {
                dismissToast()
                present(.partyCap(partyID))
            } else {
                showToast(ToastModel(text: "Agregaste \(hit.title)", kind: .info))
            }
            return .added
        case .failed(let e):
            if case .conflict(let code, _) = e, code == "cap_reached" {
                await loadParty(partyID, force: true)
                present(.partyCap(partyID))
                return .capReached
            }
            if e == .notFound {
                await partyWriteFailed(partyID, e, stale: "Esa canción ya no está disponible.")
                return .failed
            }
            partyToast(e)
            if case .forbidden = e { await loadParty(partyID, force: true) }
            return .failed
        case .stale:
            return .failed
        }
    }

    /// Quitar (the host: any song, "sale de la colección para todos"; a guest — blocked too, C4 —
    /// their own). True = it's out; the sheets only close / move on then.
    @discardableResult
    func removePartySong(_ partyID: String, _ song: PartySong) async -> Bool {
        switch await boundWrite({ try await api.removePartySong(id: partyID, titleID: song.titleID) }) {
        case .ok(let p):
            applyParty(p)
            showToast(ToastModel(text: "Quitaste \(song.title)", kind: .info))
            return true
        case .failed(let e):
            await partyWriteFailed(partyID, e)
            if case .forbidden = e { await loadParty(partyID, force: true) }
            return false
        case .stale:
            return false
        }
    }

    /// "Quitar y bloquear a @x" (host, by the song). The guest gets no notice. True = done.
    @discardableResult
    func removeAndBlockPartyGuest(_ partyID: String, _ song: PartySong) async -> Bool {
        switch await boundWrite({ try await api.removeAndBlockPartyGuest(id: partyID, titleID: song.titleID) }) {
        case .ok(let p):
            applyParty(p)
            showToast(ToastModel(text: "Quitaste \(song.title) y bloqueaste a \(song.addedBy.atOrSomeone)", kind: .info))
            return true
        case .failed(let e):
            await partyWriteFailed(partyID, e)
            if case .conflict = e { await loadParty(partyID, force: true) }
            return false
        case .stale:
            return false
        }
    }

    func unblockPartyGuest(_ partyID: String, _ guest: PartyBlockedGuest) async {
        switch await boundWrite({ try await api.unblockPartyGuest(id: partyID, guestRef: guest.guestRef) }) {
        case .ok(let p):
            applyParty(p)
            showToast(ToastModel(text: "Desbloqueaste a \(guest.person.atOrSomeone)", kind: .info))
        case .failed(let e): await partyWriteFailed(partyID, e, stale: "Esa persona ya no estaba bloqueada.")
        case .stale: break
        }
    }

    // MARK: Invites (universal link `get-kura.app/f/{token}`)

    /// The landing's "Entrar a la fiesta" (signed in — the ONLY caller: a link alone never joins,
    /// see `open(.invite)`): join (idempotent) and open the party — "ya estás dentro." the first time
    /// (the "returning" variant when the account already existed), no sheet for the host or a
    /// member coming back. A dead link opens the landing in its dead shape.
    func openInvite(_ token: String) async {
        switch await boundWrite({ try await api.joinParty(token: token) }) {
        case .ok(let j):
            s.partiesUnavailable = false
            applyParty(j.party)
            inviteLanding = nil
            let route = Route.party(j.party.id)
            if path(tab).last != route { push(route) }
            if j.joined == .new {
                let returning = !partyJustOnboarded
                partyJustOnboarded = false
                try? await Task.sleep(for: .milliseconds(450))
                present(.partyWelcome(j.party.id, returning: returning))
            }
        case .failed(let e):
            if case .forbidden(let code) = e, code == "onboarding_required" {
                // The link waits for the account to be ready (and survives a relaunch for an hour,
                // `DeepLinkInbox`): finishing the onboarding opens its landing again ("Entrar a la fiesta").
                // `noteError` (inside `boundWrite`) is already re-reading `me` and taking the
                // account to what it's missing; the landing steps aside for it.
                DeepLinkInbox.pending = .invite(token)
                inviteLanding = nil
                showToast(ToastModel(text: "Termina tu registro para entrar a la fiesta", kind: .info))
                return
            }
            switch e {
            case .notFound:
                s.deadInvites.insert(token)
            case .unavailable:
                // Not a dead link: the server just doesn't have parties yet.
                s.partiesUnavailable = true
                s.deadInvites.remove(token)
            case .cancelled, .unauthorized:
                return
            default:
                // Offline, a 5xx, a rate limit: never lose the link. The landing shows it with
                // the error and Reintentar (a preview that loads brings back "Entrar a la fiesta").
                loadErrors[.invite(token)] = e
                // Never "No se pudo guardar": nothing was being saved, the join didn't happen.
                partyToast(e, or: PartyCopy.joinFailed)
            }
            withAnimation(KMotion.fade) { inviteLanding = token }
        case .stale:
            break
        }
    }

    /// The landing's "Entrar" / "Entra a kura para poner tus 3 canciones" (signed out): off to the
    /// entrance, and the link waits in `DeepLinkInbox` — after the sign-in (and O1b for a new
    /// account, which then skips the picks) `startIfNeeded` opens it: the landing again, now with
    /// "Entrar a la fiesta" (the join is always that tap, never the link).
    func signInForInvite(_ token: String) {
        DeepLinkInbox.pending = .invite(token)
        withAnimation(KMotion.fade) { inviteLanding = nil }
        if phase != .main {
            onboardingStep = .signup
            if phase == .splash { withAnimation(KMotion.fade) { phase = .onboarding } }
        }
    }

    /// The landing's close (a dead / unavailable link, or signed in).
    func closeInviteLanding() {
        withAnimation(KMotion.fade) { inviteLanding = nil }
    }

    /// True while a party invite waits for the account to be ready (O1b skips "elige 3").
    var invitePending: Bool {
        if case .invite = DeepLinkInbox.pending { return true }
        return false
    }
}

extension SheetRoute {
    /// The party a party sheet is about (nil for every other sheet).
    var partyID: String? {
        switch self {
        case .partyWelcome(let id, _), .partyCap(let id), .partySong(let id, _), .partyShare(let id),
             .partyOptions(let id), .partyLink(let id), .partyExport(let id), .partyEdit(let id),
             .partyBlocked(let id), .partyDelete(let id), .partyLeave(let id), .partyExportLeave(let id):
            return id
        default:
            return nil
        }
    }
}

extension KuraLog {
    static let party = Logger(subsystem: "com.tromwey.kura", category: "party")
}
