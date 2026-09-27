import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// What the API marks unsupported, kept on this device (`LocalPrefs`).
extension AppStore {
    // MARK: Local prefs (what the API marks unsupported)

    private var local: LocalPrefs.Payload { get { s.local } _modify { yield &s.local } set { s.local = newValue } }

    func loadLocal() {
        local = prefs.load()
        s.localDirty = false
        recentSearches = local.recentSearches
        recentlyViewed = local.recentlyViewed
        alerts = Set(local.alerts)
        muted = Set(local.muted)
        showCommon = local.showCommon
        if let p = local.defaultPrivacy { defaultPrivacy = Privacy(rawValue: p) ?? .onlyMe }
    }

    /// The device-local view of a collection: how THIS phone sorts and lays it out. Pinned, cover
    /// and manual order come from the server now (`migrateLegacyCuration` moves the old ones up).
    func applyLocal(_ c: KCollection) -> KCollection {
        syncLocalIfDirty()
        guard let l = local.collections[c.id] else { return c }
        var out = c
        out.sort = l.sort
        out.layout = l.layout
        return out
    }

    func applyLocalEpisodes() {
        syncLocalIfDirty()
        for (id, eps) in local.watchedEpisodes where userTitles[id] != nil {
            userTitles[id]?.watchedEpisodes = Set(eps)
        }
    }

    /// Something device-local changed. Memory is the truth right away; the disk write is debounced
    /// (0.5 s) so a burst — `noteViewed` on every ficha, a drag reorder — is one write, off the tap.
    /// `sceneWentInactive` flushes early; an exit cancels it (the prefs are cleared anyway).
    func saveLocal() {
        guard prefs.enabled else { return }
        s.localDirty = true
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            self?.flushLocal()
        }
    }

    /// Writes the pending prefs now (no-op when nothing changed).
    func flushLocal() {
        saveTask?.cancel()
        saveTask = nil
        guard prefs.enabled, s.localDirty else { return }
        local = currentLocalPayload()
        s.localDirty = false
        prefs.save(local)
    }

    /// Rebuilds `local` from memory when memory is ahead of it (a read — `applyLocal` — must see
    /// the latest pin/cover/sort before the debounced write lands). Stays dirty: the disk still lags.
    private func syncLocalIfDirty() {
        guard s.localDirty else { return }
        local = currentLocalPayload()
    }

    private func currentLocalPayload() -> LocalPrefs.Payload {
        var p = LocalPrefs.Payload()
        p.recentSearches = recentSearches
        p.recentlyViewed = recentlyViewed
        p.alerts = Array(alerts).sorted()
        p.muted = Array(muted).sorted()
        p.showCommon = showCommon
        p.defaultPrivacy = defaultPrivacy.rawValue
        // Before the library loaded, `collections` / `userTitles` are empty (or a fragment): what
        // derives from them stays as it is on disk, or a recent search typed during the launch
        // would erase every pin and watched episode.
        guard s.libraryLoaded else {
            p.collections = local.collections
            p.watchedEpisodes = local.watchedEpisodes
            return p
        }
        for c in collections {
            var entry = LocalPrefs.Collection(sort: c.sort, layout: c.layout)
            // What an older build left for this collection rides along until it reached the server.
            if let old = local.collections[c.id] {
                entry.legacyPinned = old.legacyPinned
                entry.legacyCoverTitleID = old.legacyCoverTitleID
                entry.legacyOrder = old.legacyOrder
            }
            if entry != LocalPrefs.Collection() { p.collections[c.id] = entry }
        }
        for (id, state) in userTitles where !state.watchedEpisodes.isEmpty { p.watchedEpisodes[id] = Array(state.watchedEpisodes).sorted() }
        return p
    }

    // MARK: One-time migration (device-local curation → server)

    /// Older builds kept pinned, chosen cover and manual order on the device (the API had no model
    /// for them). Right after the first launch read that succeeds, whatever is still here goes up
    /// ONCE — `PATCH pinned` for the first pinned in the current order (one per account), `PATCH
    /// coverTitleId` for each chosen cover that's still a member, `PUT order` for each saved order —
    /// and is shown right away (memory is the truth). Once every write landed the keys are dropped
    /// and `curationMigrated` is set; a failure keeps them for the next launch (nothing lost).
    func migrateLegacyCuration() {
        guard prefs.enabled, !prefs.curationMigrated, s.libraryLoaded else { return }
        let legacy = local.collections.filter { $0.value.hasLegacy }
        guard !legacy.isEmpty else { prefs.curationMigrated = true; return }

        var pins: [(String, Bool)] = []
        var covers: [(String, String)] = []
        var orders: [(String, [String])] = []
        let winner = orderedCollections.first { legacy[$0.id]?.legacyPinned == true }?.id
        if let winner {
            for i in collections.indices { collections[i].pinned = collections[i].id == winner }
            pins.append((winner, true))
        }
        for i in collections.indices {
            let c = collections[i]
            guard let l = legacy[c.id] else { continue }
            if let order = l.legacyOrder {
                let present = Set(c.titleIDs)
                let known = order.filter { present.contains($0) }
                let placed = Set(known)
                // Titles added elsewhere after the order was saved stay on top (unplaced first).
                let merged = c.titleIDs.filter { !placed.contains($0) } + known
                if merged != c.titleIDs { collections[i].titleIDs = merged }
                orders.append((c.id, merged))
            }
            if let cover = l.legacyCoverTitleID, c.titleIDs.contains(cover) {
                collections[i].chosenCoverTitleID = cover
                covers.append((c.id, cover))
            }
        }
        let known = Set(collections.map(\.id))
        let api = self.api
        let session = s
        Task { [weak self] in
            var failed = false
            for (id, on) in pins {
                do { _ = try await api.setCollectionPinned(id: id, pinned: on) } catch { failed = true }
            }
            for (id, cover) in covers {
                do { _ = try await api.setCollectionCover(id: id, titleID: cover) } catch { failed = true }
            }
            for (id, order) in orders {
                do { _ = try await api.reorderCollection(id: id, titleIDs: order) } catch { failed = true }
            }
            guard let self, self.s === session, !failed else { return }
            // Everything is on the server: drop the leftovers (and those of collections gone meanwhile).
            for key in Array(self.local.collections.keys) {
                guard var e = self.local.collections[key], e.hasLegacy || !known.contains(key) else { continue }
                e.legacyPinned = nil; e.legacyCoverTitleID = nil; e.legacyOrder = nil
                self.local.collections[key] = e == LocalPrefs.Collection() ? nil : e
            }
            self.prefs.save(self.local)
            self.prefs.curationMigrated = true
        }
    }
}
