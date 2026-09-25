import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// Per-resource reads: the launch (`bootstrap`), a collection, a ficha and its reviews, Descubrir,
/// search and the recap. Feed and people reads live in `AppStore+Social.swift`.
extension AppStore {
    // MARK: Loading

    func bootstrap(emptyLibrary: Bool = false, keepLoading: Bool = false) async {
        loadState = .loading
        loadErrors[.library] = nil
        let session = s
        do {
            async let m = api.me()
            async let cols = api.collections()
            async let states = api.myTitles()
            async let fol = allPeople(.following)
            let (account, library, myStates, followed) = try await (m, cols, states, fol)
            try check(session)
            loaded(.library)
            for p in followed { register(p) }
            following = Set(followed.map(\.id)).union(following)
            var merged = myStates
            for (id, s) in userTitles where merged[id] == nil { merged[id] = s }
            if emptyLibrary {
                collections = []
                userTitles = [:]
            } else {
                collections = library.map(applyLocal)
                for c in library { for t in c.embeddedTitles { register(t) } }
                userTitles = merged
                applyLocalEpisodes()
                lastUsedCollectionID = collections.first(where: \.pinned)?.id
            }
            s.libraryLoaded = true
            applyMe(account)
            // Still AWAITED before `.loaded`: the collection cards and "no puedo esperar" draw only
            // the titles they know (`titles(in:)` drops the missing ones), so flipping to `.loaded`
            // first would paint half-empty cards and the "Faltan títulos" strip for a beat.
            await hydrateTitles(Array(libraryIDs) + [account.featuredTitleID].compactMap { $0 }, for: .library)
            try check(session)
            if me.hexes.isEmpty, let id = me.featuredTitleID, let t = titles[id] { me.hexes = t.palette }
            if !keepLoading { loadState = .loaded }
        } catch {
            guard s === session else { return }
            // The launch failed (offline, 5xx): the collections tab shows the error with
            // Reintentar instead of a skeleton that never ends. 401 already went to the entrance.
            let e = fail(.library, error)
            if e == .unauthorized { return }
            if e == .cancelled {
                // The task went away mid-launch: never leave the skeleton up for good. Let the
                // next appearance start over, and meanwhile show Reintentar.
                didBootstrap = false
                guard phase == .main else { return }
                loadErrors[.library] = .server("cancelado")
                loadState = .failed
                return
            }
            if loadErrors[.library] == nil { loadErrors[.library] = e }
            loadState = .failed
        }
    }

    /// `GET /collections/{id}` — the titles and your states for one collection.
    func loadCollection(_ id: String, force: Bool = false) async {
        let id = canonicalCollectionID(id)
        guard force || !loadedCollections.contains(id), pendingCollections[id] == nil else { return }
        let session = s
        do {
            let d = try await api.collection(id: id)
            try check(session)
            loaded(.collection(id))
            for t in d.titles { register(t) }
            for (tid, s) in d.states where inflight[tid, default: 0] == 0 {
                var merged = s
                merged.watchedEpisodes = userTitles[tid]?.watchedEpisodes ?? []
                userTitles[tid] = merged
            }
            if let i = collections.firstIndex(where: { $0.id == id }) {
                var c = applyLocal(d.collection)
                c.pinned = collections[i].pinned
                if pendingRemovals(in: id).isEmpty { collections[i] = c } else {
                    collections[i].name = c.name
                    collections[i].privacy = c.privacy
                }
            } else {
                collections.append(applyLocal(d.collection))
            }
            loadedCollections.insert(id)
        } catch {
            guard s === session else { return }
            let e = fail(.collection(id), error)
            if case .notFound = e { collections.removeAll { $0.id == id } }
        }
    }

    /// `GET /titles/{id}` — the full ficha: state, people you follow, reviews.
    func loadTitle(_ id: String, force: Bool = false) async {
        guard ExternalRef.parse(localID: id) == nil else { return }
        guard force || !loadedTitles.contains(id), !loadingTitles.contains(id) else { return }
        loadingTitles.insert(id)
        let session = s
        defer { session.loadingTitles.remove(id) }
        do {
            let d = try await api.title(id: id)
            try check(session)
            loaded(.title(id))
            loadErrors[.moreReviews(id)] = nil
            register(d.title)
            if inflight[id, default: 0] == 0 {
                if let s = d.state {
                    var merged = s
                    merged.watchedEpisodes = userTitles[id]?.watchedEpisodes ?? []
                    userTitles[id] = merged
                } else if !isSaved(id) {
                    userTitles[id] = nil
                }
            }
            for pm in d.following { if let p = pm.person { register(p) } }
            titleActivity[id] = d.following
            for r in d.reviews { if let a = r.author { register(a) } }
            // Your optimistic review survives a read that raced its write; the rest is the server's.
            let writing = inflight[id, default: 0] > 0
            let kept = reviewList(id).filter { writing && $0.authorID == me.id }
            let keptIDs = Set(kept.map(\.id))
            setReviews(id, kept + d.reviews.filter { !keptIDs.contains($0.id) })
            reviewCursors[id] = d.reviewsCursor
            missingTitles.remove(id)
            loadedTitles.insert(id)
        } catch {
            guard s === session else { return }
            let e = fail(.title(id), error)
            if case .notFound = e { missingTitles.insert(id) }
        }
    }

    /// "Más reseñas": `GET /titles/{id}/reviews?cursor=` after `reviewCursors[id]` (pages of 10;
    /// your own review never comes back here — it's pinned in the ficha).
    func loadMoreReviews(_ id: String) async {
        guard let cursor = reviewCursors[id], !reviewsPaging.contains(id) else { return }
        reviewsPaging.insert(id)
        let session = s
        defer { session.reviewsPaging.remove(id) }
        do {
            let page = try await api.moreReviews(titleID: id, cursor: cursor)
            try check(session)
            loaded(.moreReviews(id))
            for r in page.items { if let a = r.author { register(a) } }
            let known = Set(reviewList(id).map(\.id))
            setReviews(id, reviewList(id) + page.items.filter { !known.contains($0.id) })
            reviewCursors[id] = page.nextCursor
        } catch {
            guard s === session else { return }
            switch fail(.moreReviews(id), error) {
            case .notFound:
                // The title itself is gone: nothing more to page.
                reviewCursors[id] = nil
            case .invalid:
                // The server rejected the cursor: retrying it would loop. Start over from the ficha.
                reviewCursors[id] = nil
                loadErrors[.moreReviews(id)] = nil
                await loadTitle(id, force: true)
            default:
                break // keeps the button; the ficha says it failed
            }
        }
    }

    /// `GET /discover`.
    func loadDiscover(force: Bool = false) async {
        guard force || discover == nil, !discoverLoading else { return }
        discoverLoading = true
        let session = s
        defer { session.discoverLoading = false }
        do {
            let d = try await api.discover()
            try check(session)
            loaded(.discover)
            for t in d.allTitles { register(t) }
            // `upcoming` = your library's titles with a release day still ahead (web's
            // `getLibraryUpcoming`). Its summaries carry no `release`, so seed the day here:
            // it's what "no puedo esperar" and the clock labels read.
            for u in d.upcoming {
                if let rd = u.releaseDate, titles[u.title.id]?.release == nil {
                    titles[u.title.id]?.release = .day(KuraJSON.dayAtNoon(rd))
                }
            }
            discover = d
        } catch {
            guard s === session else { return }
            fail(.discover, error)
        }
    }

    /// `GET /search` + `GET /people/search`, in parallel. Stale answers are dropped.
    func runSearch(_ q: String, kind: MediaFormat? = nil) async {
        let query = q.trimmingCharacters(in: .whitespaces)
        searchQuery = query
        guard !query.isEmpty else { searchResults = []; searchPeople = []; return }
        searchLoading = true
        searchError = nil
        let session = s
        defer { if session.searchQuery == query { session.searchLoading = false } }
        do {
            async let t = api.search(query, kind: kind)
            async let p = api.people(kind: .search(query), cursor: nil)
            let (results, page) = try await (t, p)
            try check(session)
            guard searchQuery == query else { return }
            online()
            for r in results { registerPartial(r.title) }
            for person in page.items { register(person) }
            searchResults = results
            searchPeople = page.items
        } catch {
            guard s === session, searchQuery == query else { return }
            searchError = noteError(error)
            searchResults = []
            searchPeople = []
        }
    }

    func clearSearch() {
        searchQuery = ""
        searchResults = []
        searchPeople = []
        searchError = nil
        searchLoading = false
    }

    /// `GET /recap/months` then `GET /recap/{era}` (the newest by default).
    func loadRecap(era: String? = nil) async {
        guard !recapLoading else { return }
        if let era, recaps[era] != nil { return }
        recapLoading = true
        let session = s
        defer { session.recapLoading = false }
        do {
            if recapMonths == nil {
                let months = try await api.recapMonths()
                try check(session)
                recapMonths = months
            }
            loaded(.recap)
            guard let target = era ?? recapMonths?.first?.era else { return }
            if recaps[target] == nil {
                let r = try await api.recap(era: target)
                try check(session)
                loaded(.recap)
                if let t = r.top { register(t) }
                for t in r.also { register(t) }
                recaps[target] = r
            }
        } catch {
            guard s === session else { return }
            fail(.recap, error)
        }
    }

    var currentRecap: RecapPayload? { recapMonths?.first.flatMap { recaps[$0.era] } }

    /// "recap de agosto" — the newest month, or the previous calendar month before it loads.
    /// "recap de septiembre" once the months arrive; "tu recap" before; nil (no button)
    /// when there's no month with activity yet.
    var recapButtonLabel: String? {
        guard let months = recapMonths else { return "tu recap" }
        guard let m = months.first else { return nil }
        return "recap de \(m.label.split(separator: " ").first ?? "")"
    }

    /// `GET /recap/months` alone (the profile button); the month itself loads in the recap.
    func loadRecapMonths() async {
        guard recapMonths == nil, !recapLoading else { return }
        let session = s
        do {
            let months = try await api.recapMonths()
            try check(session)
            recapMonths = months
        } catch {
            guard s === session else { return }
            noteError(error) // the button keeps "tu recap"; the recap screen has its own error state
        }
    }
}
