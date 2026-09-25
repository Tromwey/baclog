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
        s.reorderedCollections = []
        recentSearches = local.recentSearches
        recentlyViewed = local.recentlyViewed
        alerts = Set(local.alerts)
        muted = Set(local.muted)
        showCommon = local.showCommon
        if let p = local.defaultPrivacy { defaultPrivacy = Privacy(rawValue: p) ?? .onlyMe }
    }

    func applyLocal(_ c: KCollection) -> KCollection {
        syncLocalIfDirty()
        guard let l = local.collections[c.id] else { return c }
        var out = c
        out.pinned = l.pinned
        out.coverTitleID = l.coverTitleID
        out.sort = l.sort
        out.layout = l.layout
        if let order = l.order {
            let present = Set(c.titleIDs)
            let known = order.filter { present.contains($0) }
            let placed = Set(known)
            out.titleIDs = known + c.titleIDs.filter { !placed.contains($0) }
        }
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
            // A manual order is only persisted for collections the user actually reordered here
            // (or that already had one saved): freezing the server's order for every collection
            // would push titles added on the web to the end.
            let keepsOrder = c.sort == .manual && (s.reorderedCollections.contains(c.id) || local.collections[c.id]?.order != nil)
            let entry = LocalPrefs.Collection(pinned: c.pinned, coverTitleID: c.coverTitleID, sort: c.sort, layout: c.layout,
                                              order: keepsOrder ? c.titleIDs : nil)
            if entry != LocalPrefs.Collection() { p.collections[c.id] = entry }
        }
        for (id, state) in userTitles where !state.watchedEpisodes.isEmpty { p.watchedEpisodes[id] = Array(state.watchedEpisodes).sorted() }
        return p
    }
}
