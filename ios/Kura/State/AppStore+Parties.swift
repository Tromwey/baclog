import SwiftUI

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

    /// `GET /parties` — "De fiesta" in Tus colecciones. Silent on failure (the carousel simply
    /// doesn't show parties); a 503 marks the feature as not there yet.
    func loadParties(force: Bool = false) async {
        guard force || s.partyCards == nil else { return }
        let session = s
        do {
            let cards = try await api.parties()
            try check(session)
            s.partiesUnavailable = false
            s.partyCards = cards
        } catch {
            guard s === session else { return }
            let e = noteError(error)
            if e == .unavailable { s.partiesUnavailable = true; s.partyCards = [] }
        }
    }

    func loadParty(_ id: String, force: Bool = false) async {
        guard force || s.parties[id] == nil else { return }
        let session = s
        do {
            let p = try await api.party(id: id)
            try check(session)
            loaded(.party(id))
            s.missingParties.remove(id)
            applyParty(p)
        } catch {
            guard s === session else { return }
            let e = fail(.party(id), error)
            if e == .notFound { s.missingParties.insert(id); s.parties[id] = nil }
            if e == .unavailable { s.partiesUnavailable = true }
        }
    }

    /// `GET /invites/{token}` (the landing, signed in or out).
    func loadInvite(_ token: String, force: Bool = false) async {
        guard force || (s.invites[token] == nil && !s.deadInvites.contains(token)) else { return }
        let session = s
        do {
            let p = try await api.invitePreview(token: token)
            try check(session)
            loaded(.invite(token))
            s.deadInvites.remove(token)
            s.invites[token] = p
            fillSongPalettes(partyID: p.party.id, p.party.songs, via: false)
        } catch {
            guard s === session else { return }
            let e = fail(.invite(token), error)
            if e == .notFound { s.deadInvites.insert(token); s.invites[token] = nil }
            if e == .unavailable { s.partiesUnavailable = true }
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
                // Only a member may write it (the preview is anonymous-capable).
                if member { try? await self.api.fillPartySongPalette(id: partyID, titleID: song.titleID, hexes: hexes) }
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
    static func partyText(_ e: KuraAPIError) -> String {
        switch e {
        case .unavailable: return "Las fiestas llegan muy pronto."
        case .conflict(_, let m) where !m.isEmpty: return m
        case .forbidden(let code):
            switch code {
            case "blocked": return "Ya no puedes agregar canciones a esta fiesta."
            case "view_only": return "En esta fiesta solo se puede ver la colección."
            case "not_yours": return "Solo puedes quitar las canciones que pusiste tú."
            default: return "No tienes permiso para hacer eso."
            }
        case .notFound: return "No encontramos esa fiesta. Puede que ya no exista o que no seas parte de ella."
        default: return e.toast
        }
    }

    private func partyToast(_ e: KuraAPIError) {
        guard e != .cancelled, e != .unauthorized else { return }
        showToast(ToastModel(text: Self.partyText(e), kind: .info))
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
                showToast(ToastModel(text: fields["name"] ?? (m.isEmpty ? "Revisa el nombre." : m), kind: .info))
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
        case .failed(let e): partyToast(e); return false
        case .stale: return false
        }
    }

    func deleteParty(_ id: String) async {
        switch await boundWrite({ try await api.deleteParty(id: id) }) {
        case .ok:
            s.parties[id] = nil
            s.partyCards?.removeAll { $0.id == id }
            dismissSheet()
            // Off every tab that shows it.
            for t in Tab.allCases { paths[t]?.removeAll { $0 == .party(id) || $0 == .partySearch(id) } }
            showToast(ToastModel(text: "Borraste la fiesta.", kind: .info))
        case .failed(let e): partyToast(e)
        case .stale: break
        }
    }

    func rotatePartyInvite(_ id: String) async {
        switch await boundWrite({ try await api.rotatePartyInvite(id: id) }) {
        case .ok(let p):
            applyParty(p)
            dismissSheet()
            showToast(ToastModel(text: "Link nuevo listo. El anterior ya no funciona.", kind: .info))
        case .failed(let e): partyToast(e)
        case .stale: break
        }
    }

    func revokePartyInvite(_ id: String) async {
        switch await boundWrite({ try await api.revokePartyInvite(id: id) }) {
        case .ok(let p): applyParty(p)
        case .failed(let e): partyToast(e)
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
                showToast(ToastModel(text: "Pusiste \(hit.title).", kind: .info))
            }
            return .added
        case .failed(let e):
            if case .conflict(let code, _) = e, code == "cap_reached" {
                await loadParty(partyID, force: true)
                present(.partyCap(partyID))
                return .capReached
            }
            partyToast(e)
            if case .forbidden = e { await loadParty(partyID, force: true) }
            return .failed
        case .stale:
            return .failed
        }
    }

    /// Quitar (the host: any song, "sale de la colección para todos"; a guest: their own).
    func removePartySong(_ partyID: String, _ song: PartySong) async {
        switch await boundWrite({ try await api.removePartySong(id: partyID, titleID: song.titleID) }) {
        case .ok(let p):
            applyParty(p)
            showToast(ToastModel(text: "Quitaste \(song.title).", kind: .info))
        case .failed(let e): partyToast(e)
        case .stale: break
        }
    }

    /// "Quitar y bloquear a @x" (host, by the song). The guest gets no notice.
    func removeAndBlockPartyGuest(_ partyID: String, _ song: PartySong) async {
        switch await boundWrite({ try await api.removeAndBlockPartyGuest(id: partyID, titleID: song.titleID) }) {
        case .ok(let p):
            applyParty(p)
            showToast(ToastModel(text: "Quitaste \(song.title) y bloqueaste a \(song.addedBy.atOrSomeone).", kind: .info))
        case .failed(let e): partyToast(e)
        case .stale: break
        }
    }

    func unblockPartyGuest(_ partyID: String, _ guest: PartyBlockedGuest) async {
        switch await boundWrite({ try await api.unblockPartyGuest(id: partyID, guestRef: guest.guestRef) }) {
        case .ok(let p):
            applyParty(p)
            showToast(ToastModel(text: "Desbloqueaste a \(guest.person.atOrSomeone).", kind: .info))
        case .failed(let e): partyToast(e)
        case .stale: break
        }
    }

    // MARK: Invites (universal link `get-kura.app/f/{token}`)

    /// Signed in: join at once (idempotent) and open the party — "ya estás dentro." the first time
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
                showToast(ToastModel(text: "Termina de crear tu cuenta para entrar a la fiesta.", kind: .info))
                return
            }
            if e == .notFound { s.deadInvites.insert(token) }
            if e == .unavailable { s.partiesUnavailable = true }
            if e == .notFound || e == .unavailable {
                withAnimation(KMotion.fade) { inviteLanding = token }
            } else {
                partyToast(e)
            }
        case .stale:
            break
        }
    }

    /// The landing's "Entrar" / "Entra a kura para poner tus 3 canciones" (signed out): off to the
    /// entrance, and the link waits in `DeepLinkInbox` — after the sign-in (and O1b for a new
    /// account, which then skips the picks) `startIfNeeded` opens it, which joins.
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
