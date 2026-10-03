import Foundation

/// "La reseña se borra con la reacción" (founder, 2026-10-01), with no UI and no API in it —
/// `KuraTests` compiles this file alone.
///
/// The server deletes your review of a title in the same transaction as a mark that leaves it
/// WITHOUT a reaction (`completed` or `null`), and says so with `reviewId: null` in the answer.
/// The app takes the review off the screen with the optimistic mark and HOLDS it here until the
/// server answers: a mark that failed puts it back (`restore`, from the write's `revert`); a mark
/// that landed without a reaction drops it for good; a later mark that lands WITH a `reviewId`
/// proves the review is still on the server (the write that held it never got there) and puts it
/// back too. There is no undo on the server: nothing here is ever re-published.
struct ReviewHold<R> {
    struct Held {
        var reviews: [R]
        var reviewID: String?
    }

    /// What a landed mark means for your review of that title.
    enum Landing: Equatable {
        /// The server deleted it: your review leaves the local state and the hold is dropped.
        case erase
        /// The server still has it: whatever is held goes back on screen.
        case restore
        /// Nothing to do (a reaction landed on a title with no review).
        case keep
    }

    private(set) var held: [String: Held] = [:]

    /// `mark` as the wire spells it (`obsessed` · `liked` · `completed` · nil).
    static func leavesNoReaction(_ mark: String?) -> Bool { mark == nil || mark == "completed" }

    /// Ask before writing: the mark leaves the title without a reaction and there is a review to lose.
    static func needsConfirmation(hasReview: Bool, mark: String?) -> Bool { hasReview && leavesNoReaction(mark) }

    static func landing(mark: String?, reviewID: String?) -> Landing {
        if reviewID != nil { return .restore }
        return leavesNoReaction(mark) ? .erase : .keep
    }

    func isHolding(_ titleID: String) -> Bool { held[titleID] != nil }

    /// The optimistic mark took your review off the screen. The FIRST hold of a title wins: a
    /// second mark before any answer finds nothing on screen and must not overwrite it with nothing.
    mutating func take(_ titleID: String, reviews: [R], reviewID: String?) {
        guard held[titleID] == nil, !reviews.isEmpty || reviewID != nil else { return }
        held[titleID] = Held(reviews: reviews, reviewID: reviewID)
    }

    /// The mark never reached the server (or a later one proved the review is still there): what
    /// was held, once — the caller puts it back.
    mutating func restore(_ titleID: String) -> Held? { held.removeValue(forKey: titleID) }

    /// The server deleted it.
    mutating func drop(_ titleID: String) { held[titleID] = nil }

    mutating func reset() { held = [:] }
}
