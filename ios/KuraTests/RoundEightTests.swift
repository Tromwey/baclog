import XCTest

/// Ronda 8: "Borrar también sus títulos" (`CollectionPurge`, the way `AppStore.deleteCollection`
/// drives it): which titles the purge takes, and that a delete that never reached the server
/// puts everything back.
final class CollectionPurgeTests: XCTestCase {
    private typealias Purge = CollectionPurge<String, String>

    /// The slice of `AppStore` a purge touches.
    private struct Library {
        var collections: [String: [String]] = ["a": ["t1", "t2", "t3"], "b": ["t2"], "c": []]
        var states: [String: String] = ["t1": "obsessed", "t2": "liked", "t3": "completed", "loose": "liked"]
        var reviews: [String: [String]] = ["t1": ["reseña de t1"], "t2": ["reseña de t2"]]

        /// `deleteCollection(_:purge:)`'s optimistic half; the returned closure is its `revert`.
        mutating func delete(_ id: String, purge: Bool) -> (inout Library) -> Void {
            let gone = collections.removeValue(forKey: id) ?? []
            var taken: Purge?
            if purge, !gone.isEmpty {
                let mine = reviews
                let p = Purge(deleted: gone, others: Array(collections.values), states: &states,
                              ownReviews: { mine[$0] ?? [] })
                for t in p.titleIDs { reviews[t] = nil }
                taken = p
            }
            return { lib in
                guard lib.collections[id] == nil else { return }
                lib.collections[id] = gone
                guard let taken else { return }
                taken.restore(into: &lib.states)
                for (t, list) in taken.reviews where lib.reviews[t] == nil { lib.reviews[t] = list }
            }
        }
    }

    func testOnlyTitlesInNoOtherCollectionArePurged() {
        XCTAssertEqual(Purge.targets(of: ["t1", "t2", "t3"], others: [["t2"], []]), ["t1", "t3"])
        XCTAssertEqual(Purge.targets(of: ["t1", "t2"], others: [["t2"], ["t1", "x"]]), [])
        XCTAssertEqual(Purge.targets(of: ["t1", "t1"], others: []), ["t1"])
        XCTAssertEqual(Purge.targets(of: [], others: [["t1"]]), [])
    }

    func testPurgeTakesStateAndReviewOfThoseTitlesOnly() {
        var lib = Library()
        _ = lib.delete("a", purge: true)
        XCTAssertNil(lib.collections["a"])
        XCTAssertEqual(lib.states, ["t2": "liked", "loose": "liked"]) // t2 is also in "b"; "loose" was never in "a"
        XCTAssertEqual(lib.reviews, ["t2": ["reseña de t2"]])
    }

    func testWithoutPurgeEveryTitleKeepsItsState() {
        var lib = Library()
        let before = lib
        _ = lib.delete("a", purge: false)
        XCTAssertNil(lib.collections["a"])
        XCTAssertEqual(lib.states, before.states)
        XCTAssertEqual(lib.reviews, before.reviews)
    }

    func testRevertRestoresCollectionMembershipsStatesAndReviews() {
        var lib = Library()
        let before = lib
        let revert = lib.delete("a", purge: true)
        revert(&lib)
        XCTAssertEqual(lib.collections, before.collections)
        XCTAssertEqual(lib.states, before.states)
        XCTAssertEqual(lib.reviews, before.reviews)
    }

    func testRevertKeepsAStateMadeSinceTheDelete() {
        var lib = Library()
        let revert = lib.delete("a", purge: true)
        lib.states["t1"] = "liked" // marked again from its ficha while the delete was in flight
        revert(&lib)
        XCTAssertEqual(lib.states["t1"], "liked")
        XCTAssertEqual(lib.states["t3"], "completed")
        XCTAssertEqual(lib.reviews["t1"], ["reseña de t1"])
    }

    func testAnEmptyCollectionPurgesNothing() {
        var lib = Library()
        let before = lib.states
        _ = lib.delete("c", purge: true)
        XCTAssertEqual(lib.states, before)
    }
}
