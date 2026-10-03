import XCTest

/// Ronda 7: the birth date of the age gate (`BirthDate`, what O1b validates before sending) and
/// "la reseña se borra con la reacción" (`ReviewHold` driven by `WriteGenerations`, the way
/// `AppStore.setMark` drives them).
final class BirthDateTests: XCTestCase {
    private let utc = TimeZone(identifier: "UTC")!
    /// 2026-10-01 12:00 UTC.
    private var today: Date {
        var c = DateComponents(); c.year = 2026; c.month = 10; c.day = 1; c.hour = 12
        var cal = Calendar(identifier: .gregorian); cal.timeZone = utc
        return cal.date(from: c)!
    }
    private func wire(_ d: String, _ m: String, _ y: String) -> String? {
        BirthDate.wire(day: d, month: m, year: y, today: today, timeZone: utc)
    }

    func testARealDateGoesOutPadded() {
        XCTAssertEqual(wire("14", "3", "1998"), "1998-03-14")
        XCTAssertEqual(wire("1", "01", "2000"), "2000-01-01")
    }

    func testDaysThatDoNotExistAreRefused() {
        XCTAssertNil(wire("31", "4", "1998"))
        XCTAssertNil(wire("30", "2", "2000"))
        XCTAssertNil(wire("0", "5", "1998"))
        XCTAssertNil(wire("12", "13", "1998"))
        XCTAssertNil(wire("12", "0", "1998"))
    }

    func testFebruary29OnlyInLeapYears() {
        XCTAssertEqual(wire("29", "2", "2000"), "2000-02-29")
        XCTAssertEqual(wire("29", "2", "2012"), "2012-02-29")
        XCTAssertNil(wire("29", "2", "1900"))
        XCTAssertNil(wire("29", "2", "2011"))
    }

    func testTheFutureAndBefore1900AreRefused() {
        XCTAssertEqual(wire("1", "10", "2026"), "2026-10-01") // today is a date (the server says underage)
        XCTAssertNil(wire("2", "10", "2026"))
        XCTAssertNil(wire("1", "1", "2027"))
        XCTAssertNil(wire("31", "12", "1899"))
        XCTAssertEqual(wire("1", "1", "1900"), "1900-01-01")
    }

    func testAnUnfinishedDateIsNotAnError() {
        XCTAssertFalse(BirthDate.isComplete(day: "14", month: "3", year: "199"))
        XCTAssertFalse(BirthDate.isComplete(day: "", month: "3", year: "1998"))
        XCTAssertTrue(BirthDate.isComplete(day: "31", month: "4", year: "1998"))
        XCTAssertNil(wire("14", "3", "98"))
        XCTAssertNil(wire("ab", "3", "1998"))
    }

    func testAgeCountsWholeYearsLikeTheServer() {
        XCTAssertEqual(BirthDate.age(wire: "2013-10-01", today: today), 13)
        XCTAssertEqual(BirthDate.age(wire: "2013-10-02", today: today), 12)
        XCTAssertEqual(BirthDate.age(wire: "1998-03-14", today: today), 28)
        XCTAssertNil(BirthDate.age(wire: "1998", today: today))
    }
}

@MainActor
final class ReviewHoldTests: XCTestCase {
    /// The slice of `AppStore` a mark touches: the mark, your review on screen, and the two pure
    /// types that decide what goes back.
    @MainActor private final class Model {
        var mark: String? = "liked"
        var review: String? = "la reseña"
        var hold = ReviewHold<String>()
        let gens = WriteGenerations()
        let key = "mark|t1"

        /// `setMark`'s optimistic half: returns the generation and the revert `sync` would keep.
        func write(_ new: String?) -> (gen: Int, revert: WriteGenerations.Revert) {
            let previous = mark
            mark = new
            if ReviewHold<String>.leavesNoReaction(new), let r = review {
                hold.take("t1", reviews: [r], reviewID: "rid")
                if hold.isHolding("t1") { review = nil }
            }
            let gen = gens.begin(key)
            return (gen, { [unowned self] in
                if let h = self.hold.restore("t1"), self.review == nil { self.review = h.reviews.first }
                if self.mark == new { self.mark = previous }
            })
        }

        func fail(_ w: (gen: Int, revert: WriteGenerations.Revert)) {
            guard gens.failure(key, w.gen, revert: w.revert) else { return }
            w.revert()
            gens.settleFailure(key, w.gen)
        }

        func land(_ w: (gen: Int, revert: WriteGenerations.Revert), mark sent: String?, reviewID: String?) {
            gens.landed(key, w.gen)
            switch ReviewHold<String>.landing(mark: sent, reviewID: reviewID) {
            case .restore: if let h = hold.restore("t1"), review == nil { review = h.reviews.first }
            case .erase: hold.drop("t1"); review = nil
            case .keep: break
            }
        }
    }

    func testOnlyAMarkWithoutReactionAsksAndOnlyWithAReview() {
        XCTAssertTrue(ReviewHold<String>.needsConfirmation(hasReview: true, mark: nil))
        XCTAssertTrue(ReviewHold<String>.needsConfirmation(hasReview: true, mark: "completed"))
        XCTAssertFalse(ReviewHold<String>.needsConfirmation(hasReview: true, mark: "liked"))
        XCTAssertFalse(ReviewHold<String>.needsConfirmation(hasReview: true, mark: "obsessed"))
        XCTAssertFalse(ReviewHold<String>.needsConfirmation(hasReview: false, mark: nil))
    }

    func testLandingReadsReviewIdAsTheSignal() {
        XCTAssertEqual(ReviewHold<String>.landing(mark: "completed", reviewID: nil), .erase)
        XCTAssertEqual(ReviewHold<String>.landing(mark: nil, reviewID: nil), .erase)
        XCTAssertEqual(ReviewHold<String>.landing(mark: "liked", reviewID: nil), .keep)
        XCTAssertEqual(ReviewHold<String>.landing(mark: "obsessed", reviewID: "r"), .restore)
    }

    func testAFailedMarkPutsTheReviewBackWithTheMark() {
        let m = Model()
        let w = m.write("completed")
        XCTAssertNil(m.review)
        m.fail(w)
        XCTAssertEqual(m.mark, "liked")
        XCTAssertEqual(m.review, "la reseña")
        XCTAssertFalse(m.hold.isHolding("t1"))
    }

    func testALandedMarkWithoutReactionErasesItForGood() {
        let m = Model()
        let w = m.write(nil)
        m.land(w, mark: nil, reviewID: nil)
        XCTAssertNil(m.review)
        XCTAssertFalse(m.hold.isHolding("t1"))
        // Marking again doesn't bring the text back (no undo on the server).
        let again = m.write("liked")
        m.land(again, mark: "liked", reviewID: nil)
        XCTAssertNil(m.review)
    }

    func testASupersededFailureComesBackWhenTheNewerMarkProvesTheReviewIsStillThere() {
        let m = Model()
        let a = m.write("completed")   // takes the review off, never reaches the server
        let b = m.write("obsessed")    // supersedes it
        m.fail(a)                      // not current: its revert waits, the review stays held
        XCTAssertNil(m.review)
        XCTAssertTrue(m.hold.isHolding("t1"))
        m.land(b, mark: "obsessed", reviewID: "rid")
        XCTAssertEqual(m.mark, "obsessed")
        XCTAssertEqual(m.review, "la reseña")
    }

    func testBothFailingRestoresTheReviewOnce() {
        let m = Model()
        let a = m.write("completed")
        let b = m.write(nil)           // nothing on screen to hold: the first hold stands
        m.fail(a)
        m.fail(b)                      // current: its revert, then the superseded one
        XCTAssertEqual(m.review, "la reseña")
        XCTAssertEqual(m.mark, "liked")
        XCTAssertFalse(m.hold.isHolding("t1"))
    }
}
