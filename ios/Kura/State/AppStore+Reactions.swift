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
        if haptic {
            switch mark {
            case .obsessed: KHaptic.impact(.medium)
            case .liked: KHaptic.impact(.light)
            default: break
            }
        }
        sync(key: WriteKey.mark(titleID), titleID: titleID, onError: { [weak self] e in
            guard let self else { return true }
            // Neither is retryable. The optimistic state goes: an unsaved title leaves the library
            // it had just entered; a saved one gets its previous mark back.
            let revert = {
                if hadState { self.userTitles[titleID]?.mark = previous } else if !self.isSaved(titleID) { self.userTitles[titleID] = nil }
            }
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
        }) { [weak self] api in
            let store = self
            let s = try await api.setMark(titleID: titleID, mark: mark, preview: preview)
            await MainActor.run {
                guard let self = store, self.userTitles[titleID]?.mark == mark else { return }
                if let rid = s.reviewID { self.userTitles[titleID]?.reviewID = rid }
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
        showToast(ToastModel(text: "Guárdala en una colección para marcarla", kind: .info))
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
        inflight[titleID, default: 0] += 1
        let session = s
        defer { session.inflight[titleID, default: 1] -= 1 }
        // In line behind any `setMark` still queued for this title (`WriteKey.mark`), and ahead of
        // whatever comes after it: the order the user tapped is the order the server sees.
        let key = WriteKey.mark(titleID)
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
            online()
            if userTitles[titleID]?.mark == mark {
                if let rid = ack.reviewID { userTitles[titleID]?.reviewID = rid }
                userTitles[titleID]?.savedAt = ack.savedAt
                if loadedTitles.contains(titleID) { Task { await loadTitle(titleID, force: true) } }
            }
            return nil
        } catch {
            guard s === session else { return .cancelled }
            let e = noteError(error)
            if hadState != nil { userTitles[titleID]?.mark = hadState?.mark } else if !isSaved(titleID) { userTitles[titleID] = nil }
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
        sync(key: WriteKey.review(titleID), titleID: titleID, onError: { [weak self] e in
            // No reaction on the server (`obsessed || verdict != null`): the review never existed
            // there. Put back what was before and say the real rule — never a "Reintentar" that
            // can only fail again.
            guard case .conflict(let code, _) = e, code == "reaction_required", let self else { return false }
            var list = self.reviewList(titleID)
            if let i = list.firstIndex(where: { $0.id == localID }) {
                if let previous { list[i] = previous } else { list.remove(at: i) }
                self.setReviews(titleID, list)
            }
            self.userTitles[titleID]?.reviewID = previousReviewID
            self.showToast(ToastModel(text: e.toast, kind: .info))
            return true
        }) { [weak self] api in
            let store = self
            let saved = try await api.saveReview(titleID: titleID, body: trimmed, hasSpoiler: spoiler)
            await MainActor.run {
                guard let self = store else { return }
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
        sync(key: WriteKey.review(titleID), titleID: titleID) { api in try await api.deleteReview(titleID: titleID) }
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
        KHaptic.select()
        saveLocal()
    }
}
