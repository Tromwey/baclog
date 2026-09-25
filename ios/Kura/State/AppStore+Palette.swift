import Foundation

/// Cover palettes filled on this device. `catalog_item.paletteHex` is extracted on-device, once,
/// by whoever shows the title first (AGENTS.md, the web does it on add and on view). A title that
/// only the app has ever shown arrives with `palette: []`, and everything tinted from it
/// (`Tint.card` / `Tint.header`) would fall back to gray `#6c6b76`.
///
/// So: the first `CoverView` that draws such a title extracts its cover (`CoverPalette`), the
/// store uses the hexes at once, and they go to the server by the channel that fits:
/// - a catalog title → `PUT /titles/{id}/palette` (the web's `cacheItemPaletteAction`);
/// - an `ext:` search result has no catalog id yet → the palette waits in `unsentPalettes` and
///   rides its membership PUT when it's saved (`syncAdd`).
/// The server writes only while its palette is still empty, and answers with the one that won.
extension AppStore {
    func fillPaletteIfNeeded(_ t: Title) {
        guard t.palette.isEmpty, titles[t.id]?.palette.isEmpty ?? true,
              let url = t.coverURL, paletteAttempts.insert(t.id).inserted else { return }
        let session = s
        Task { [weak self] in
            let hexes = await CoverPalette.extract(from: url)
            guard let self, !hexes.isEmpty, self.s === session else { return }
            self.applyLocalPalette(hexes, to: t)
            self.enqueuePaletteSend(hexes, for: t, session: session)
        }
    }

    /// ≤ 12 palette PUTs a minute, of the API's 60 writes/min shared with real actions. The hexes
    /// are already on screen; the server copy is for the next viewer, so it can wait.
    static let paletteSendGap: Duration = .seconds(5)

    private func enqueuePaletteSend(_ hexes: [String], for t: Title, session: SessionData) {
        let previous = paletteSendQueue
        paletteSendQueue = Task { [weak self] in
            await previous?.value
            guard let self, self.s === session, self.unsentPalettes[t.id] != nil else { return }
            guard await self.sendPalette(hexes, for: t, session: session) else { return }
            try? await Task.sleep(for: Self.paletteSendGap)
        }
    }

    private func applyLocalPalette(_ hexes: [String], to t: Title) {
        if titles[t.id] == nil {
            // Shown straight from a payload the store hasn't registered (a search row): register
            // it, or the tint would never see the hexes.
            var shown = t
            shown.palette = hexes
            registerPartial(shown)
        } else if titles[t.id]?.palette.isEmpty == true {
            titles[t.id]?.palette = hexes
        } else {
            return // a payload brought the server's palette meanwhile
        }
        unsentPalettes[t.id] = hexes
    }

    /// Whether a request went out (only then the queue waits the gap).
    private func sendPalette(_ hexes: [String], for t: Title, session: SessionData) async -> Bool {
        // `ext:` → no catalog id: its membership PUT carries the palette. Signed out → nothing to send with.
        guard !t.isExternal, ExternalRef.parse(localID: t.id) == nil, api.hasSession else { return false }
        do {
            let fresh = try await api.fillPalette(titleID: t.id, hexes: hexes)
            unsentPalettes[t.id] = nil
            // Someone else's extraction won the race: everyone reads theirs, so do we.
            if s === session, !fresh.palette.isEmpty, titles[t.id].map({ $0.palette != fresh.palette }) == true {
                titles[t.id]?.palette = fresh.palette
            }
        } catch {
            // A cosmetic cache fill: silent. The palette stays local (and in `unsentPalettes`, so
            // saving this title still sends it); the next launch tries again.
        }
        return true
    }
}
