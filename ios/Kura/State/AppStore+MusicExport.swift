import SwiftUI
import os

/// "Llévala a otra app" (`.claude/knowledge/state/export-contract.md`, design `fiesta-app-v2` ·
/// `shExport` / `isExport`). Host AND guests export, each to their own account; the playlist is
/// named like the party.
///
/// - **Apple Music** runs HERE (`AppleMusicLibrary`, MusicKit): the server hands the songs
///   (`POST …/exports/apple_music`), the app finds them in the person's storefront, creates the
///   playlist once (reported right away so a retry never makes a second one), reads what's already
///   in it (no duplicates), adds in chunks with a real bar, and reports what landed (`PUT`).
/// - **TIDAL** runs on the server: link once (`ASWebAuthenticationSession` → `kura://…` →
///   `complete`), then `step` in a loop, painting `processed/total`; `busy` waits ~1 s, a 429
///   waits `retryAfterSeconds`, `not_connected` goes back to "conecta tidal.".
///
/// Everything is `503` while `MIGRATION_0034_LIVE` is off: the sheet says "Próximamente" and never
/// fails mid-flow. The screen lives in `SessionData.partyExport` (drawn over everything by
/// `RootView`), so a sign-out drops it with the rest of the account.
extension AppStore {
    // MARK: Lookups

    var musicServices: MusicServices? { s.musicServices }
    var musicServicesError: KuraAPIError? { s.musicServicesError }
    var partyExport: PartyExportFlow? { s.partyExport }

    /// MusicKit on the device — the mock in the captures (DEBUG only).
    var appleMusic: AppleMusicLibrary {
        #if DEBUG
        if KuraRuntime.usesMock { return MockAppleMusicLibrary.shared }
        #endif
        return LiveAppleMusicLibrary()
    }

    private func makeTidalAuthorizer() -> TidalAuthorizer {
        #if DEBUG
        if KuraRuntime.usesMock { return MockTidalAuthorizer() }
        #endif
        return LiveTidalAuthorizer()
    }

    // MARK: Services

    /// `GET /music/services` when the export sheet opens. A 503 is the feature not being live:
    /// both buttons "Próximamente". Anything else is a real failure (the sheet offers Reintentar).
    func loadMusicServices() async {
        s.musicServicesError = nil
        let session = s
        do {
            let sv = try await api.musicServices()
            guard s === session else { return }
            s.musicServices = sv
        } catch {
            guard s === session else { return }
            let e = noteError(error)
            switch e {
            case .unavailable, .serviceUnavailable: s.musicServices = .off
            case .cancelled, .unauthorized: break
            default:
                s.musicServicesError = e
                KuraLog.party.error("music services failed: \(String(describing: e), privacy: .public)")
            }
        }
    }

    /// "Desconectar TIDAL" (`DELETE /music/tidal`).
    func disconnectTidal() async {
        switch await boundWrite({ try await api.disconnectTidal() }) {
        case .ok:
            s.musicServices?.tidal.connected = false
            showToast(ToastModel(text: "Desconectaste TIDAL.", kind: .info))
        case .failed(let e):
            showToast(ToastModel(text: e == .unavailable ? MusicExportCopy.unavailable : e.toast(or: "No se pudo desconectar TIDAL."), kind: .info))
        case .stale:
            break
        }
    }

    // MARK: The screen

    /// A service tapped in the sheet: the screen opens on "conecta …" when the link / permission
    /// is missing, or straight on "pasando la colección.".
    func startPartyExport(_ partyID: String, _ provider: MusicProvider) {
        guard musicServices?[provider].available == true else { return }
        if sheet != nil { dismissSheet() }
        s.partyExportTask?.cancel()
        var flow = PartyExportFlow(partyID: partyID, provider: provider, playlistName: party(partyID)?.name ?? "",
                                   step: .connect)
        var run = false
        switch provider {
        case .tidal:
            run = musicServices?.tidal.connected == true
        case .appleMusic:
            switch appleMusic.authorization {
            case .authorized: run = true
            case .denied: flow.note = MusicExportCopy.appleDenied; flow.needsSettings = true
            case .restricted: flow.note = MusicExportCopy.appleRestricted
            case .notDetermined: break
            }
        }
        if run { flow.step = .progress; flow.total = party(partyID)?.songs.count ?? 0 }
        withAnimation(KMotion.fade) { s.partyExport = flow }
        if run { launchExport() }
    }

    /// "Conectar Apple Music" / "Conectar TIDAL".
    func connectPartyExport() {
        guard let flow = s.partyExport, flow.step == .connect, !flow.busy else { return }
        s.partyExportTask?.cancel()
        s.partyExportTask = Task { [weak self] in
            guard let self else { return }
            if flow.provider == .tidal { await self.connectTidal() } else { await self.connectAppleMusic() }
        }
    }

    /// "Reintentar" (contract: POST again re-queues the missing; nothing is duplicated).
    func retryPartyExport() {
        guard s.partyExport?.step == .failed else { return }
        launchExport()
    }

    /// The ✕ / "Volver a la colección". While the songs are passing it asks first (`partyExportLeave`).
    func closePartyExport(force: Bool = false) {
        guard let flow = s.partyExport else { return }
        if !force, flow.step == .progress {
            present(.partyExportLeave(flow.partyID))
            return
        }
        s.partyExportTask?.cancel()
        s.partyExportTask = nil
        if case .partyExportLeave = sheet { dismissSheet() }
        withAnimation(KMotion.fade) { s.partyExport = nil }
    }

    // MARK: Steps

    private func updateExport(_ f: (inout PartyExportFlow) -> Void) {
        guard var flow = s.partyExport else { return }
        f(&flow)
        s.partyExport = flow
    }

    private func launchExport() {
        guard let flow = s.partyExport else { return }
        s.partyExportTask?.cancel()
        updateExport {
            $0.step = .progress; $0.note = nil; $0.failure = nil; $0.pause = nil; $0.busy = false
        }
        s.partyExportTask = Task { [weak self] in
            guard let self else { return }
            if flow.provider == .tidal { await self.runTidal(flow.partyID) } else { await self.runAppleMusic(flow.partyID) }
        }
    }

    /// One API call bound to this session (a sign-out mid-export drops the answer as cancelled).
    private func exportCall<T>(_ op: () async throws -> T) async throws -> T {
        switch await boundWrite(op) {
        case .ok(let v): return v
        case .failed(let e): throw e
        case .stale: throw CancellationError()
        }
    }

    private func applyExportState(_ st: ExportState) {
        updateExport { f in
            f.state = st
            f.playlistName = st.playlistName.isEmpty ? f.playlistName : st.playlistName
            f.total = st.total
            f.processed = min(st.processed, st.total)
            if let c = st.current { f.current = c.title }
        }
    }

    private func finishExport(_ st: ExportState) {
        applyExportState(st)
        updateExport { $0.step = .done; $0.processed = $0.total; $0.pause = nil; $0.current = nil }
    }

    private func connectAppleMusic() async {
        updateExport { $0.busy = true; $0.note = nil }
        let a = await appleMusic.requestAuthorization()
        guard !Task.isCancelled else { return }
        updateExport { $0.busy = false }
        switch a {
        case .authorized: launchExport()
        case .denied: updateExport { $0.note = MusicExportCopy.appleDenied; $0.needsSettings = true }
        case .restricted: updateExport { $0.note = MusicExportCopy.appleRestricted }
        case .notDetermined: break
        }
    }

    private func connectTidal() async {
        updateExport { $0.busy = true; $0.note = nil }
        defer { updateExport { $0.busy = false } }
        do {
            let url = try await exportCall { try await api.startTidalAuth() }
            let authorizer = makeTidalAuthorizer()
            let callback = try await authorizer.authorize(url)
            guard !Task.isCancelled else { return }
            switch TidalCallback(callback) {
            case .authorized(let ref, let claim):
                let sv = try await exportCall { try await api.completeTidalAuth(ref: ref, claim: claim) }
                s.musicServices = sv
                updateExport { $0.busy = false }
                launchExport()
            case .failed(let reason):
                updateExport { $0.note = MusicExportCopy.tidalReason(reason) }
            case nil:
                updateExport { $0.note = MusicExportCopy.tidalReason(nil) }
            }
        } catch {
            connectFailed(error, .tidal)
        }
    }

    /// A failure on the connect step stays on it, with a line saying why.
    private func connectFailed(_ error: Error, _ p: MusicProvider) {
        if error is CancellationError { return }
        let e = (error as? KuraAPIError) ?? .server(String(describing: error))
        switch e {
        case .cancelled, .unauthorized: return
        case .conflict(let code, _) where code == "auth_expired": updateExport { $0.note = MusicExportCopy.tidalReason("expired") }
        case .rateLimited: updateExport { $0.note = MusicExportCopy.tidalReason("rate_limited") }
        case .offline: updateExport { $0.note = "Sin conexión. Vuelve a intentarlo." }
        case .unavailable, .serviceUnavailable("not_configured", _), .notFound: exportFailed(e, p)
        case .serviceUnavailable(_, let m) where !m.isEmpty: updateExport { $0.note = m }
        default: updateExport { $0.note = MusicExportCopy.tidalReason(nil) }
        }
    }

    // MARK: TIDAL (server, in steps)

    private func runTidal(_ partyID: String) async {
        do {
            var st = try await exportCall { try await api.startPartyExport(id: partyID, provider: .tidal) }
            applyExportState(st)
            var rounds = 0
            while !Task.isCancelled, rounds < 2_000 {
                rounds += 1
                if st.status == .done || (st.status == .idle && !st.busy) { break }
                if st.busy { try await Task.sleep(for: .seconds(1)) }
                do {
                    st = try await exportCall { try await api.stepTidalExport(id: partyID) }
                    updateExport { $0.pause = nil }
                    applyExportState(st)
                } catch let KuraAPIError.rateLimited(retryAfter) {
                    // `service_rate_limited` (TIDAL) or ours: wait and call the same step again.
                    updateExport { $0.pause = MusicExportCopy.pause(.tidal) }
                    try await Task.sleep(for: .seconds(Double(min(max(retryAfter ?? 3, 1), 120))))
                }
            }
            guard !Task.isCancelled else { return }
            finishExport(st)
        } catch {
            exportFailed(error, .tidal)
        }
    }

    // MARK: Apple Music (MusicKit, here)

    private func runAppleMusic(_ partyID: String) async {
        let lib = appleMusic
        do {
            try await lib.checkCapabilities()
            var st = try await exportCall { try await api.startPartyExport(id: partyID, provider: .appleMusic) }
            applyExportState(st)
            // The playlist on record: still there? what's in it? (a retry never adds twice)
            var playlistID = st.playlist?.id
            var present = Set<String>()
            var replace = false
            if let pid = playlistID {
                if let ids = try await lib.playlistCatalogIDs(pid) { present = ids } else { playlistID = nil; replace = true }
            }
            // A deleted playlist starts a new generation: the whole party goes into the new one.
            let pending = replace ? st.songs : st.songs.filter { $0.state == .pending }
            if playlistID == nil {
                let pid = try await lib.createPlaylist(name: st.playlistName, description: MusicExportCopy.description(st.playlistName))
                do {
                    // Registered right away: a retry after a crash finds it instead of making another.
                    st = try await exportCall {
                        try await api.reportAppleMusicExport(id: partyID, report: AppleMusicReport(playlistId: pid, replace: replace, added: [], missing: []))
                    }
                    playlistID = pid
                } catch KuraAPIError.conflict(let code, _) where code == "playlist_exists" {
                    // Another device registered one first: continue in THAT one.
                    st = try await exportCall { try await api.partyExport(id: partyID, provider: .appleMusic) }
                    guard let other = st.playlist?.id else { throw AppleMusicFailure.service }
                    playlistID = other
                    present = try await lib.playlistCatalogIDs(other) ?? []
                }
            }
            guard let pid = playlistID else { throw AppleMusicFailure.service }
            let total = max(st.total, st.songs.count)
            updateExport { $0.total = total; $0.processed = max(0, total - pending.count); $0.current = pending.first?.title }

            var added: [String] = [], missing: [String] = [], unreported = 0
            var i = 0
            while i < pending.count {
                try Task.checkCancellation()
                let chunk = Array(pending[i..<min(i + 5, pending.count)])
                updateExport { $0.current = chunk[0].title }
                let found = try await lib.resolve(chunk)
                var toAdd: [String] = []
                for song in chunk {
                    if let id = found[song.titleID] {
                        added.append(song.titleID)
                        if !present.contains(id), !toAdd.contains(id) { toAdd.append(id) }
                    } else {
                        missing.append(song.titleID)
                    }
                }
                try await lib.add(toAdd, to: pid)
                present.formUnion(toAdd)
                i += chunk.count
                unreported += chunk.count
                let done = i
                updateExport { $0.processed = total - pending.count + done; $0.current = done < pending.count ? pending[done].title : $0.current }
                // Every ~20 songs the server learns what landed (a long export that dies keeps it).
                if unreported >= 20, done < pending.count {
                    unreported = 0
                    let (a, m) = (added, missing)
                    _ = try await exportCall {
                        try await api.reportAppleMusicExport(id: partyID, report: AppleMusicReport(playlistId: pid, replace: false, added: a, missing: m))
                    }
                }
            }
            let (a, m) = (added, missing)
            st = try await exportCall {
                try await api.reportAppleMusicExport(id: partyID, report: AppleMusicReport(playlistId: pid, replace: false, added: a, missing: m))
            }
            guard !Task.isCancelled else { return }
            finishExport(st)
        } catch {
            exportFailed(error, .appleMusic)
        }
    }

    // MARK: Failures

    private func exportFailed(_ error: Error, _ p: MusicProvider) {
        if error is CancellationError || Task.isCancelled { return }
        if let a = error as? AppleMusicFailure {
            switch a {
            case .denied: updateExport { $0.step = .connect; $0.note = MusicExportCopy.appleDenied; $0.needsSettings = true }
            case .restricted: updateExport { $0.step = .connect; $0.note = MusicExportCopy.appleRestricted }
            case .noSubscription: updateExport { $0.step = .connect; $0.note = MusicExportCopy.appleNoSubscription }
            case .libraryOff: updateExport { $0.step = .connect; $0.note = MusicExportCopy.appleLibraryOff }
            case .service: updateExport { $0.step = .failed; $0.failure = MusicExportCopy.serviceFailed(p) }
            }
            return
        }
        let e = (error as? KuraAPIError) ?? .server(String(describing: error))
        switch e {
        case .cancelled, .unauthorized:
            return
        case .conflict(let code, let m) where code == "not_connected":
            // The TIDAL link died (refresh rejected / scope gone): link again.
            s.musicServices?.tidal.connected = false
            updateExport { $0.step = .connect; $0.note = m.isEmpty ? nil : m }
        case .serviceUnavailable("not_configured", let m):
            closePartyExport(force: true)
            showToast(ToastModel(text: m.isEmpty ? MusicExportCopy.notConfigured(p) : m, kind: .info))
            Task { await loadMusicServices() }
        case .unavailable:
            closePartyExport(force: true)
            s.musicServices = .off
            showToast(ToastModel(text: MusicExportCopy.unavailable, kind: .info))
        case .notFound:
            let id = s.partyExport?.partyID
            closePartyExport(force: true)
            if let id { Task { await loadParty(id, force: true) } }
            showToast(ToastModel(text: "No encontramos esa fiesta. Puede que ya no exista o que no seas parte de ella.", kind: .info))
        case .serviceUnavailable(_, let m):
            updateExport { $0.step = .failed; $0.failure = m.isEmpty ? MusicExportCopy.serviceFailed(p) : m }
        case .offline:
            updateExport { $0.step = .failed; $0.failure = MusicExportCopy.offline }
        case .rateLimited:
            updateExport { $0.step = .failed; $0.failure = "Demasiados intentos. Espera un momento y vuelve a intentarlo." }
        default:
            KuraLog.party.error("export \(p.rawValue, privacy: .public) failed: \(String(describing: e), privacy: .public)")
            updateExport { $0.step = .failed; $0.failure = MusicExportCopy.serviceFailed(p) }
        }
    }
}

#if DEBUG
extension AppStore {
    /// The captures (`PartyDebug`): a step drawn as-is, no task behind it.
    func debugPartyExport(_ flow: PartyExportFlow, services: MusicServices) {
        s.musicServices = services
        s.partyExport = flow
    }

    /// `-kuraExportRun`: the real flow over the mock (services first, like the sheet).
    /// `-kuraExportAutoConnect YES` taps "Conectar …" by itself when the flow lands on connect.
    func debugRunPartyExport(_ partyID: String, _ provider: MusicProvider) async {
        await loadMusicServices()
        startPartyExport(partyID, provider)
        guard UserDefaults.standard.bool(forKey: "kuraExportAutoConnect") else { return }
        try? await Task.sleep(for: .seconds(1))
        connectPartyExport()
    }
}
#endif
