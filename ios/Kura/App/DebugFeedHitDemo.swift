import SwiftUI
import UIKit

// Moved out of `Features/Feed/FeedView.swift`: a DEBUG-only driver has no place in the view file.

#if DEBUG
/// `-kuraFeedHitDemo YES` (with `-kuraScreen feed -kuraBodyLog YES`): the simulator can't drive a
/// finger and plays no haptics, so this moves the REAL scroll view frame by frame (its geometry
/// reaches `FeedHits` through the same `onScrollGeometryChange`) and stands in for
/// `onScrollPhaseChange` — a programmatic move reports no finger. The log shows each `FEEDHIT`.
/// A drag through card 1, a fling through card 2, a snap-like landing on card 3, back up to the
/// top (pulls, no hits), down through card 1 again (re-armed), two cards in one frame (one hit), a
/// jump with no finger (silent); then the pull: a slow drag up over one mark, a fling up over two,
/// a snap-like landing onto card 1 from below, a drag down (a hit, no pull), a fling into the
/// rubber band past the top (no pull in the bounce) and a finger-less scroll-to-top (silent).
struct FeedHitDemo: UIViewRepresentable {
    let hits: FeedHits
    let marks: [CGFloat]

    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        guard UserDefaults.standard.bool(forKey: "kuraFeedHitDemo") else { return v }
        let hits = self.hits, marks = self.marks
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(1500))
            // The ScrollView's own UIScrollView: the nearest one around the stack.
            var sv: UIView? = v
            while let s = sv, !(s is UIScrollView) { sv = s.superview }
            if sv == nil {
                // `.background` of the ScrollView sits beside it: look in the parent's subtree.
                sv = v.superview?.superview.flatMap { Self.find(in: $0) }
            }
            guard let scroll = sv as? UIScrollView, marks.count >= 5 else {
                KBodyLog.hit("FEEDHIT demo: no scroll view / marks \(marks.count)"); return
            }
            let top = scroll.adjustedContentInset.top
            @MainActor func set(_ y: CGFloat) { scroll.contentOffset.y = y - top }
            var y: CGFloat = 0
            // Main actor explicitly: a local async func doesn't inherit the Task's isolation, and
            // UIKit moved off the main thread traps.
            @MainActor func line(to target: CGFloat, speed: CGFloat) async {
                let step = speed / 60 * (target > y ? 1 : -1)
                while (step > 0 && y < target) || (step < 0 && y > target) {
                    y = step > 0 ? min(y + step, target) : max(y + step, target)
                    set(y)
                    try? await Task.sleep(for: .milliseconds(16))
                }
            }
            KBodyLog.hit(String(format: "FEEDHIT demo marks %@", marks.prefix(5).map { String(format: "%.0f", $0) }.joined(separator: ",")))
            hits.phase(user: true, active: true)
            KBodyLog.hit("FEEDHIT demo A: drag 800 pt/s through card 1")
            await line(to: marks[0] + 40, speed: 800)
            KBodyLog.hit("FEEDHIT demo B: fling 2000 pt/s through card 2")
            await line(to: marks[1] + 60, speed: 2000)
            KBodyLog.hit("FEEDHIT demo C: decelerate into card 3 (snap landing)")
            let y0 = y, target = marks[2]
            for i in 1...75 {
                y = target - (target - y0) * exp(-CGFloat(i) * 0.016 / 0.15)
                set(y)
                try? await Task.sleep(for: .milliseconds(16))
            }
            y = target; set(y)
            try? await Task.sleep(for: .milliseconds(300))
            KBodyLog.hit("FEEDHIT demo D: back up to the top (no hit; FEEDPULL card 2, 1, 0)")
            await line(to: 0, speed: 1500)
            KBodyLog.hit("FEEDHIT demo E: slow drag 300 pt/s through card 1 again (re-armed)")
            await line(to: marks[0] + 20, speed: 300)
            try? await Task.sleep(for: .milliseconds(200))
            KBodyLog.hit("FEEDHIT demo F: cards 2 and 3 in one frame (expect one hit, x2)")
            y = marks[2] + 10; set(y)
            try? await Task.sleep(for: .milliseconds(300))
            KBodyLog.hit("FEEDHIT demo G: jump past card 4 and 5 with no finger (expect silent)")
            hits.phase(user: false, active: true)
            y = marks[4] + 10; set(y)
            try? await Task.sleep(for: .milliseconds(100))
            hits.phase(user: false, active: false)
            try? await Task.sleep(for: .milliseconds(100))
            // The pull: scrolling back up, the card above settles under the header.
            hits.phase(user: true, active: true)
            KBodyLog.hit("FEEDHIT demo H: slow drag up 500 pt/s over card 4's mark (expect FEEDPULL card 4)")
            await line(to: marks[3] - 20, speed: 500)
            try? await Task.sleep(for: .milliseconds(200))
            KBodyLog.hit("FEEDHIT demo I: fling up 2000 pt/s past cards 3 and 2 (expect FEEDPULL card 3, card 2)")
            await line(to: marks[1] - 30, speed: 2000)
            KBodyLog.hit("FEEDHIT demo J: decelerate down onto card 1 (snap landing: one FEEDPULL)")
            let y1 = y, target1 = marks[0]
            for i in 1...75 {
                y = target1 + (y1 - target1) * exp(-CGFloat(i) * 0.016 / 0.15)
                set(y)
                try? await Task.sleep(for: .milliseconds(16))
            }
            y = target1; set(y)
            try? await Task.sleep(for: .milliseconds(300))
            KBodyLog.hit("FEEDHIT demo K: drag down through card 2 (expect a FEEDHIT, no FEEDPULL)")
            await line(to: marks[1] + 20, speed: 800)
            try? await Task.sleep(for: .milliseconds(200))
            KBodyLog.hit("FEEDHIT demo L: fling up past the top into the rubber band (FEEDPULL card 2, 1, 0; none in the bounce)")
            await line(to: -60, speed: 2000)
            await line(to: 0, speed: 400)
            await line(to: -25, speed: 400)
            await line(to: 0, speed: 300)
            try? await Task.sleep(for: .milliseconds(200))
            KBodyLog.hit("FEEDHIT demo M: scroll-to-top with no finger from card 3 (expect silent)")
            hits.phase(user: false, active: true)
            y = marks[2]; set(y)
            try? await Task.sleep(for: .milliseconds(100))
            y = 0; set(y)
            try? await Task.sleep(for: .milliseconds(100))
            hits.phase(user: false, active: false)
            KBodyLog.hit("FEEDHIT demo end")
        }
        return v
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    private static func find(in view: UIView) -> UIScrollView? {
        if let s = view as? UIScrollView, s.contentSize.height > s.bounds.height { return s }
        for sub in view.subviews { if let s = find(in: sub) { return s } }
        return nil
    }
}
#endif
