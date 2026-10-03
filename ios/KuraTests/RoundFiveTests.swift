import XCTest

/// Ciclo 5 de auditoría: the cap on empty later pages (`PageContract`, what
/// `AppStore.loadMorePeople` follows) and a read of `me` that left BEFORE a `PATCH /me` and
/// answers AFTER it landed (`WriteGenerations.landedSince`, what `applyMe(_:readAt:)` asks).
final class EmptyPageCapTests: XCTestCase {
    /// `loadMorePeople`'s bookkeeping: pages of `added` rows, each still carrying a cursor.
    /// Returns how many pages were asked before the paginator stopped on its own.
    private func walk(_ pages: [Int]) -> (asked: Int, stalled: Bool) {
        var run = 0
        for (i, added) in pages.enumerated() {
            run = PageContract.emptyRun(run, added: added)
            if PageContract.stalled(emptyRun: run, hasNext: true) { return (i + 1, true) }
        }
        return (pages.count, false)
    }

    func testThreeEmptyPagesInARowStopThePaginator() {
        XCTAssertEqual(PageContract.maxEmptyPages, 3)
        let r = walk([0, 0, 0, 0, 0, 0])
        XCTAssertTrue(r.stalled)
        XCTAssertEqual(r.asked, 3)
    }

    func testAPageWithRowsStartsTheCountOver() {
        XCTAssertFalse(walk([0, 0, 4, 0, 0]).stalled)
        let r = walk([0, 0, 1, 0, 0, 0])
        XCTAssertTrue(r.stalled)
        XCTAssertEqual(r.asked, 6)
    }

    // The last page (no cursor) is the end of the list, never "No se cargó el resto.".
    func testAnEmptyLastPageIsNotAStall() {
        XCTAssertFalse(PageContract.stalled(emptyRun: 3, hasNext: false))
        XCTAssertFalse(PageContract.stalled(emptyRun: 2, hasNext: true))
        XCTAssertTrue(PageContract.stalled(emptyRun: 3, hasNext: true))
    }

    // Reintentar starts the count over (`emptyPages = 0`): three more pages may be asked.
    func testRetryAllowsThreeMore() {
        XCTAssertEqual(PageContract.emptyRun(0, added: 0), 1)
        XCTAssertFalse(PageContract.stalled(emptyRun: PageContract.emptyRun(0, added: 0), hasNext: true))
    }
}

@MainActor
final class MeReadAfterLandedWriteTests: XCTestCase {
    private let key = "me|field|isPublic"

    /// `applyMe`'s rule for one field.
    private func takes(_ g: WriteGenerations, _ key: String, readAt stamp: Int?) -> Bool {
        !(g.isPending(key) || (stamp.map { g.landedSince(key, $0) } ?? false))
    }

    // read leaves → PATCH begins → PATCH lands → read answers: the old value must not paint.
    func testReadThatLeftBeforeTheWriteIsDroppedAfterItLands() {
        let g = WriteGenerations()
        let stamp = g.stamp
        let gen = g.begin(key)
        XCTAssertFalse(takes(g, key, readAt: stamp), "pending")
        g.landed(key, gen)
        XCTAssertFalse(g.isPending(key))
        XCTAssertFalse(takes(g, key, readAt: stamp), "landed after the read left")
    }

    // The write was already out when the read left, and lands before it answers: same thing.
    func testReadThatLeftDuringTheWriteIsDroppedToo() {
        let g = WriteGenerations()
        let gen = g.begin(key)
        let stamp = g.stamp
        g.landed(key, gen)
        XCTAssertFalse(takes(g, key, readAt: stamp))
    }

    // A read that leaves AFTER the landing is the truth again; so is any other field.
    func testReadThatLeftAfterTheLandingPaints() {
        let g = WriteGenerations()
        let before = g.stamp
        g.landed(key, g.begin(key))
        XCTAssertTrue(takes(g, key, readAt: g.stamp))
        XCTAssertTrue(takes(g, "me|field|notifyRecap", readAt: before))
        XCTAssertTrue(takes(g, "me|username", readAt: before))
    }

    // The @ follows the same rule under its own key.
    func testUsernameIsHeldLikeAField() {
        let g = WriteGenerations()
        let stamp = g.stamp
        let gen = g.begin("me|username")
        XCTAssertFalse(takes(g, "me|username", readAt: stamp))
        g.landed("me|username", gen)
        XCTAssertFalse(takes(g, "me|username", readAt: stamp))
        XCTAssertTrue(takes(g, "me|username", readAt: g.stamp))
    }

    // A write that failed and was put back holds nothing: the read's value is the server's.
    func testFailedAndSettledWriteDoesNotHoldTheRead() {
        let g = WriteGenerations()
        let stamp = g.stamp
        let gen = g.begin(key)
        XCTAssertTrue(g.failure(key, gen, revert: nil))
        g.settleFailure(key, gen)
        XCTAssertTrue(takes(g, key, readAt: stamp))
    }

    // A write's own answer (no stamp) only yields to a write still pending.
    func testNoStampOnlyChecksPending() {
        let g = WriteGenerations()
        g.landed(key, g.begin(key))
        XCTAssertTrue(takes(g, key, readAt: nil))
    }

    func testResetForgetsLandings() {
        let g = WriteGenerations()
        let stamp = g.stamp
        g.landed(key, g.begin(key))
        g.reset()
        XCTAssertFalse(g.landedSince(key, stamp))
    }
}
