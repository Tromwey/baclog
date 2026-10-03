import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// Follow, mute, people and the feed: its reads (`loadFeed`, `loadPerson`, `loadPeopleList`…), the
/// follow write and what the feed shows.
extension AppStore {
    /// `GET /feed` + `GET /feed/suggestion`.
    func loadFeed(force: Bool = false) async {
        guard force || !feedLoaded, !feedLoading else { return }
        feedLoading = true
        loadErrors[.feed] = nil
        let session = s
        defer { session.feedLoading = false }
        do {
            async let page = api.feed(cursor: nil)
            // The suggestion card is an extra: its failure never takes the feed down with it.
            async let sug: FeedEvent? = try? await api.feedSuggestion()
            let first = try await page
            let suggestion = await sug
            try check(session)
            var events: [FeedEvent] = []
            FeedBursts.append(first.items.map(ingest), to: &events)
            feedCursor = first.nextCursor
            if let suggestion {
                events.insert(ingest(suggestion), at: min(3, events.count))
            }
            loaded(.feed)
            loadErrors[.feedMore] = nil
            var ids: [String] = []
            for e in events {
                if let id = e.titleID { ids.append(id) }
                if case .burst(_, let more) = e.kind { ids += more }
                if case .suggestion(_, _, _, let more) = e.kind { ids += more }
            }
            await hydrateTitles(ids, for: .feed)
            try check(session)
            feed = events
            feedLoaded = true
            feedFollowingKey = following
            feedDirty = false
        } catch {
            guard s === session else { return }
            fail(.feed, error)
        }
    }

    /// Next page when the stack nears its end. A failure doesn't retry on its own
    /// (every card appearing would hammer the API): the end of the stack offers Reintentar.
    /// A page can bring nothing you'd see (all muted, blocked or already there) while the cursor
    /// goes on: then the stack's last card never appears again to ask for more and the feed stalls.
    /// So one call keeps paging — at most `maxFeedPagesPerCall` — until something visible arrives.
    private static let maxFeedPagesPerCall = 3

    func loadMoreFeed(retry: Bool = false) async {
        guard feedCursor != nil, !feedLoading, retry || loadErrors[.feedMore] == nil else { return }
        feedLoading = true
        let session = s
        defer { session.feedLoading = false }
        var pages = 0
        while let cursor = feedCursor, pages < Self.maxFeedPagesPerCall {
            pages += 1
            do {
                let page = try await api.feed(cursor: cursor)
                try check(session)
                loaded(.feedMore)
                let events = page.items.map(ingest)
                feedCursor = page.nextCursor
                await hydrateTitles(events.compactMap(\.titleID), for: .feedMore)
                try check(session)
                let known = Set(feed.map(\.id))
                let fresh = events.filter { !known.contains($0.id) }
                let before = feed.count
                FeedBursts.append(fresh, to: &feed)
                // Only a NEW visible card ends the loop: a page that folded entirely into the last
                // burst adds no card to appear and ask for more, so keep paging.
                if feed[before...].contains(where: isVisible) { return }
            } catch {
                guard s === session else { return }
                fail(.feedMore, error)
                return
            }
        }
    }

    /// Registers what the event embeds and derives the display fields.
    private func ingest(_ event: FeedEvent) -> FeedEvent {
        var e = event
        if let t = e.embeddedTitle { register(t) }
        if let p = e.embeddedAuthor { register(p) }
        if let r = e.embeddedReview, review(r.id) == nil { setReviews(r.titleID, reviewList(r.titleID) + [r]) }
        if let at = e.at { e.ageHours = max(0, now.timeIntervalSince(at) / 3600) }
        if case .added(let col) = e.kind, let rd = e.releaseDate, rd > now {
            e.kind = .waitingAdd(collection: col, label: sentence(for: .day(KuraJSON.dayAtNoon(rd))))
        }
        return e
    }

    /// `GET /people/{handle}` (404 for private and nonexistent alike).
    func loadPerson(_ handle: String, force: Bool = false) async {
        guard handle != me.id, force || !loadedPeople.contains(handle), !loadingPeople.contains(handle) else { return }
        loadingPeople.insert(handle)
        let session = s
        defer { session.loadingPeople.remove(handle) }
        do {
            let p = try await api.person(handle: handle)
            try check(session)
            loaded(.person(handle))
            register(p)
            // Only this read says whether you blocked them; every other payload is silent.
            if p.isBlocked { blocked.insert(handle) } else { blocked.remove(handle) }
            await hydrateTitles(p.obsessions + p.common + p.collections.flatMap(\.titleIDs) + [p.featuredTitleID].compactMap { $0 },
                                for: .person(handle))
            try check(session)
            missingPeople.remove(handle)
            loadedPeople.insert(handle)
        } catch {
            guard s === session else { return }
            let e = fail(.person(handle), error)
            if case .notFound = e { missingPeople.insert(handle) }
        }
    }

    static func publicKey(handle: String, id: String) -> String { "\(handle)|\(id)" }

    /// `GET /people/{handle}/collections/{id}` — read-only. 404 for private and
    /// nonexistent alike (the screen never says which). The owner's `states` stay
    /// with the collection; they never touch your `userTitles`.
    func loadPublicCollection(handle: String, id: String, force: Bool = false) async {
        let key = AppStore.publicKey(handle: handle, id: id)
        guard force || publicCollections[key] == nil else { return }
        let session = s
        do {
            let d = try await api.personCollection(handle: handle, id: id)
            try check(session)
            loaded(.publicCollection(key))
            for t in d.titles { register(t) }
            missingPublicCollections.remove(key)
            publicCollections[key] = d
        } catch {
            guard s === session else { return }
            let e = fail(.publicCollection(key), error)
            if case .notFound = e {
                missingPublicCollections.insert(key)
                publicCollections[key] = nil
            }
        }
    }

    static func peopleListKey(of personID: String, following: Bool) -> String { "\(personID)|\(following ? "following" : "followers")" }

    /// Upper bound for walking one of your own lists (`me/following`, `me/followers`): 30 per page,
    /// so 1 500 people — past that the list is cut rather than looping on a server that misbehaves.
    private static let maxPeoplePages = 50

    /// Every page of one of YOUR lists (`GET /me/following` · `/me/followers`), until `nextCursor`
    /// is nil. `following` needs all of it: it decides Seguir/Siguiendo on every row of the app.
    ///
    /// `partial`: a page came with elements and none readable (`PeoplePage.unreadable` — a later
    /// page reads as empty instead of failing, `PageContract`). What was read is real but NOT the
    /// whole list: the caller marks it stale so the next visit / launch reads it again, instead
    /// of keeping for the session a `following` that misses people (their rows would say "Seguir").
    func allPeople(_ kind: PeopleKind) async throws -> (people: [Person], partial: Bool) {
        var out: [Person] = []
        var seen: Set<String> = []
        var cursor: String?
        var partial = false
        for _ in 0..<Self.maxPeoplePages {
            let page = try await api.people(kind: kind, cursor: cursor)
            if page.unreadable { partial = true }
            for p in page.items where seen.insert(p.id).inserted { out.append(p) }
            guard let next = page.nextCursor, next != cursor else { break }
            cursor = next
        }
        return (out, partial)
    }

    /// Followers / following of someone. YOUR lists come whole (every page of `me/followers|
    /// following`, `allPeople`); someone else's come a page at a time from
    /// `GET /people/{handle}/followers|following`, which answers by THEIR `followListsVisibility`
    /// (2026-09-27). When the profile already said `canSeeFollowLists: false` nothing is asked:
    /// the page says why with the counts (public) above it. A 403 `lists_private` (the setting
    /// changed since the profile loaded) lands in the same place; a 404 (they went private, or a
    /// block) says the list isn't available — identical for every cause, like the route.
    func loadPeopleList(of personID: String, following: Bool) async {
        let key = AppStore.peopleListKey(of: personID, following: following)
        // Kept for the session — until something this account did made it old (`stalePeopleLists`:
        // a follow / unfollow). Then the next visit re-reads it, with the old rows on screen meanwhile.
        guard peopleLists[key] == nil || s.stalePeopleLists.contains(key) else { return }
        s.stalePeopleLists.remove(key)
        let session = s
        let theirs = personID != me.id
        if theirs, let p = person(personID), p.canSeeFollowLists == false || isBlocked(personID) {
            peopleListMeta[key] = PeopleListMeta(denied: (p.followListsVisibility ?? .private).deniedNote)
            peopleLists[key] = []
            return
        }
        do {
            let items: [Person]
            if theirs {
                let page = try await api.people(kind: following ? .followingOf(personID) : .followersOf(personID), cursor: nil)
                try check(session)
                items = page.items
                peopleListMeta[key] = PeopleListMeta(nextCursor: page.nextCursor, anonymous: page.anonymousCount)
            } else {
                let all = try await allPeople(following ? .following : .followers)
                try check(session)
                items = all.people
                // Not the whole list: shown, and read again on the next visit.
                if all.partial { session.stalePeopleLists.insert(key) }
                if following { self.following.formUnion(items.map(\.id)) }
            }
            loaded(.peopleList(key))
            for p in items { register(p) }
            peopleLists[key] = items
        } catch {
            guard s === session else { return }
            switch (error as? KuraAPIError) {
            case .forbidden(let code) where code == "lists_private":
                loaded(.peopleList(key))
                let v = person(personID)?.followListsVisibility ?? .private
                peopleListMeta[key] = PeopleListMeta(denied: v.deniedNote)
                peopleLists[key] = []
            case .notFound:
                loaded(.peopleList(key))
                peopleListMeta[key] = PeopleListMeta(denied: "Esta lista no está disponible.")
                peopleLists[key] = []
            default:
                fail(.peopleList(key), error)
            }
        }
    }

    /// The next page of someone else's list (the rows' end reached it). One at a time. A failure
    /// doesn't retry on its own (the row appearing again would hammer the API): the end of the
    /// list offers Reintentar (`moreError`), like the feed's `feedMore`.
    func loadMorePeople(of personID: String, following: Bool, retry: Bool = false) async {
        let key = AppStore.peopleListKey(of: personID, following: following)
        guard let meta = peopleListMeta[key], let cursor = meta.nextCursor, !meta.loadingMore,
              retry || meta.moreError == nil else { return }
        let session = s
        peopleListMeta[key]?.loadingMore = true
        peopleListMeta[key]?.moreError = nil
        if retry { peopleListMeta[key]?.emptyPages = 0 }
        do {
            let page = try await api.people(kind: following ? .followingOf(personID) : .followersOf(personID), cursor: cursor)
            try check(session)
            // The list started over while this page was in flight (a follow made it stale, an
            // error reset it): this page continues a list that is no longer the one on screen.
            guard peopleListMeta[key]?.nextCursor == cursor, peopleLists[key] != nil else { return }
            for p in page.items { register(p) }
            let seen = Set((peopleLists[key] ?? []).map(\.id))
            let fresh = page.items.filter { !seen.contains($0.id) }
            peopleLists[key, default: []] += fresh
            // A server that hands back the same cursor would loop: stop there.
            let next = page.nextCursor == cursor ? nil : page.nextCursor
            peopleListMeta[key]?.nextCursor = next
            peopleListMeta[key]?.loadingMore = false
            // A page that adds nothing re-makes the sentinel (it is keyed by cursor), which asks
            // for the next one: after a few in a row it stops and the end offers Reintentar.
            let run = PageContract.emptyRun(peopleListMeta[key]?.emptyPages ?? 0, added: fresh.count)
            peopleListMeta[key]?.emptyPages = run
            if PageContract.stalled(emptyRun: run, hasNext: next != nil) {
                peopleListMeta[key]?.moreError = .server("")
            }
            online()
        } catch {
            guard s === session else { return }
            let e = noteError(error)
            // Same rule for a failure: it belongs to the list that asked.
            guard peopleListMeta[key]?.nextCursor == cursor else { return }
            peopleListMeta[key]?.loadingMore = false
            switch e {
            case .cancelled, .unauthorized:
                break
            case .forbidden, .notFound, .invalid:
                // The list isn't what it was (their setting changed, they went private, a block,
                // a cursor the server no longer takes): what's cached is no longer the truth.
                // Start over — the first page says which shape it is now.
                peopleLists[key] = nil
                peopleListMeta[key] = nil
                await loadPeopleList(of: personID, following: following)
            default:
                peopleListMeta[key]?.moreError = e
            }
        }
    }

    // MARK: Social

    func isFollowing(_ id: String) -> Bool { following.contains(id) }

    func toggleFollow(_ id: String) {
        KHaptic.play(.tap)
        setFollow(id, !following.contains(id))
    }

    /// Followed people who did something with this title. `GET /titles/{id}.following` already
    /// returns only people you follow, but that answer is as old as the last load: filtering by
    /// `following` (complete — every page of `me/following`) makes an unfollow take the person
    /// out of "gente que sigues" at once, and a Deshacer puts them back.
    func followedMarks(for titleID: String) -> [(Person, PeopleMark)] {
        (titleActivity[titleID] ?? []).compactMap { pm in
            guard following.contains(pm.personID), let p = people[pm.personID] else { return nil }
            return (p, pm)
        }
    }

    /// Follow from a profile: public → follow; private → "Solicitado" (see `requested`: ⚠️ no-op
    /// en live). Tapping Siguiendo unfollows at once with Deshacer (no confirmation).
    func followFromProfile(_ id: String) {
        guard let p = people[id], !blocked.contains(id) else { return }
        if following.contains(id) {
            setFollow(id, false)
            undoToast("Dejaste de seguir a @\(p.handle)") { [weak self] in self?.setFollow(id, true) }
        } else if p.isPrivate {
            // ⚠️ Solo mock / no-op en live: nunca llama a la API (el servidor solo deja seguir
            // perfiles públicos y no hay modelo de solicitudes). Ver `requested`.
            if requested.contains(id) { requested.remove(id) } else { requested.insert(id) }
            KHaptic.play(.tap)
        } else {
            toggleFollow(id)
        }
    }

    /// The one follow write: optimistic (`following`, `people[id].isFollowing` and `.followers`,
    /// your count), then `PUT/DELETE /me/following/{handle}` in order per handle. A failure puts it all back — unless
    /// a later tap already changed it again (that write is queued behind this one): a 404 says the
    /// profile isn't there to follow; anything retryable offers Reintentar.
    private func setFollow(_ id: String, _ on: Bool) {
        guard following.contains(id) != on else { return }
        applyFollow(id, on)
        let revert: @MainActor () -> Void = { [weak self] in
            guard let self, self.following.contains(id) == on else { return }
            self.applyFollow(id, !on)
        }
        sync(key: WriteKey.follow(id), gen: WriteKey.follow(id), onError: { [weak self] e in
            guard let self else { return true }
            guard self.following.contains(id) == on else { return true }
            revert()
            switch e {
            case .cancelled, .unauthorized:
                break
            case .notFound:
                self.showToast(ToastModel(text: "Ese perfil no existe o es privado.", kind: .info))
            default:
                let who = self.person(id).map { "@\($0.handle)" } ?? "este perfil"
                let text = e.toast(or: on ? "No se pudo seguir a \(who)." : "No se pudo dejar de seguir a \(who).")
                self.showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    self?.setFollow(id, on)
                })
            }
            return true
        }, revert: revert) { api in try await api.setFollowing(handle: id, following: on) }
    }

    private func applyFollow(_ id: String, _ on: Bool) {
        if on { following.insert(id) } else { following.remove(id) }
        // Their follower count moves with it (and back on a revert): the profile shows "12
        // seguidores" next to the button, and the next `GET /people/{handle}` brings the truth.
        if var p = people[id] {
            p.isFollowing = on
            p.followers = max(0, p.followers + (on ? 1 : -1))
            people[id] = p
        }
        me.followingCount = max(0, me.followingCount + (on ? 1 : -1))
        // "A quién sigues" and their "seguidores" changed: re-read on the next visit.
        s.stalePeopleLists.insert(AppStore.peopleListKey(of: me.id, following: true))
        s.stalePeopleLists.insert(AppStore.peopleListKey(of: id, following: false))
    }

    func toggleMute(_ id: String) {
        guard let p = people[id] else { return }
        let now = !muted.contains(id)
        if now { muted.insert(id) } else { muted.remove(id) }
        saveLocal()
        undoToast(now ? "@\(p.handle) ya no sale en tu feed" : "@\(p.handle) vuelve a tu feed") { [weak self] in
            if now { self?.muted.remove(id) } else { self?.muted.insert(id) }
            self?.saveLocal()
        }
    }

    func creator(_ name: String) -> Creator {
        #if DEBUG
        if KuraRuntime.usesMock, let c = MockData.creators[name] { return c }
        #endif
        let works = catalogOrder.compactMap { titles[$0] }.filter { $0.creator == name }
        let isMusic = works.contains { $0.format == .album }
        return Creator(name: name, role: isMusic ? "artista" : "director", works: max(works.count, 1))
    }

    /// Visible feed: nobody you muted.
    var visibleFeed: [FeedEvent] { feed.filter(isVisible) }

    private func isVisible(_ e: FeedEvent) -> Bool {
        if muted.contains(e.authorID) || blocked.contains(e.authorID) { return false }
        if case .suggestion(let pid, _, _, _) = e.kind, blocked.contains(pid) { return false }
        return true
    }

    /// ⚠️ Solo mock / no-op en live: aprobar o rechazar una solicitud de seguimiento (31a) solo
    /// cambia `requestStates` en memoria — no hay solicitudes en el servidor (solo se siguen
    /// perfiles públicos) y en live la lista `notifications` está siempre vacía, así que nadie
    /// llega aquí. Haría falta: el modelo de solicitudes y `PUT /me/follow-requests/{id}`.
    func setRequest(_ notificationID: String, _ state: RequestState) {
        requestStates[notificationID] = state
        KHaptic.play(.tap)
    }

    /// ⚠️ Solo mock / no-op en live: marca leídas las notificaciones locales; en live no hay
    /// ninguna (ver `notifications`) y nada se avisa al servidor. Haría falta
    /// `POST /me/notifications/read` una vez exista el modelo.
    func markNotificationsRead() {
        for i in notifications.indices { notifications[i].unread = false }
    }

    var hasUnread: Bool { notifications.contains(where: \.unread) }
}

/// Someone else's followers / following list, beyond its rows: the next page, how many more are
/// only a number (`anonymousCount`), and — when their setting keeps you out — the note to show.
struct PeopleListMeta: Equatable {
    var nextCursor: String? = nil
    var anonymous = 0
    var denied: String? = nil
    var loadingMore = false
    /// Later pages in a row that added no row (`PageContract.maxEmptyPages`).
    var emptyPages = 0
    /// The next page failed: the end of the list offers Reintentar (no auto-retry on scroll).
    var moreError: KuraAPIError? = nil
}
