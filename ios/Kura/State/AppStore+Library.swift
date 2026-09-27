import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// Collection writes and title membership (add, remove with a deferred Deshacer, move, "Guardar
/// en…").
extension AppStore {
    // MARK: Collection writes

    /// The server id for a collection created optimistically (or the id itself).
    private func resolveCollectionID(_ id: String) async throws -> String {
        if let sid = s.collectionAliases[id] { return sid }
        guard let task = pendingCollections[id] else { return id }
        return try await task.value
    }

    /// The id a collection has NOW: a local id already adopted maps to the server's (forever, so
    /// a Deshacer or a sheet that captured the local id keeps working after the swap).
    func canonicalCollectionID(_ id: String) -> String { s.collectionAliases[id] ?? id }

    /// Swaps a temporary collection id for the one the server assigned.
    private func adopt(serverID: String, for localID: String) {
        guard serverID != localID else { return }
        s.collectionAliases[localID] = serverID
        // Pending removals and write queues keyed by the local id follow it to the server id, so
        // `cancelRemove` and the per-key ordering still match what's queued.
        let suffix = "|\(localID)"
        for (k, t) in deferredWrites where k.hasSuffix(suffix) {
            deferredWrites[k] = nil
            deferredWrites[String(k.dropLast(suffix.count)) + "|\(serverID)"] = t
        }
        for (k, c) in s.writeChains where k.hasSuffix(suffix) {
            s.writeChains[k] = nil
            s.writeChains[String(k.dropLast(suffix.count)) + "|\(serverID)"] = c
        }
        if let i = collections.firstIndex(where: { $0.id == localID }) {
            let c = collections[i]
            var moved = KCollection(id: serverID, name: c.name, vibe: c.vibe, titleIDs: c.titleIDs, privacy: c.privacy,
                                    pinned: c.pinned, chosenCoverTitleID: c.chosenCoverTitleID, fanTitleIDs: c.fanTitleIDs,
                                    sort: c.sort, layout: c.layout, createdAt: c.createdAt, addedAt: c.addedAt)
            moved.embeddedTitles = c.embeddedTitles
            collections[i] = moved
        }
        if lastUsedCollectionID == localID { lastUsedCollectionID = serverID }
        for tab in Tab.allCases {
            paths[tab] = paths[tab]?.map { r in
                switch r {
                case .collection(localID): return .collection(serverID)
                default: return r
                }
            }
        }
        if case .more(localID) = sheet { sheet = .more(serverID) }
        if case .addTitles(localID) = sheet { sheet = .addTitles(serverID) }
        if case .reorder(localID) = sheet { sheet = .reorder(serverID) }
        loadedCollections.insert(serverID)
    }

    @discardableResult
    func createCollection(name: String, privacy: Privacy, adding titleID: String? = nil) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalName = trimmed.isEmpty ? "colección nueva" : trimmed.lowercased()
        var c = KCollection(id: "c-\(UUID().uuidString.prefix(8))", name: finalName, titleIDs: [], privacy: privacy, createdAt: Date())
        if let titleID {
            c.titleIDs = [titleID]
            c.addedAt[titleID] = Date()
            ensureUserState(titleID)
        }
        collections.append(c)
        lastUsedCollectionID = c.id
        loadedCollections.insert(c.id)
        let localID = c.id
        let api = self.api
        let session = s
        // The POST alone: once it answered, the collection EXISTS on the server. The first title's
        // membership is a separate write (below) whose Reintentar retries only the membership
        // against the server id — never the POST again, which would leave a duplicate collection.
        let task = Task<String, Error> { [weak self] in
            let created = try await api.createCollection(name: finalName, privacy: privacy)
            if let self, self.s === session { self.adopt(serverID: created.id, for: localID) }
            return created.id
        }
        pendingCollections[localID] = task
        Task { [weak self] in
            do {
                let sid = try await task.value
                guard let self, self.s === session else { return }
                self.pendingCollections[localID] = nil
                self.online()
                // Only if it's still there: a quick Quitar before the POST answered wins.
                if let titleID, self.collection(sid)?.titleIDs.contains(titleID) == true {
                    self.syncAdd(titleID, to: sid)
                }
            } catch {
                guard let self, self.s === session else { return }
                self.pendingCollections[localID] = nil
                let e = self.noteError(error)
                self.collections.removeAll { $0.id == localID }
                if let titleID { self.gcUserState(titleID) }
                guard e != .cancelled, e != .unauthorized else { return }
                self.showToast(ToastModel(text: e.toast, kind: .retry) { [weak self] in
                    self?.createCollection(name: finalName, privacy: privacy, adding: titleID)
                })
            }
        }
        return c.id
    }

    private func update(_ id: String, _ change: (inout KCollection) -> Void) {
        let id = canonicalCollectionID(id)
        guard let i = collections.firstIndex(where: { $0.id == id }) else { return }
        change(&collections[i])
    }

    /// `PATCH /collections/{id}` for a name / frase (vibe) edit or a privacy change. On ANY failure
    /// the collection goes back to what it was (the server kept it) — only if it still shows what
    /// this write set, so a later edit isn't undone. A rejected value (400) says why; anything else
    /// offers Reintentar, which applies the change again and resends it.
    ///
    /// `vibe` is `nil` = untouched, `""` = cleared (the server stores an empty frase as `null`),
    /// so the wire never needs an explicit `null`. `old.vibe` uses the same convention.
    private func syncCollection(_ id: String, name: String? = nil, vibe: String? = nil, privacy: Privacy? = nil,
                                was old: (name: String?, vibe: String?, privacy: Privacy?)) {
        sync(key: WriteKey.collection(canonicalCollectionID(id)), onError: { [weak self] e in
            guard let self else { return true }
            self.update(id) { c in
                if let name, c.name == name, let o = old.name { c.name = o }
                if let vibe, (c.vibe ?? "") == vibe, let o = old.vibe { c.vibe = o.isEmpty ? nil : o }
                if let privacy, c.privacy == privacy, let o = old.privacy { c.privacy = o }
            }
            switch e {
            case .cancelled, .unauthorized, .notFound, .unsupported:
                return true
            case .invalid:
                self.showToast(ToastModel(text: e.toast, kind: .info))
            default:
                self.showToast(ToastModel(text: e.toast, kind: .retry) { [weak self] in
                    guard let self, self.collection(id) != nil else { return }
                    self.dismissToast()
                    self.update(id) { c in
                        if let name { c.name = name }
                        if let vibe { c.vibe = vibe.isEmpty ? nil : vibe }
                        if let privacy { c.privacy = privacy }
                    }
                    self.syncCollection(id, name: name, vibe: vibe, privacy: privacy, was: old)
                })
            }
            return true
        }) { [weak self] api in
            let sid = try await self?.resolveCollectionID(id) ?? id
            _ = try await api.updateCollection(id: sid, name: name, vibe: vibe, privacy: privacy)
        }
    }

    /// Límites del servidor (`backlogNameSchema` / `backlogVibeSchema` en
    /// `src/modules/backlog/collections.ts`): nombre 1–60, frase ≤ 80, ambos recortados.
    static let collectionNameLimit = 60
    static let collectionVibeLimit = 80

    /// Editar (O2b, nombre + frase): one optimistic write for whatever changed, one Deshacer that
    /// puts both back. An empty frase clears it. The name keeps the lowercase rule of creation.
    func editCollection(_ id: String, name: String, vibe: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let c = collection(id) else { return }
        let newName = String(trimmed.lowercased().prefix(Self.collectionNameLimit))
        let newVibe = String(vibe.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.collectionVibeLimit))
        let oldName = c.name, oldVibe = c.vibe ?? ""
        let nameChanged = newName != oldName, vibeChanged = newVibe != oldVibe
        guard nameChanged || vibeChanged else { return }
        let n = nameChanged ? newName : nil, v = vibeChanged ? newVibe : nil
        update(id) { c in
            if let n { c.name = n }
            if let v { c.vibe = v.isEmpty ? nil : v }
        }
        syncCollection(id, name: n, vibe: v, was: (oldName, oldVibe, nil))
        undoToast(vibeChanged ? "Guardada" : "Renombrada") { [weak self] in
            self?.update(id) { c in
                if nameChanged { c.name = oldName }
                if vibeChanged { c.vibe = oldVibe.isEmpty ? nil : oldVibe }
            }
            self?.syncCollection(id, name: nameChanged ? oldName : nil, vibe: vibeChanged ? oldVibe : nil,
                                 was: (n, v, nil))
        }
    }

    func setPrivacy(_ id: String, _ p: Privacy) {
        guard let old = collection(id)?.privacy, old != p else { return }
        update(id) { $0.privacy = p }
        syncCollection(id, privacy: p, was: (nil, nil, old))
        undoToast("Ahora la ve: \(p.label.lowercased())") { [weak self] in
            self?.update(id) { $0.privacy = old }
            self?.syncCollection(id, privacy: old, was: (nil, nil, p))
        }
    }

    // MARK: Curation (pinned, cover, manual order) — on the server since the curation contract

    /// A write to this collection (rename, privacy, cover, order) is queued or in flight: a read
    /// that lands meanwhile is older than what's on screen.
    func collectionWriteInFlight(_ id: String) -> Bool {
        s.writeChains[s.canonicalWriteKey(WriteKey.collection(canonicalCollectionID(id)))] != nil
    }

    /// A pin write is queued or in flight (one per account: it moves the pin between collections).
    var pinWriteInFlight: Bool { s.writeChains[WriteKey.pin] != nil }

    /// The optimistic write pattern of the curation: on ANY failure the collection goes back to
    /// what it was (only while it still shows what this write set); a rejected value (400) says
    /// why; anything else offers Reintentar, which applies the change again and resends it.
    private func syncCuration(_ id: String, key: String,
                              stillOurs: @escaping (KCollection) -> Bool,
                              revert: @escaping () -> Void,
                              reapply: @escaping () -> Void,
                              _ op: @escaping @Sendable (KuraAPI, String) async throws -> Void) {
        sync(key: key, onError: { [weak self] e in
            guard let self else { return true }
            if let c = self.collection(id), stillOurs(c) { revert() }
            switch e {
            case .cancelled, .unauthorized, .notFound, .unsupported:
                return true
            case .invalid:
                self.showToast(ToastModel(text: e.toast, kind: .info))
            default:
                self.showToast(ToastModel(text: e.toast, kind: .retry) { [weak self] in
                    guard let self, self.collection(id) != nil else { return }
                    self.dismissToast()
                    reapply()
                })
            }
            return true
        }) { [weak self] api in
            let sid = try await self?.resolveCollectionID(id) ?? id
            try await op(api, sid)
        }
    }

    /// Fijar / Desfijar. One pinned per account: pinning this one unpins the rest, here and on the
    /// server (`PATCH { pinned }`). Deshacer puts the pin back where it was.
    func togglePin(_ id: String) {
        guard let c = collection(id) else { return }
        let before = collections.first(where: \.pinned)?.id
        setPinned(c.id, !c.pinned)
        KHaptic.play(.tap)
        let pinned = !c.pinned
        undoToast(pinned ? "Fijada" : "Ya no está fijada") { [weak self] in
            guard let self else { return }
            if let before { self.setPinned(before, true) } else { self.setPinned(c.id, false) }
        }
    }

    private func setPinned(_ id: String, _ pinned: Bool) {
        let id = canonicalCollectionID(id)
        let snapshot = Dictionary(uniqueKeysWithValues: collections.map { ($0.id, $0.pinned) })
        for i in collections.indices {
            if collections[i].id == id { collections[i].pinned = pinned } else if pinned { collections[i].pinned = false }
        }
        syncCuration(id, key: WriteKey.pin,
                     stillOurs: { $0.pinned == pinned },
                     revert: { [weak self] in
                         guard let self else { return }
                         for i in self.collections.indices { self.collections[i].pinned = snapshot[self.collections[i].id] ?? false }
                     },
                     reapply: { [weak self] in self?.setPinned(id, pinned) }) { api, sid in
            _ = try await api.setCollectionPinned(id: sid, pinned: pinned)
        }
    }

    /// "Usar como portada" (a member) / "Portada automática" (nil): `PATCH { coverTitleId }`.
    func setCover(_ id: String, titleID: String?) {
        guard let c = collection(id) else { return }
        let old = c.chosenCoverTitleID
        guard old != titleID else { return }
        writeCover(c.id, titleID, was: old)
        undoToast(titleID == nil ? "Portada automática" : "Nueva portada") { [weak self] in
            self?.writeCover(c.id, old, was: titleID)
        }
    }

    private func writeCover(_ id: String, _ titleID: String?, was old: String?) {
        update(id) { $0.chosenCoverTitleID = titleID }
        syncCuration(id, key: WriteKey.collection(canonicalCollectionID(id)),
                     stillOurs: { $0.chosenCoverTitleID == titleID },
                     revert: { [weak self] in self?.update(id) { $0.chosenCoverTitleID = old } },
                     reapply: { [weak self] in self?.writeCover(id, titleID, was: old) }) { api, sid in
            _ = try await api.setCollectionCover(id: sid, titleID: titleID)
        }
    }

    /// Reordenar › Guardar orden: the WHOLE manual order at once (`PUT /collections/{id}/order`),
    /// and the view goes back to Manual. Titles that came or went while the sheet was open keep
    /// their place: new ones on top (unplaced first), gone ones dropped.
    ///
    /// The new #1 LEADS the fan (founder, 2026-09-27: "el nuevo ítem 1 debería estar en el lugar
    /// central del abanico y repintarlo"). The fan puts a chosen cover in front of the order, so
    /// a new order whose #1 isn't the chosen cover also sends the cover back to automatic — in the
    /// same optimistic beat, so the fan and the gradient repaint at once. Same write key as the
    /// order: the two PATCH/PUT go out in sequence, each with its own rollback.
    func reorder(_ id: String, to order: [String]) {
        guard let c = collection(id) else { return }
        let present = Set(c.titleIDs)
        let kept = order.filter { present.contains($0) }
        let placed = Set(kept)
        let final = c.titleIDs.filter { !placed.contains($0) } + kept
        let old = c.titleIDs
        update(id) { $0.sort = .manual }
        saveLocal()
        guard final != old else { return }
        if let cover = c.chosenCoverTitleID, cover != final.first {
            writeCover(c.id, nil, was: cover)
        }
        writeOrder(c.id, final, was: old)
    }

    private func writeOrder(_ id: String, _ order: [String], was old: [String]) {
        update(id) { $0.titleIDs = order }
        syncCuration(id, key: WriteKey.collection(canonicalCollectionID(id)),
                     stillOurs: { $0.titleIDs == order },
                     revert: { [weak self] in self?.update(id) { $0.titleIDs = old } },
                     reapply: { [weak self] in self?.writeOrder(id, order, was: old) }) { api, sid in
            _ = try await api.reorderCollection(id: sid, titleIDs: order)
        }
    }

    func setSort(_ id: String, _ s: SortMode) { update(id) { $0.sort = s }; saveLocal() }
    func setLayout(_ id: String, _ l: CollectionLayout) { update(id) { $0.layout = l }; saveLocal() }
    /// Opciones' "Ver como lista / Ver en columnas": flips the layout the collection has NOW, read
    /// from the store at tap time. The row used to compute it from the `c` its sheet captured when
    /// it last rendered; a stale copy writes the value already on screen and every later tap lands
    /// one step behind (founder, 2026-09-27). One source of truth: `collections[i].layout`.
    func toggleLayout(_ id: String) {
        guard let c = collection(id) else { return }
        setLayout(id, c.layout == .list ? .covers : .list)
    }

    func deleteCollection(_ id: String) {
        let id = canonicalCollectionID(id)
        collections.removeAll { $0.id == id }
        for tab in Tab.allCases {
            paths[tab]?.removeAll { r in
                if case .collection(let cid) = r { return cid == id }
                return false
            }
        }
        for (key, task) in deferredWrites where key.hasSuffix("|\(id)") { task.cancel(); deferredWrites[key] = nil }
        sync(key: WriteKey.collection(id)) { [weak self] api in
            let sid = try await self?.resolveCollectionID(id) ?? id
            try await api.deleteCollection(id: sid)
        }
        saveLocal()
        showToast(ToastModel(text: "Colección borrada", kind: .info))
    }

    // MARK: Title membership

    func ensureUserState(_ titleID: String) {
        if userTitles[titleID] == nil { userTitles[titleID] = UserTitleState(savedAt: Date()) }
    }

    /// A title leaving its LAST collection loses its state too: the server GCs `user_item` on that
    /// remove (`removeTitleFromBacklog`). Deleting a whole collection doesn't, and neither does a
    /// title marked without ever being saved: those stay in `libraryIDs` with no collection.
    private func gcUserState(_ titleID: String) {
        if !isSaved(titleID) {
            userTitles[titleID] = nil
            let mine = me.id
            removeReviews(of: titleID) { $0.authorID == mine }
        }
    }

    /// The membership response: the real (cached) title and the server state.
    private func absorb(_ r: MembershipResult, localID: String) {
        if r.title.id != localID { remapExternal(localID, to: r.title) } else { register(r.title) }
        if let s = r.state, inflight[r.title.id, default: 0] <= 1 {
            var merged = s
            merged.watchedEpisodes = userTitles[r.title.id]?.watchedEpisodes ?? []
            if let local = userTitles[r.title.id], local.mark != merged.mark, inflight[r.title.id, default: 0] > 0 { return }
            userTitles[r.title.id] = merged
        }
    }

    /// An external search result became a real catalog item: move everything over.
    private func remapExternal(_ localID: String, to real: Title) {
        register(real)
        titles[localID] = nil
        catalogOrder.removeAll { $0 == localID }
        for i in collections.indices {
            collections[i].titleIDs = collections[i].titleIDs.map { $0 == localID ? real.id : $0 }
            if let d = collections[i].addedAt.removeValue(forKey: localID) { collections[i].addedAt[real.id] = d }
            if collections[i].chosenCoverTitleID == localID { collections[i].chosenCoverTitleID = real.id }
            collections[i].fanTitleIDs = collections[i].fanTitleIDs.map { $0 == localID ? real.id : $0 }
        }
        if let s = userTitles.removeValue(forKey: localID), userTitles[real.id] == nil { userTitles[real.id] = s }
        recentlyViewed = recentlyViewed.map { $0 == localID ? real.id : $0 }
        onboardingPicks = onboardingPicks.map { $0 == localID ? real.id : $0 }
        for tab in Tab.allCases {
            paths[tab] = paths[tab]?.map { if case .title(localID) = $0 { return .title(real.id) } else { return $0 } }
        }
        switch sheet {
        case .saveTo(localID): sheet = .saveTo(real.id)
        case .complete(localID, let f): sheet = .complete(titleID: real.id, focusReview: f)
        case .titleMore(localID): sheet = .titleMore(real.id)
        default: break
        }
    }

    private func syncAdd(_ titleID: String, to collectionID: String) {
        let session = s
        sync(key: WriteKey.membership(titleID, canonicalCollectionID(collectionID)), titleID: titleID) { [weak self] api in
            let store = self
            let cid = try await store?.resolveCollectionID(collectionID) ?? collectionID
            let palette = await MainActor.run { store?.unsentPalettes[titleID] }
            let r = try await api.createTitleMembership(collectionID: cid, ref: TitleRef.from(localID: titleID), paletteHex: palette)
            await MainActor.run {
                // The server now has a palette (ours, or the one that beat it): nothing left to send.
                if palette != nil { store?.unsentPalettes[titleID] = nil }
                store?.on(session) { store?.absorb(r, localID: titleID) }
            }
        }
    }

    private func syncRemove(_ titleID: String, from collectionID: String) {
        sync(key: WriteKey.membership(titleID, canonicalCollectionID(collectionID)), titleID: titleID) { [weak self] api in
            let cid = try await self?.resolveCollectionID(collectionID) ?? collectionID
            try await api.removeTitleMembership(collectionID: cid, titleID: titleID)
        }
    }

    /// Removals wait for the Deshacer window (`undoWindow`, 5 s / 15 s with VoiceOver): undoing never round-trips,
    /// and the server keeps the title's state until the window closes.
    private func deferRemove(_ titleID: String, from collectionID: String) {
        let key = removalKey(titleID, collectionID)
        deferredWrites[key]?.cancel()
        let window = Self.undoWindow
        deferredWrites[key] = Task { [weak self] in
            try? await Task.sleep(for: window)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self else { return }
                // Recomputed: `adopt` may have moved the entry to the server id meanwhile.
                self.deferredWrites[self.removalKey(titleID, collectionID)] = nil
                self.syncRemove(titleID, from: collectionID)
            }
        }
    }

    /// `deferredWrites` key: title + the collection's CURRENT id (see `adopt`).
    private func removalKey(_ titleID: String, _ collectionID: String) -> String {
        "\(titleID)|\(canonicalCollectionID(collectionID))"
    }

    /// Cancels a pending removal; true when there was one (nothing to re-add on the server).
    @discardableResult
    private func cancelRemove(_ titleID: String, from collectionID: String) -> Bool {
        let key = removalKey(titleID, collectionID)
        guard let t = deferredWrites[key] else { return false }
        t.cancel()
        deferredWrites[key] = nil
        return true
    }

    func pendingRemovals(in collectionID: String) -> [String] {
        let collectionID = canonicalCollectionID(collectionID)
        return deferredWrites.keys.filter { $0.hasSuffix("|\(collectionID)") }.map { String($0.split(separator: "|")[0]) }
    }

    func add(_ titleID: String, to collectionID: String, toast: Bool = true) {
        let collectionID = canonicalCollectionID(collectionID)
        guard let c = collection(collectionID), !c.titleIDs.contains(titleID) else { return }
        let hadState = userTitles[titleID]
        ensureUserState(titleID)
        update(collectionID) { $0.titleIDs.insert(titleID, at: 0); $0.addedAt[titleID] = Date() }
        lastUsedCollectionID = collectionID
        if !cancelRemove(titleID, from: collectionID) { syncAdd(titleID, to: collectionID) }
        KHaptic.play(.tap)
        if toast {
            undoToast("Agregado a \(c.name)") { [weak self] in
                self?.update(collectionID) { $0.titleIDs.removeAll { $0 == titleID } }
                self?.syncRemove(titleID, from: collectionID)
                if hadState == nil { self?.gcUserState(titleID) }
            }
        }
    }

    /// Silent inverse used by the add sheet's ✓ → + toggle.
    func removeSilently(_ titleID: String, from collectionID: String) {
        let collectionID = canonicalCollectionID(collectionID)
        update(collectionID) { $0.titleIDs.removeAll { $0 == titleID } }
        syncRemove(titleID, from: collectionID)
        gcUserState(titleID)
    }

    func remove(_ titleID: String, from collectionID: String) {
        let collectionID = canonicalCollectionID(collectionID)
        guard let c = collection(collectionID), let idx = c.titleIDs.firstIndex(of: titleID) else { return }
        let state = userTitles[titleID]
        let myReviews = reviewList(titleID).filter { $0.authorID == me.id }
        update(collectionID) { $0.titleIDs.remove(at: idx) }
        gcUserState(titleID)
        deferRemove(titleID, from: collectionID)
        undoToast("Quitado de \(c.name)") { [weak self] in
            guard let self else { return }
            self.cancelRemove(titleID, from: collectionID)
            self.update(collectionID) { $0.titleIDs.insert(titleID, at: min(idx, $0.titleIDs.count)) }
            if self.userTitles[titleID] == nil { self.userTitles[titleID] = state }
            let back = myReviews.filter { self.review($0.id) == nil }
            if !back.isEmpty { self.setReviews(titleID, self.reviewList(titleID) + back) }
        }
    }

    func move(_ titleID: String, from fromID: String, to toID: String) {
        let fromID = canonicalCollectionID(fromID), toID = canonicalCollectionID(toID)
        guard fromID != toID, let from = collection(fromID), let to = collection(toID),
              let idx = from.titleIDs.firstIndex(of: titleID) else { return }
        let alreadyThere = to.titleIDs.contains(titleID)
        update(fromID) { $0.titleIDs.remove(at: idx) }
        if !alreadyThere {
            update(toID) { $0.titleIDs.insert(titleID, at: 0); $0.addedAt[titleID] = Date() }
            if !cancelRemove(titleID, from: toID) { syncAdd(titleID, to: toID) }
        }
        deferRemove(titleID, from: fromID)
        lastUsedCollectionID = toID
        KHaptic.play(.tap)
        undoToast("Movido a \(to.name)") { [weak self] in
            guard let self else { return }
            self.cancelRemove(titleID, from: fromID)
            if !alreadyThere {
                self.update(toID) { $0.titleIDs.removeAll { $0 == titleID } }
                self.syncRemove(titleID, from: toID)
            }
            self.update(fromID) { $0.titleIDs.insert(titleID, at: min(idx, $0.titleIDs.count)) }
        }
    }

    /// "Guardar en": sets the exact membership of a title.
    func setMembership(_ titleID: String, collections ids: Set<String>) {
        let ids = Set(ids.map(canonicalCollectionID))
        let before = Set(collectionsContaining(titleID).map(\.id))
        guard before != ids else { return }
        let hadState = userTitles[titleID]
        if !ids.isEmpty { ensureUserState(titleID) }
        let added = ids.subtracting(before)
        let removed = before.subtracting(ids)
        for id in added {
            update(id) { $0.titleIDs.insert(titleID, at: 0); $0.addedAt[titleID] = Date() }
            if !cancelRemove(titleID, from: id) { syncAdd(titleID, to: id) }
        }
        for id in removed {
            update(id) { $0.titleIDs.removeAll { $0 == titleID } }
            deferRemove(titleID, from: id)
        }
        if let first = added.first { lastUsedCollectionID = first }
        KHaptic.play(.tap)
        if before.isEmpty && !ids.isEmpty, notifyReleases, let t = titles[titleID], isUnreleased(t) {
            ReleaseNotifier.schedule(t)
        }
        gcUserState(titleID)
        let text: String
        if ids.isEmpty {
            text = "Ya no está guardado"
        } else if ids.count == 1, let c = collection(ids.first!) {
            text = "Guardado en \(c.name)"
        } else {
            text = "Guardado en \(ids.count) colecciones"
        }
        undoToast(text) { [weak self] in
            guard let self else { return }
            for id in added {
                self.update(id) { $0.titleIDs.removeAll { $0 == titleID } }
                self.syncRemove(titleID, from: id)
            }
            for id in removed {
                self.cancelRemove(titleID, from: id)
                self.update(id) { $0.titleIDs.insert(titleID, at: 0) }
            }
            self.userTitles[titleID] = hadState
        }
    }
}
