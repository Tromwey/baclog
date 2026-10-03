import XCTest

/// The traces of the audit (ciclo 3) over the generations of `AppStore.sync(gen:)`. Each test
/// drives `WriteGenerations` the way `sync` / `setMarkConfirmed` do: `begin` when the write is
/// queued, `failure` when its error arrives, the caller's own `revert` + `settleFailure` when it
/// was the current one, `landed` on success.
@MainActor
final class WriteGenerationsTests: XCTestCase {
    /// What `sync` does with a failed write (minus toasts): returns whether it was current.
    @discardableResult
    private func fail(_ g: WriteGenerations, _ key: String, _ gen: Int, revert: @escaping WriteGenerations.Revert) -> Bool {
        guard g.failure(key, gen, revert: revert) else { return false }
        revert()
        g.settleFailure(key, gen)
        return true
    }

    /// An optimistic set of `value` over `screen`, with the guarded revert every caller writes.
    private func set(_ screen: Box, _ value: String) -> WriteGenerations.Revert {
        let old = screen.value
        screen.value = value
        return { if screen.value == value { screen.value = old } }
    }

    final class Box { var value: String; init(_ v: String) { value = v } }

    // Trace 1 — `followListsVisibility` / `claimHandle`: A in flight, B supersedes it, both fail.
    // The screen must end on the ORIGINAL value (what the server has), not on A's.
    func testSupersededFailureGoesBackToTheOriginal() {
        let g = WriteGenerations(), screen = Box("original"), key = "me|field|followListsVisibility"
        let a = g.begin(key); let revertA = set(screen, "A")
        let b = g.begin(key); let revertB = set(screen, "B")
        XCTAssertFalse(fail(g, key, a, revert: revertA), "A was superseded")
        XCTAssertEqual(screen.value, "B", "a superseded failure puts nothing back by itself")
        XCTAssertTrue(fail(g, key, b, revert: revertB))
        XCTAssertEqual(screen.value, "original")
        XCTAssertTrue(g.current.isEmpty && g.stale.isEmpty)
    }

    // Trace 1b — the same, but B lands: the server has B, A's revert must never run.
    func testSupersededFailureIsDroppedWhenTheNewerWriteLands() {
        let g = WriteGenerations(), screen = Box("original"), key = "me|username"
        let a = g.begin(key); let revertA = set(screen, "A")
        let b = g.begin(key); _ = set(screen, "B")
        fail(g, key, a, revert: revertA)
        g.landed(key, b)
        XCTAssertEqual(screen.value, "B")
        XCTAssertTrue(g.current.isEmpty && g.stale.isEmpty && g.failed.isEmpty)
    }

    // Trace 2 — `move` / `setMembership`: the add of a membership failed, then the title is taken
    // out (a deferred removal) and put back by another path. Cancelling the removal is not enough:
    // the key stays "unconfirmed" until a write of it lands, so the add goes out again.
    func testFailedMembershipStaysUnconfirmedUntilAWriteLands() {
        let g = WriteGenerations(), key = "m|title|collection"
        let add = g.begin(key)
        XCTAssertFalse(g.lastFailed(key))
        fail(g, key, add, revert: {})
        XCTAssertTrue(g.lastFailed(key), "move/setMembership must resend the add")
        let again = g.begin(key)
        XCTAssertTrue(g.lastFailed(key), "still unconfirmed while the resend is out")
        g.landed(key, again)
        XCTAssertFalse(g.lastFailed(key))
    }

    // Trace 6 — a 404 on a MARK or an ADD is a failure like any other: superseded, its revert
    // waits and runs when the newer write fails too (it used to be dropped for every 404).
    func testSuperseded404OfAMarkStillRevertsWhenTheNewerFails() {
        let g = WriteGenerations(), screen = Box("sin marca"), key = "mark|t1"
        let a = g.begin(key); let revertA = set(screen, "me gusta")
        let b = g.begin(key); let revertB = set(screen, "me obsesiona")
        XCTAssertFalse(fail(g, key, a, revert: revertA)) // the 404
        XCTAssertEqual(g.stale[key]?.count, 1)
        fail(g, key, b, revert: revertB)
        XCTAssertEqual(screen.value, "sin marca")
    }

    // Trace 6b — a 404 on a REMOVAL is the outcome asked for: `sync(notFoundLands:)` treats it as
    // landed. Nothing goes back, older reverts are moot, and the membership is confirmed (out).
    func testRemoval404Lands() {
        let g = WriteGenerations(), screen = Box("fuera"), key = "m|t1|c1"
        let add = g.begin(key); let revertAdd = set(screen, "dentro")
        let remove = g.begin(key); _ = set(screen, "fuera")
        fail(g, key, add, revert: revertAdd)
        g.landed(key, remove) // 404
        XCTAssertEqual(screen.value, "fuera")
        XCTAssertFalse(g.lastFailed(key))
        XCTAssertTrue(g.stale.isEmpty && g.current.isEmpty)
    }

    // Trace 7 — `setMarkConfirmed` (Completar + reseña) fails after a newer `setMark` superseded
    // it, and that one fails too: the mark goes back to what it was before both.
    func testSupersededConfirmedMarkRevertsBehindTheNewerOne() {
        let g = WriteGenerations(), screen = Box("sin marca"), key = "mark|t1"
        let confirmed = g.begin(key); let revertConfirmed = set(screen, "completo")
        let tap = g.begin(key); let revertTap = set(screen, "me gusta")
        // setMarkConfirmed's catch: not current → `failure` keeps its revert.
        XCTAssertFalse(g.failure(key, confirmed, revert: revertConfirmed))
        XCTAssertEqual(screen.value, "me gusta")
        fail(g, key, tap, revert: revertTap)
        XCTAssertEqual(screen.value, "sin marca")
    }

    // A revert only acts while the screen still shows its own value.
    func testStaleRevertRespectsItsStateGuard() {
        let g = WriteGenerations(), screen = Box("original"), key = "k"
        let a = g.begin(key); let revertA = set(screen, "A")
        let b = g.begin(key); let revertB = set(screen, "B")
        fail(g, key, a, revert: revertA)
        screen.value = "otra cosa" // a read replaced it meanwhile
        fail(g, key, b, revert: revertB)
        XCTAssertEqual(screen.value, "otra cosa")
    }

    // Task 11 — nothing grows without bound.
    func testDictionariesAreBounded() {
        let g = WriteGenerations()
        for i in 0..<1_000 {
            let key = "m|t\(i)|c"
            let gen = g.begin(key)
            if i % 2 == 0 { g.landed(key, gen) } else { fail(g, key, gen, revert: {}) }
        }
        XCTAssertTrue(g.current.isEmpty, "a settled write leaves no generation behind")
        XCTAssertTrue(g.stale.isEmpty)
        XCTAssertEqual(g.failed.count, WriteGenerations.failedCap)
        XCTAssertTrue(g.lastFailed("m|t999|c"), "the newest failures are the ones kept")
        XCTAssertFalse(g.lastFailed("m|t1|c"))
        g.reset()
        XCTAssertTrue(g.failed.isEmpty)
    }

    // A stale revert arriving after the write that superseded it settled is dropped, not leaked.
    func testLateStaleRevertIsNotKept() {
        let g = WriteGenerations(), key = "k"
        let a = g.begin(key)
        let b = g.begin(key)
        g.landed(key, b)
        XCTAssertFalse(g.failure(key, a, revert: { XCTFail("the server has B") }))
        XCTAssertTrue(g.stale.isEmpty)
    }

    // A generation is never reused, so a settled key can't make an old write look current.
    func testGenerationsAreNeverReused() {
        let g = WriteGenerations(), key = "k"
        let a = g.begin(key)
        g.landed(key, a)
        let b = g.begin(key)
        XCTAssertNotEqual(a, b)
        XCTAssertFalse(g.isCurrent(key, a))
        XCTAssertTrue(g.isCurrent(key, b))
    }

    // `adopt`: a collection's local id becomes the server id; everything follows it.
    func testRekeyMovesEverything() {
        let g = WriteGenerations()
        let a = g.begin("m|t|local"); _ = g.begin("m|t|local")
        XCTAssertFalse(g.failure("m|t|local", a, revert: {}))
        g.rekey(suffix: "|local", serverID: "srv")
        XCTAssertNil(g.current["m|t|local"])
        XCTAssertNotNil(g.current["m|t|srv"])
        XCTAssertEqual(g.stale["m|t|srv"]?.count, 1)
        XCTAssertTrue(g.lastFailed("m|t|srv"))
    }
}
