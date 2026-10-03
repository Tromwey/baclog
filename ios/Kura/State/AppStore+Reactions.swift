import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// Marks (Completar · Me gusta · Me obsesiona), reviews and watched episodes.
extension AppStore {
    // MARK: Reactions

    func setMark(_ titleID: String, _ mark: Mark?, haptic: Bool = true, preview: Bool = false) {
        // An `ext:` search result isn't in the catalog until it's saved: nothing to mark yet.
        if ExternalRef.parse(localID: titleID) != nil { askToSaveFirst(titleID); return }
        let previous = userTitles[titleID]?.mark
        let hadState = userTitles[titleID] != nil
        ensureUserState(titleID)
        userTitles[titleID]?.mark = mark
        holdOwnReview(titleID, for: mark)
        if haptic { KHaptic.play(.reaction(mark)) }
        let session = s
        // The optimistic state goes (only while it's still this write's): an unsaved title leaves
        // the library it had just entered; a saved one gets its previous mark back. The review
        // the mark took off the screen comes back with it: the server never deleted it.
        let revert: @MainActor () -> Void = { [weak self] in
            guard let self, self.s === session else { return }
            self.restoreHeldReview(titleID)
            guard let state = self.userTitles[titleID], state.mark == mark else { return }
            if hadState { self.userTitles[titleID]?.mark = previous } else if !self.isSaved(titleID) { self.userTitles[titleID] = nil }
        }
        sync(key: WriteKey.mark(titleID), gen: WriteKey.mark(titleID), titleID: titleID, onError: { [weak self] e in
            guard let self else { return true }
            // Neither is retryable.
            // "Todavía no sale": say so.
            if case .conflict(let code, _) = e, code == "not_released" {
                revert()
                self.showToast(ToastModel(text: e.toast, kind: .info))
                return true
            }
            // The catalog doesn't know this id (a mark on an unsaved title now CREATES your state,
            // so a 404 means the title itself is gone).
            if case .notFound = e {
                revert()
                self.showToast(ToastModel(text: AppStore.unknownTitleNote, kind: .info))
                return true
            }
            return false
        }, revert: revert) { [weak self] api in
            let store = self
            let s = try await api.setMark(titleID: titleID, mark: mark, preview: preview)
            await MainActor.run {
                guard let self = store, self.s === session else { return }
                // Before the "still this mark" guard: what the server did to the review is true
                // whatever the screen shows now.
                self.markLanded(titleID, mark: mark, reviewID: s.reviewID)
                guard self.userTitles[titleID]?.mark == mark else { return }
                self.userTitles[titleID]?.savedAt = s.savedAt
                // The ficha's "obsesionados / completos" are server aggregates (formatted "12,4 k"):
                // re-read them instead of guessing +1/−1.
                if self.loadedTitles.contains(titleID) { Task { await self.loadTitle(titleID, force: true) } }
                // Marked from a ficha you hadn't saved: the mark stands on its own (the title is in
                // your library, in no collection); "Guardar en…" is only a suggestion.
                if mark != nil { self.suggestSaving(titleID) }
            }
        }
    }

    // MARK: The review goes with the reaction (`ReviewHold`)

    /// You have a review of this title (its text loaded, or only its id from `GET /me/titles`).
    func hasOwnReview(_ titleID: String) -> Bool {
        myReview(titleID) != nil || userTitles[titleID]?.reviewID != nil
    }

    /// Whether `hasOwnReview` can be trusted: your library state (`GET /me/titles`, which carries
    /// `reviewId`) or the title's ficha has been read this session. An `ext:` result has no review.
    func ownReviewKnown(_ titleID: String) -> Bool {
        ExternalRef.parse(localID: titleID) != nil || s.libraryLoaded || loadedTitles.contains(titleID)
    }

    /// Before a mark that would delete a review: reads the ficha if nothing says yet whether you
    /// have one. Returns with the answer known, or with the read failed (`ownReviewKnown` false).
    func ensureOwnReviewKnown(_ titleID: String) async {
        guard !ownReviewKnown(titleID) else { return }
        let session = s
        while s === session, loadingTitles.contains(titleID) { try? await Task.sleep(for: .milliseconds(60)) }
        guard s === session, !ownReviewKnown(titleID) else { return }
        await loadTitle(titleID)
    }

    /// The optimistic half: a mark that leaves no reaction takes your review off the screen and
    /// holds it until the server answers.
    private func holdOwnReview(_ titleID: String, for mark: Mark?) {
        guard ReviewHold<Review>.leavesNoReaction(mark?.rawValue) else { return }
        let me = self.me.id
        let mine = reviewList(titleID).filter { $0.authorID == me }
        s.reviewHold.take(titleID, reviews: mine, reviewID: userTitles[titleID]?.reviewID)
        guard s.reviewHold.isHolding(titleID) else { return }
        removeReviews(of: titleID) { $0.authorID == me }
        userTitles[titleID]?.reviewID = nil
        // "Reseñaste" leaves your feed with it, and comes back with it.
        // Appended: a second mark before any answer finds the first hold standing.
        s.heldReviewEvents[titleID, default: []] += takeOwnReviewEvents(titleID)
    }

    /// Your "Reseñaste" events of a title leave the feed; what's returned puts them back in place.
    func takeOwnReviewEvents(_ titleID: String) -> [(index: Int, event: FeedEvent)] {
        let me = self.me.id
        let hit: (FeedEvent) -> Bool = { $0.kind == .reviewed && $0.authorID == me && $0.titleID == titleID }
        let taken = feed.enumerated().filter { hit($0.element) }.map { (index: $0.offset, event: $0.element) }
        if !taken.isEmpty { feed.removeAll(where: hit) }
        return taken
    }

    /// Back where they were (ascending, so each index is the one it had), unless the feed was read
    /// again meanwhile and already has them.
    func putBackOwnReviewEvents(_ taken: [(index: Int, event: FeedEvent)]) {
        for t in taken where !feed.contains(where: { $0.id == t.event.id }) {
            feed.insert(t.event, at: min(t.index, feed.count))
        }
    }

    /// The mark never reached the server (its `revert`), or a later one proved the review is
    /// still there: what was held goes back, unless a review of yours is on screen again.
    private func restoreHeldReview(_ titleID: String) {
        guard let held = s.reviewHold.restore(titleID) else { return }
        putBackOwnReviewEvents(s.heldReviewEvents.removeValue(forKey: titleID) ?? [])
        if myReview(titleID) == nil, !held.reviews.isEmpty {
            setReviews(titleID, held.reviews.filter { review($0.id) == nil } + reviewList(titleID))
        }
        if userTitles[titleID]?.reviewID == nil { userTitles[titleID]?.reviewID = held.reviewID }
    }

    /// `PUT …/mark` answered. `reviewId: null` after a mark without a reaction = the server
    /// deleted your review in the same transaction: it leaves the ficha, your feed and your count.
    private func markLanded(_ titleID: String, mark: Mark?, reviewID: String?) {
        switch ReviewHold<Review>.landing(mark: mark?.rawValue, reviewID: reviewID) {
        case .restore:
            restoreHeldReview(titleID)
            userTitles[titleID]?.reviewID = reviewID
        case .erase:
            let me = self.me.id
            let had = s.reviewHold.isHolding(titleID) || hasOwnReview(titleID)
            s.reviewHold.drop(titleID)
            s.heldReviewEvents[titleID] = nil
            removeReviews(of: titleID) { $0.authorID == me }
            userTitles[titleID]?.reviewID = nil
            feed.removeAll { $0.kind == .reviewed && $0.authorID == me && $0.titleID == titleID }
            if had, let n = account?.stats.reviews, n > 0 { account?.stats.reviews = n - 1 }
        case .keep:
            break
        }
    }

    /// "No encontramos este título": `PUT mark` answered 404 for a catalog id.
    static let unknownTitleNote = "No encontramos este título. Búscalo de nuevo."

    /// After a mark on a title in no collection: open "Guardar en…" as a suggestion. Closing it
    /// without choosing leaves the title marked and out of every collection. Never over another sheet.
    func suggestSaving(_ titleID: String) {
        guard mark(titleID) != nil, !isSaved(titleID), sheet == nil else { return }
        present(.saveTo(titleID))
    }

    /// An `ext:` result has no catalog id to mark yet: save it first (the membership PUT materializes it).
    private func askToSaveFirst(_ titleID: String) {
        showToast(ToastModel(text: "Primero guarda este título en una colección", kind: .info))
        // After the caller's own dismiss (the complete sheet closes right after calling setMark).
        Task { @MainActor [weak self] in self?.present(.saveTo(titleID)) }
    }

    /// Completar + reseña in one go: the server refuses a review before a reaction
    /// (`409 reaction_required`), so the mark is AWAITED here and the caller sends the review only
    /// on `nil`. Optimistic like `setMark`; on failure the mark is reverted and the error returned
    /// (the sheet keeps the text; a 404 is `unknownTitleNote`). An `ext:` result can't be marked
    /// before it's saved: that opens "guardar en" and returns `.notFound`. The caller suggests
    /// "Guardar en…" after the review (`suggestSaving`), so a sheet it's about to close doesn't eat it.
    func setMarkConfirmed(_ titleID: String, _ mark: Mark?, preview: Bool) async -> KuraAPIError? {
        if ExternalRef.parse(localID: titleID) != nil { askToSaveFirst(titleID); return .notFound }
        let hadState = userTitles[titleID]
        ensureUserState(titleID)
        userTitles[titleID]?.mark = mark
        holdOwnReview(titleID, for: mark)
        inflight[titleID, default: 0] += 1
        let session = s
        defer { session.inflight[titleID, default: 1] -= 1 }
        // In line behind any `setMark` still queued for this title (`WriteKey.mark`), and ahead of
        // whatever comes after it: the order the user tapped is the order the server sees.
        let key = WriteKey.mark(titleID)
        // The newest write of this mark (`sync(gen:)`): an older "Reintentar" leaves, and only
        // the current generation puts anything back.
        let gen = session.beginWrite(key)
        supersedeRetryToast(key)
        let previous = session.writeChains[key]?.task
        let api = self.api
        let call = Task { () async throws -> UserTitleState in
            await previous?.value
            try Task.checkCancellation()
            return try await api.setMark(titleID: titleID, mark: mark, preview: preview)
        }
        let token = UUID()
        session.writeChains[key] = (token, Task { _ = try? await call.value })
        defer { if session.writeChains[key]?.token == token { session.writeChains[key] = nil } }
        do {
            let ack = try await call.value
            guard s === session else { return .cancelled }
            session.writeLanded(key, gen)
            online()
            markLanded(titleID, mark: mark, reviewID: ack.reviewID)
            if userTitles[titleID]?.mark == mark {
                userTitles[titleID]?.savedAt = ack.savedAt
                if loadedTitles.contains(titleID) { Task { await loadTitle(titleID, force: true) } }
            }
            return nil
        } catch {
            guard s === session else { return .cancelled }
            let e = noteError(error)
            // `noteError` may have ended the session (401): nothing of it is left to put back.
            guard s === session else { return e }
            // The mark goes back only while it's still this write's own.
            let revert: @MainActor () -> Void = { [weak self] in
                guard let self, self.s === session else { return }
                self.restoreHeldReview(titleID)
                guard self.userTitles[titleID]?.mark == mark else { return }
                if hadState != nil { self.userTitles[titleID]?.mark = hadState?.mark } else if !self.isSaved(titleID) { self.userTitles[titleID] = nil }
            }
            if e == .cancelled || e == .unauthorized {
                if session.isCurrentWrite(key, gen) { revert() }
                session.settleWrite(key, gen)
            } else if session.writeFailed(key, gen, revert: revert) {
                // Still the newest write of the mark: its change goes back, then the superseded ones'.
                revert()
                session.settleFailedWrite(key, gen)
            }
            // Superseded: `writeFailed` kept the revert for when the newer write fails too (`sync`).
            return e
        }
    }

    func publishReview(titleID: String, text: String, spoiler: Bool) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        ensureUserState(titleID)
        let mark = self.mark(titleID)
        let localID: String
        var list = reviewList(titleID)
        let previous = list.first(where: { $0.authorID == me.id })
        let previousReviewID = userTitles[titleID]?.reviewID
        if let i = list.firstIndex(where: { $0.authorID == me.id }) {
            list[i].text = trimmed
            list[i].spoiler = spoiler
            list[i].mark = mark
            localID = list[i].id
        } else {
            let r = Review(id: "r-\(UUID().uuidString.prefix(6))", authorID: me.id, titleID: titleID,
                           text: trimmed, mark: mark, spoiler: spoiler, date: Date())
            list.insert(r, at: 0)
            userTitles[titleID]?.reviewID = r.id
            localID = r.id
        }
        setReviews(titleID, list)
        let session = s
        // Puts back what was there before this write (only while the optimistic review is still
        // the one it left: once the server answered, its id replaced `localID`).
        let revert: @MainActor () -> Void = { [weak self] in
            guard let self else { return }
            var list = self.reviewList(titleID)
            guard let i = list.firstIndex(where: { $0.id == localID }), list[i].text == trimmed else { return }
            if let previous { list[i] = previous } else { list.remove(at: i) }
            self.setReviews(titleID, list)
            self.userTitles[titleID]?.reviewID = previousReviewID
        }
        sync(key: WriteKey.review(titleID), gen: WriteKey.review(titleID), titleID: titleID, onError: { [weak self] e in
            // No reaction on the server (`obsessed || verdict != null`): the review never existed
            // there. Put back what was before and say the real rule — never a "Reintentar" that
            // can only fail again.
            guard case .conflict(let code, _) = e, code == "reaction_required", let self else { return false }
            revert()
            self.showToast(ToastModel(text: e.toast, kind: .info))
            return true
        }, revert: revert) { [weak self] api in
            let store = self
            let saved = try await api.saveReview(titleID: titleID, body: trimmed, hasSpoiler: spoiler)
            await MainActor.run {
                guard let self = store, self.s === session else { return }
                var list = self.reviewList(titleID)
                guard let i = list.firstIndex(where: { $0.id == localID }) else { return }
                list[i] = Review(id: saved.id, authorID: self.me.id, titleID: titleID, text: list[i].text,
                                 mark: saved.mark ?? list[i].mark, spoiler: list[i].spoiler, date: saved.date)
                self.setReviews(titleID, list)
                self.userTitles[titleID]?.reviewID = saved.id
                self.revealedSpoilers.remove(localID)
            }
        }
    }

    func deleteReview(titleID: String) {
        let me = self.me.id
        let mine = reviewList(titleID).filter { $0.authorID == me }
        guard !mine.isEmpty else { return }
        removeReviews(of: titleID) { $0.authorID == me }
        userTitles[titleID]?.reviewID = nil
        // A 404 is the outcome asked for. Anything else that never reached the server puts the
        // review back.
        sync(key: WriteKey.review(titleID), gen: WriteKey.review(titleID), titleID: titleID, revert: { [weak self] in
            guard let self, self.myReview(titleID) == nil else { return }
            self.setReviews(titleID, mine + self.reviewList(titleID))
            self.userTitles[titleID]?.reviewID = mine.first?.id
        }, notFoundLands: true) { api in try await api.deleteReview(titleID: titleID) }
        undoToast("Reseña borrada") { [weak self] in
            guard let self else { return }
            self.setReviews(titleID, self.reviewList(titleID) + mine.filter { self.review($0.id) == nil })
            if let r = mine.first { self.publishReview(titleID: titleID, text: r.text, spoiler: r.spoiler) }
        }
    }

    /// Episodes are local (§4: `PUT …/episodes` → 501).
    func toggleEpisode(_ titleID: String, key: String) {
        ensureUserState(titleID)
        var set = userTitles[titleID]?.watchedEpisodes ?? []
        let watched = !set.contains(key)
        if watched { set.insert(key) } else { set.remove(key) }
        userTitles[titleID]?.watchedEpisodes = set
        KHaptic.play(.selection)
        saveLocal()
    }
}
