import Foundation

/// "Borrar también sus títulos" (founder, 2026-10-01), with no UI and no API in it — `KuraTests`
/// compiles this file alone.
///
/// `DELETE /collections/{id}?purge=1`: the titles that were ONLY in that collection lose their
/// state, your reaction and your review. A title filed under another collection too keeps
/// everything. The app takes those titles out of the local library with the optimistic delete and
/// keeps what it took here; a delete that never reached the server puts all of it back.
struct CollectionPurge<State, Review> {
    /// The titles the purge takes, in the order the collection had them.
    let titleIDs: [String]
    private(set) var states: [String: State] = [:]
    private(set) var reviews: [String: [Review]] = [:]

    /// Only the titles of the deleted collection that are in NO other collection.
    static func targets(of deleted: [String], others: [[String]]) -> [String] {
        let elsewhere = Set(others.joined())
        var seen = Set<String>()
        return deleted.filter { !elsewhere.contains($0) && seen.insert($0).inserted }
    }

    /// The optimistic half: `states` loses every purged title, and what it had (plus your reviews
    /// of them, read with `ownReviews`) is kept for the revert.
    init(deleted: [String], others: [[String]], states: inout [String: State], ownReviews: (String) -> [Review]) {
        titleIDs = Self.targets(of: deleted, others: others)
        for id in titleIDs {
            if let s = states.removeValue(forKey: id) { self.states[id] = s }
            let mine = ownReviews(id)
            if !mine.isEmpty { reviews[id] = mine }
        }
    }

    /// The delete never reached the server: every state taken goes back, except where a state is
    /// on screen again (the title was saved or marked since: that one is newer).
    func restore(into states: inout [String: State]) {
        for (id, s) in self.states where states[id] == nil { states[id] = s }
    }
}
