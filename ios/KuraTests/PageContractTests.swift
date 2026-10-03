import XCTest

/// Ciclo 4 de auditoría: the contract rule of a paginated list (`PageContract`, what `LossyPage`
/// asks) and the rule `AppStore.applyMe` follows over `WriteGenerations.isPending`.
final class PageContractTests: XCTestCase {
    func testFirstPageWithNothingReadableOutOfTwoIsAContractBreak() {
        XCTAssertTrue(PageContract.isBreak(kept: 0, dropped: 2, firstPage: true))
        XCTAssertTrue(PageContract.isBreak(kept: 0, dropped: 20, firstPage: true))
    }

    func testOneUnknownElementOrAnySurvivorIsNotABreak() {
        XCTAssertFalse(PageContract.isBreak(kept: 0, dropped: 1, firstPage: true))
        XCTAssertFalse(PageContract.isBreak(kept: 1, dropped: 9, firstPage: true))
        XCTAssertFalse(PageContract.isBreak(kept: 0, dropped: 0, firstPage: true))
    }

    // A later page with nothing readable is an EMPTY page (its `nextCursor` survives and the
    // paginator goes on under its cap), never an error over a list that is already on screen.
    func testLaterPageNeverBreaks() {
        XCTAssertFalse(PageContract.isBreak(kept: 0, dropped: 2, firstPage: false))
        XCTAssertFalse(PageContract.isBreak(kept: 0, dropped: 50, firstPage: false))
    }

    func testOnlyANonEmptyCursorMakesALaterPage() {
        XCTAssertFalse(PageContract.isLaterPage(cursor: nil))
        XCTAssertFalse(PageContract.isLaterPage(cursor: ""))
        XCTAssertTrue(PageContract.isLaterPage(cursor: "2026-10-01T00:00:00Z|abc"))
    }
}

/// `applyMe` over a `PATCH /me` still out: a field is taken from the read only when no write of
/// it is pending. `Screen.apply` is `applyMe`'s rule, field by field.
@MainActor
final class MeReadOverWriteTests: XCTestCase {
    @MainActor private struct Screen {
        var isPrivate = false
        var visibility = "private"
        mutating func apply(isPrivate p: Bool, visibility v: String, _ g: WriteGenerations) {
            if !g.isPending("me|field|isPublic") { isPrivate = p }
            if !g.isPending("me|field|followListsVisibility") { visibility = v }
        }
    }

    // The read left before the PATCH and answers while it is in flight: the optimistic value of
    // THAT field stays; the other field (no write out) takes the server's.
    func testReadDuringAWriteKeepsOnlyThePendingField() {
        let g = WriteGenerations()
        var screen = Screen()
        let gen = g.begin("me|field|isPublic")
        screen.isPrivate = true
        screen.apply(isPrivate: false, visibility: "public", g)
        XCTAssertTrue(screen.isPrivate, "the pending write's value survives the stale read")
        XCTAssertEqual(screen.visibility, "public")
        g.landed("me|field|isPublic", gen)
        XCTAssertFalse(g.isPending("me|field|isPublic"))
        // Settled: the next read is the truth again.
        screen.apply(isPrivate: true, visibility: "public", g)
        XCTAssertTrue(screen.isPrivate)
    }

    // A failed write behind its "Reintentar" is still pending (the screen shows its value) until
    // it is reverted and settled; after that a read paints freely.
    func testFailedWriteStaysPendingUntilSettled() {
        let g = WriteGenerations()
        var screen = Screen()
        let key = "me|field|followListsVisibility"
        let gen = g.begin(key)
        screen.visibility = "mutuals"
        XCTAssertTrue(g.failure(key, gen, revert: nil))
        screen.apply(isPrivate: false, visibility: "private", g)
        XCTAssertEqual(screen.visibility, "mutuals")
        g.settleFailure(key, gen)
        screen.apply(isPrivate: false, visibility: "private", g)
        XCTAssertEqual(screen.visibility, "private")
    }

    // A superseded write that lands doesn't free the field: the newer one is still out.
    func testOlderWriteLandingKeepsTheFieldPending() {
        let g = WriteGenerations()
        let key = "me|field|isPublic"
        let a = g.begin(key)
        _ = g.begin(key)
        g.landed(key, a)
        XCTAssertTrue(g.isPending(key))
    }
}
