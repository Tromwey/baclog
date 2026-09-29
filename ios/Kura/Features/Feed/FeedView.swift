import SwiftUI

/// Feed v10 · a STACK of tinted cards: each card pins under the header and the
/// next one slides over it. Tiers L 620 / M 500 / S 370 (capped to the screen
/// so the next card's edge always shows), snap per card.
struct FeedView: View {
    @Environment(AppStore.self) private var store
    @State private var position: String?
    /// How far the stack has scrolled. Held in a reference so a scroll frame only
    /// re-renders the cards' pin/band (`FeedStackCard`), never this view or the cards' content.
    @State private var scroll = FeedScroll()
    /// The "card hits the top" haptic. A plain reference: scroll frames never re-render through it.
    @State private var hits = FeedHits()

    /// How far a card's body runs past its own height, so the card rising from
    /// underneath always mounts over filled color instead of bare bg.
    private let ext: CGFloat = 120
    /// E1 stays up once shown, until you leave the tab: following the first suggestion used to
    /// flip the feed to "quiet" on the spot and the other suggestions went with it.
    @State private var holdEmpty = false

    #if DEBUG
    /// `-kuraFeedSkeleton YES`: the skeleton stays up (the mock loads too fast to see it), with
    /// `-kuraBodyLog YES` it logs `FEEDSKEL` frames to line up against the loaded stack's `FEEDGEO`.
    private static let debugSkeleton = UserDefaults.standard.bool(forKey: "kuraFeedSkeleton")
    #else
    private static let debugSkeleton = false
    #endif

    var body: some View {
        Group {
            if Self.debugSkeleton {
                loading
            } else if store.loadState == .failed {
                // The launch failed: "nobody you follow" would be a lie — we don't know yet.
                failed(store.loadError(.library) ?? .server("")) { Task { await store.bootstrap() } }
            } else if holdEmpty || (store.following.isEmpty && store.me.followingCount == 0) {
                FeedEmptyView()
                    .onAppear { holdEmpty = true }
            } else if !store.feedLoaded && store.visibleFeed.isEmpty, let e = store.loadError(.feed) {
                failed(e) { Task { await store.loadFeed(force: true) } }
            } else if !store.feedLoaded && store.visibleFeed.isEmpty {
                loading
            } else if store.visibleFeed.isEmpty {
                quiet
            } else {
                stack
            }
        }
        .task { await store.loadFeed() }
        // Every tab is mounted at launch, so the first load may predate the first follow:
        // reload when the tab is shown with a stale followed set.
        .onChange(of: store.tab) { _, tab in
            if tab != .feed { holdEmpty = false }
            if tab == .feed && store.feedStale { Task { await store.loadFeed(force: true) } }
        }
    }

    /// Followed people, nothing from them yet.
    private var quiet: some View {
        VStack(spacing: 0) {
            header
            VStack(alignment: .leading, spacing: 14) {
                Text("tu gente anda tranquila.").font(.kura.news(32)).foregroundStyle(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Cuando completen, se obsesionen o reseñen algo, aparece aquí.")
                    .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
                GlassButton(title: "Buscar más gente", systemImage: "magnifyingglass", flat: true) { store.select(.discover) }
                    .padding(.top, 6)
            }
            .padding(.horizontal, 28)
            .padding(.top, 60)
            Spacer()
        }
        .background(KColor.bg.ignoresSafeArea())
        .ignoresSafeArea(.container, edges: [.top, .bottom])
    }

    /// `GET /feed` failed before anything arrived.
    private func failed(_ e: KuraAPIError, retry: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            header
            LoadErrorBlock(error: e, titleSize: 32, retry: retry)
                .padding(.horizontal, 28)
                .padding(.top, 60)
            Spacer()
        }
        .background(KColor.bg.ignoresSafeArea())
        .ignoresSafeArea(.container, edges: [.top, .bottom])
    }

    /// The stack's shape while `GET /feed` runs — the SAME geometry as `stack` at rest (founder,
    /// 2026-09-27: the old skeleton started its card under the title, the feed runs it up to the
    /// top): card 0 runs up behind the transparent header with no corners and its content starts
    /// at `hdr`; card 1 starts at `hdr` + card 0's tier height, rounded, with the stack's shadow.
    /// Both are M (every cover card is M; the feed nearly always opens on one) and are laid out
    /// by `FeedSkeletonCard`, which uses `FeedCardInset` and the real chip/pill heights. Neutral
    /// tint (`palette(nil)`): the colour is the one thing a skeleton can't know.
    private var loading: some View {
        GeometryReader { geo in
            let base = geo.size.height - headerTop
            let h = tierHeight(.M, base: base)
            let pal = palette(nil)
            ZStack(alignment: .top) {
                VStack(spacing: 0) {
                    // Like the live stack, card 0's surface runs `ext` on under card 1: what shows
                    // behind card 1's rounded corners and its upward shadow is card 0, never the black bg.
                    FeedSkeletonCard(index: 0, height: h, topInset: hdr)
                        .frame(height: h + hdr + ext, alignment: .top)
                        .background(Tint.card(pal))
                        .padding(.bottom, -ext)
                    FeedSkeletonCard(index: 1, height: h, topInset: 0)
                        .frame(maxHeight: .infinity, alignment: .top)
                        .background(Tint.card(pal))
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: KRadius.screen, topTrailingRadius: KRadius.screen, style: .continuous))
                        .background(alignment: .top) {
                            // The resting band of the stack (`FeedStackCard`, p = 0): its shadow casts upward.
                            UnevenRoundedRectangle(topLeadingRadius: KRadius.screen, topTrailingRadius: KRadius.screen, style: .continuous)
                                .fill(Tint.ends(pal).0.color)
                                .frame(height: hdr + KRadius.screen * 3)
                                .kShadow(.stack, opacity: 1)
                        }
                }
                header(transparent: true)
            }
            #if DEBUG
            .onChange(of: h, initial: true) { _, h in
                guard h > 0 else { return }
                KBodyLog.hit(String(format: "FEEDSKEL row 0 top 0.0 h %.1f · row 1 top %.1f h %.1f · hdr %.1f", h + hdr, hdr + h, h, hdr))
            }
            #endif
        }
        .background(KColor.bg)
        .ignoresSafeArea(.container, edges: [.top, .bottom])
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tu feed")
    }

    private static let space = "feed.stack"

    /// Top of the header block: the status bar, less the 12 pt the design's
    /// header pads above its bell (so the bell lands on `chromeTop` like every screen).
    private var headerTop: CGFloat { KSize.chromeTop - 12 }
    /// Where the stack pins: under the 63 pt sticky header of Feed v10.
    private var hdr: CGFloat { headerTop + 63 }

    private var stack: some View {
        GeometryReader { geo in
            let events = store.visibleFeed
            // The design's frame starts below the status bar: tiers are fractions of that.
            let base = geo.size.height - headerTop
            let rows = layout(events, base: base)
            let scroll = self.scroll
            // Card i ≥ 1 pins under the header when the stack has scrolled by its layout top
            // less `hdr` (the heights of the cards above it): that's where it hits the top.
            let marks = rows.dropFirst().map { $0.top - hdr }
            ZStack(alignment: .top) {
                ScrollView(showsIndicators: false) {
                    // Lazy: only the cards near the screen exist (a long history never mounts whole).
                    LazyVStack(spacing: 0) {
                        ForEach(rows) { row in
                            FeedStackCard(row: row, hdr: hdr, ext: ext, scroll: scroll)
                        }
                        // The stack's light continues past the last card.
                        Tint.ends(rows.last?.palette ?? palette(nil)).1.color
                            .frame(height: max(geo.size.height - hdr - tierHeight(events.last?.tier ?? .M, base: base), 0) + ext)
                            .overlay(alignment: .top) {
                                // The next page loads when the END of the stack comes into view — its own
                                // view, re-made per page, so a page that adds little (or nothing visible)
                                // still asks again when it lands on screen.
                                Color.clear.frame(height: 1)
                                    .onAppear { Task { await store.loadMoreFeed() } }
                                    .id(rows.last?.id)
                            }
                            .overlay(alignment: .top) {
                                // The next page failed: no auto-retry on scroll, the end of the stack offers it.
                                if let e = store.loadError(.feedMore) {
                                    RetryStrip(error: e, text: e == .offline ? "Sin conexión. No se cargó lo anterior." : "No se cargó lo anterior.") {
                                        Task { await store.loadMoreFeed(retry: true) }
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.top, ext + 16)
                                }
                            }
                            .zIndex(store.loadError(.feedMore) == nil ? -1 : Double(events.count))
                    }
                    .scrollTargetLayout()
                    .background {
                        GeometryReader { g in
                            Color.clear.onChange(of: g.frame(in: .named(FeedView.space)).minY, initial: true) { _, v in
                                scroll.offset = hdr - v
                            }
                        }
                    }
                }
                .coordinateSpace(name: FeedView.space)
                .kNoTopEdgeEffect()
                // Cards snap under the header (scroll-padding-top); the first one runs up behind it.
                .contentMargins(.top, hdr, for: .scrollContent)
                .scrollTargetBehavior(.viewAligned)
                .scrollPosition(id: $position, anchor: .top)
                .feedHits(hits, marks: marks)
                #if DEBUG
                .background { FeedHitDemo(hits: hits, marks: marks) }
                #endif
                .task {
                    guard let anchor = store.debugFeedAnchor else { return }
                    try? await Task.sleep(for: .milliseconds(900))
                    position = anchor
                }

                header(transparent: true)
                    .zIndex(1)
                    #if DEBUG
                    .onAppear {
                        // The skeleton's `FEEDSKEL` line, from the real rows: the two must match.
                        guard rows.count > 1 else { return }
                        KBodyLog.hit(String(format: "FEEDROWS row 0 top 0.0 h %.1f · row 1 top %.1f h %.1f · hdr %.1f",
                                            rows[0].height + hdr, rows[1].top, rows[1].height, hdr))
                    }
                    #endif

                if let e = store.loadError(.feed) {
                    // A refresh (or its titles) failed over a feed already on screen: say it's old.
                    RetryStrip(error: e, text: e == .offline ? nil : "No se pudo actualizar tu feed.") {
                        Task { await store.loadFeed(force: true) }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, hdr)
                    .zIndex(2)
                }
            }
        }
        .background(KColor.bg)
        .ignoresSafeArea(.container, edges: [.top, .bottom])
    }

    /// Everything a card needs that doesn't move with the scroll, computed once per data
    /// (or size) change: its height, its layout top at rest (a running sum, not a sum per
    /// card) and its palette.
    private func layout(_ events: [FeedEvent], base: CGFloat) -> [FeedStackRow] {
        var rows: [FeedStackRow] = []
        rows.reserveCapacity(events.count)
        // Layout top of each card on screen at rest: the first runs up behind the header,
        // each next one starts where the previous card's own height ends.
        var above: CGFloat = 0
        for (i, e) in events.enumerated() {
            let h = tierHeight(e.tier, base: base)
            rows.append(FeedStackRow(event: e, index: i, height: h, top: i == 0 ? 0 : hdr + above, palette: palette(e)))
            above += h
        }
        return rows
    }

    private var header: some View { header(transparent: false) }

    /// Feed v10 header: 63 pt, Newsreader 36 + the bell. Over the stack it's transparent —
    /// the card on top paints the band behind it.
    private func header(transparent: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("tu feed").font(.kura.screenTitle).foregroundStyle(KColor.text)
                // Lands on `KSize.titleTop`, like every tab's title.
                .padding(.top, KSize.titleTop - headerTop - 12)
                .accessibilityAddTraits(.isHeader)
                .allowsHitTesting(false)
            Spacer()
            ZStack(alignment: .topTrailing) {
                IconChip44(systemName: "bell", iconSize: 17, weight: .medium, label: store.hasUnread ? "Notificaciones, hay nuevas" : "Notificaciones") {
                    store.push(.notifications)
                }
                if store.hasUnread {
                    Circle().fill(KColor.text).frame(width: 8, height: 8)
                        .background(Circle().fill(KColor.bg.opacity(0.6)).padding(-2))
                        .offset(x: -11, y: 10)
                        .allowsHitTesting(false)
                }
            }
        }
        .padding(.leading, 20)
        .padding(.trailing, KSize.chromeSide)
        .padding(.top, headerTop + 12)
        .frame(height: hdr, alignment: .top)
        .frame(maxWidth: .infinity)
        .background(transparent ? Color.clear : KColor.bg)
        .kFixedChrome()
    }

    /// Three fixed heights; the fraction only caps them so the next card always shows.
    private func tierHeight(_ t: FeedEvent.Tier, base: CGFloat) -> CGFloat {
        switch t {
        case .L: return min(620, base * 0.72)
        case .M: return min(500, base * 0.58)
        case .S: return min(370, base * 0.44)
        }
    }

    /// A card is never lit by nothing: the cover's palette, else the author's.
    private func palette(_ e: FeedEvent?) -> [String] {
        guard let e else { return ["#6c6b76"] }
        switch e.kind {
        case .burst(_, let ids):
            let first = ids.first.flatMap { store.title($0)?.palette } ?? []
            let last = ids.last.flatMap { store.title($0)?.palette } ?? []
            if let a = first.first { return [a, last.count > 1 ? last[1] : a] }
        case .suggestion(let pid, _, _, _):
            if let p = store.person(pid), !p.hexes.isEmpty { return p.hexes }
        default:
            if let id = e.titleID, let t = store.title(id) { return t.palette }
        }
        return store.person(e.authorID)?.hexes ?? ["#6c6b76"]
    }
}

// MARK: - Hits

/// "La card golpea la parte superior" (founder, 2026-09-27): a rigid tap the instant a card's
/// top reaches the line it pins at — under the 63 pt header, `hdr`. That line is the top of the
/// visible content (above it is chrome: status bar, title, bell) and it's where the card
/// physically STOPS in this stack, so it's the collision, not an arbitrary line.
///
/// - Only rising cards (the offset grows past a mark) and only under the finger or its
///   momentum (`.interacting` / `.decelerating`, or an `.animating` settle right after them):
///   the first load, content that lands, a programmatic jump (`scrollPosition`, scroll-to-top,
///   which start from `.idle`) move the marks silently.
/// - Once per crossing: a mark re-arms only after its card drops `rearm` pt back below it
///   (the snap's last fractions of a point and the rubber band never re-fire it).
/// - One tap per burst: several marks in one frame, or within `gap`, are one hit.
/// - Strength follows the speed over the last ~100 ms: `floor` for the snap's slow landing
///   (it decelerates exponentially into the mark, so it always arrives slow), up to `cap` for
///   a fling that runs cards through the top.
///
/// The pull (founder, 2026-09-27: "el opuesto a cuando toca el techo"): scrolling back UP, the
/// card above drops onto that same line, dragged down by the one below — `KHaptic.pull`, soft,
/// on the offset coming down to a mark (card 0's is the top, 0). Mirror rules: finger only,
/// `tolerance` above the mark (the snap's landing from above is one pull), re-arms `rearm` pt
/// above it, same `gap`, and the rubber band past the top is clamped so it never pulls.
///
/// iOS 18+ (`onScrollPhaseChange` is what tells a finger from code); on 17 there's no hit
/// rather than a hit that could fire on a programmatic scroll.
@MainActor
private final class FeedHits {
    /// Scroll offsets at which card 1, 2, … pins. Ascending.
    private var marks: [CGFloat] = []
    /// How many marks the stack is past; the rest are armed.
    private var passed = 0
    /// The pull's marks: `0` (card 0 back at the top) then `marks`. Pull mark j = card j aligned.
    private var pullMarks: [CGFloat] = [0]
    /// How many pull marks the offset is above (armed to pull when it comes back down); the
    /// last one it dropped onto is card `above`.
    private var above = 0
    private var offset: CGFloat = 0
    private var userDriven = false
    private var samples: [(t: CFTimeInterval, y: CGFloat)] = []
    /// Shared by hit and pull: any feed haptic within `gap` of the last is merged away, so one
    /// crossing never plays both.
    private var lastHit: CFTimeInterval = -1

    /// How close counts as touching. The snap decelerates exponentially into the mark and
    /// crawls its last points (UIKit's rate: ~0.8 s from 4 pt to 1 pt); 4 pt is contact to the
    /// eye (a hairline gap under the header) without the tap arriving late.
    private static let tolerance: CGFloat = 4
    private static let rearm: CGFloat = 8
    private static let gap: CFTimeInterval = 0.06
    private static let window: CFTimeInterval = 0.1
    private static let floor: CGFloat = 0.4
    private static let cap: CGFloat = 0.9
    /// The pull is the `.soft` generator: a compliant body, weaker per unit than `.rigid`, so its
    /// range sits a notch higher to stay felt on the snap's slow landing.
    private static let pullFloor: CGFloat = 0.5
    private static let pullCap: CGFloat = 0.85
    /// Speed (pt/s) at which the tap reaches `cap`.
    private static let fullSpeed: CGFloat = 2400

    func setMarks(_ m: [CGFloat]) {
        guard m != marks else { return }
        marks = m
        pullMarks = [0] + m
        // New data (a page, a refresh) never fires: re-seat on the current offset.
        passed = m.prefix { $0 - Self.tolerance <= offset }.count
        let y = max(offset, 0)
        above = pullMarks.prefix { y > $0 + Self.tolerance }.count
    }

    func phase(user: Bool, active: Bool) {
        userDriven = user
        if active {
            KHaptic.prepare(.hit(intensity: 0))
            KHaptic.prepare(.pull(intensity: 0))
        } else { samples.removeAll(keepingCapacity: true) }
        #if DEBUG
        KBodyLog.hit("FEEDHIT phase user=\(user) active=\(active) off \(Int(offset))")
        #endif
    }

    func scrolled(to y: CGFloat) {
        let previous = offset
        offset = y
        let now = CACurrentMediaTime()
        samples.append((now, y))
        samples.removeAll { now - $0.t > Self.window }

        // Hit: a card rises into the header line.
        var crossed = 0
        while passed < marks.count, y >= marks[passed] - Self.tolerance { passed += 1; crossed += 1 }
        while passed > 0, y < marks[passed - 1] - Self.tolerance - Self.rearm { passed -= 1 }

        // Pull: scrolling back up, the card above drops onto the line (the offset comes down to
        // its mark + tolerance); re-arms once the offset goes `rearm` pt back above. The rubber
        // band past the top (offset < 0) is clamped to 0: it never pulls or re-arms anything.
        let p = max(y, 0)
        var pulled = 0
        while above < pullMarks.count, p > pullMarks[above] + Self.tolerance + Self.rearm { above += 1 }
        while above > 0, p <= pullMarks[above - 1] + Self.tolerance { above -= 1; pulled += 1 }

        // One frame moves one way: only the matching event can sound (belt and braces over the
        // hysteresis, which already keeps a hit and a pull off the same mark).
        if crossed > 0, y > previous { fire(pull: false, card: passed, count: crossed, y: y, mark: marks[passed - 1], now: now) }
        if pulled > 0, y < previous { fire(pull: true, card: above, count: pulled, y: y, mark: pullMarks[above], now: now) }
    }

    private func fire(pull: Bool, card: Int, count: Int, y: CGFloat, mark: CGFloat, now: CFTimeInterval) {
        #if DEBUG
        let tag = pull ? "FEEDPULL" : "FEEDHIT"
        #endif
        guard userDriven else {
            #if DEBUG
            KBodyLog.hit("\(tag) silent card \(card) (not the finger) off \(Int(y))")
            #endif
            return
        }
        guard now - lastHit >= Self.gap else {
            #if DEBUG
            KBodyLog.hit("\(tag) merged card \(card) (\(Int((now - lastHit) * 1000)) ms after the last)")
            #endif
            return
        }
        let first = samples.first ?? (now, y)
        let dt = now - first.t
        let travel = pull ? first.y - y : y - first.y
        let speed = dt > 0.008 ? max(0, travel / CGFloat(dt)) : 0
        let (lo, hi) = pull ? (Self.pullFloor, Self.pullCap) : (Self.floor, Self.cap)
        let intensity = min(hi, lo + (hi - lo) * speed / Self.fullSpeed)
        KHaptic.play(pull ? .pull(intensity: intensity) : .hit(intensity: intensity))
        lastHit = now
        #if DEBUG
        KBodyLog.hit(String(format: "%@ card %d x%d off %.1f mark %.1f speed %.0f intensity %.2f",
                            tag, card, count, y, mark, speed, intensity))
        #endif
    }
}

private extension View {
    @ViewBuilder func feedHits(_ hits: FeedHits, marks: [CGFloat]) -> some View {
        if #available(iOS 18.0, *) {
            onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top } action: { _, y in
                hits.scrolled(to: y)
            }
            .onScrollPhaseChange { old, p in
                // A finger, its momentum, or the settle that follows them (should the snap report
                // `.animating`). Code-driven scrolls start from `.idle`: never user.
                let fromUser = old == .interacting || old == .decelerating
                hits.phase(user: p == .interacting || p == .decelerating || (p == .animating && fromUser),
                           active: p != .idle)
            }
            .onChange(of: marks, initial: true) { _, m in hits.setMarks(m) }
        } else {
            self
        }
    }
}

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
private struct FeedHitDemo: UIViewRepresentable {
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

// MARK: - Stack

/// The stack's scroll offset (0 at rest). Only `FeedStackCard` reads it.
@Observable
private final class FeedScroll {
    var offset: CGFloat = 0
}

/// One card's place in the stack, fixed until the data (or the screen size) changes.
private struct FeedStackRow: Identifiable {
    let event: FeedEvent
    let index: Int
    let height: CGFloat
    /// Layout top at rest.
    let top: CGFloat
    /// The card is never lit by nothing: the cover's palette, else the author's.
    let palette: [String]
    var id: String { event.id }
}

/// One card of the stack. The first runs up behind the header (no corners); the rest pin
/// under it and, as they arrive, raise a band of their own color over the header.
/// The only part of the feed that re-renders per scroll frame; its content (`FeedCard`)
/// doesn't depend on the offset and is skipped.
private struct FeedStackCard: View {
    let row: FeedStackRow
    let hdr: CGFloat
    let ext: CGFloat
    let scroll: FeedScroll

    var body: some View {
        let first = row.index == 0
        let h = row.height
        // Where the card's top would be on screen if it didn't pin.
        let y = row.top - scroll.offset
        let pin = first ? 0 : hdr
        let lift = hdr + KRadius.screen
        // The band: 0 → 1 over the last 140 pt before the card takes the top place.
        let p = min(max(1 - (y - hdr) / 140, 0), 1)
        let rise = lift * p * p * (3 - 2 * p)
        FeedCard(event: row.event, height: h, topInset: first ? hdr : 0)
            .equatable()
            .frame(height: h + ext + (first ? hdr : 0), alignment: .top)
            .background(Tint.card(row.palette))
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: first ? 0 : KRadius.screen,
                                              topTrailingRadius: first ? 0 : KRadius.screen,
                                              style: .continuous))
            .background(alignment: .top) {
                if !first {
                    // The band: the card's own surface, uncovered upward over the last 140 pt.
                    UnevenRoundedRectangle(topLeadingRadius: KRadius.screen, topTrailingRadius: KRadius.screen, style: .continuous)
                        .fill(Tint.ends(row.palette).0.color)
                        .frame(height: lift + KRadius.screen * 2)
                        // The stack shadow casts UPWARD: as the band reaches the top it crossed the
                        // status bar as a dark line. It fades out as the band finishes rising.
                        .kShadow(.stack, opacity: 1 - p)
                        .offset(y: -rise)
                } else {
                    // The first card runs up behind the header; pulled past the top, its color
                    // keeps going instead of opening a black gap.
                    Color.clear.kOverscrollFill(Tint.ends(row.palette).0.color)
                }
            }
            .padding(.top, first ? -hdr : 0)
            .padding(.bottom, -ext)
            .offset(y: max(0, pin - y))
            .zIndex(Double(row.index))
    }
}

// MARK: - Card

private struct FeedCard: View, Equatable {
    @Environment(AppStore.self) private var store
    let event: FeedEvent
    let height: CGFloat
    /// The first card runs up behind the header: its content starts below it.
    var topInset: CGFloat = 0

    /// What the parent hands in; the store's changes reach the body through Observation.
    static func == (a: FeedCard, b: FeedCard) -> Bool {
        a.event == b.event && a.height == b.height && a.topInset == b.topInset
    }

    static let space = "feed.card"

    private var title: Title? { event.titleID.flatMap { store.title($0) } }
    private var author: Person? { store.person(event.authorID) }
    private var isMe: Bool { event.authorID == store.me.id }
    private var isSuggestion: Bool { if case .suggestion = event.kind { return true }; return false }

    /// Max height of the text block per tier (L 180 · M/S 105); a suggestion never clips.
    private var textMax: CGFloat? {
        if isSuggestion { return nil }
        return event.tier == .L ? 180 : 105
    }

    var body: some View {
        VStack(alignment: .leading, spacing: FeedCardInset.gap) {
            if isSuggestion {
                // The suggestion's header, where the author chip goes on every other card: the card pill.
                StatusPill(glyph: .users, label: "Sugerencia para ti")
            } else if let author {
                HStack(spacing: 8) {
                    Button { if author.id != store.me.id { store.push(.person(author.id)) } } label: {
                        AuthorChip(person: author, age: FeedCard.when(event.ageHours))
                    }
                    .buttonStyle(.plain)
                    Spacer(minLength: 0)
                    // Someone else's review: report it (or block its author) right here.
                    if let r = store.review(event.reviewID), ReviewMenu.applies(to: r, me: store.me.id) {
                        ReviewMenu(review: r)
                    }
                }
            }
            art
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .feedGeo("art", event.id)
            // The block hugs its text (up to its tier's cap) and the art takes the rest, so every
            // variant ends `FeedCardInset.bottom` above the card's edge. A `.frame(maxHeight:)`
            // here stretched the block to its cap and left 36–71 pt of empty band under short
            // text (founder, 2026-09-27: "la separación inferior es irregular").
            CappedHeight(max: textMax) {
                textBlock.feedGeo("text", event.id)
            }
            .clipped()
            .feedGeo("block", event.id)
        }
        .padding(.horizontal, 20)
        .padding(.top, FeedCardInset.top + topInset)
        .padding(.bottom, FeedCardInset.bottom)
        .frame(height: height + topInset, alignment: .top)
        .feedGeo("card", event.id)
        .coordinateSpace(name: FeedCard.space)
        .contentShape(Rectangle())
        // A plain tap, no press fill: `.row`'s rounded fill is a list-row affordance and on a
        // full-bleed feed card it drew a stray card-shaped box under the finger. Bursts and
        // suggestions have no single title to open (their covers are their own buttons).
        .onTapGesture {
            if let id = event.titleID { store.push(.title(id)) }
        }
        // Tier heights are exact: the card's text stops growing at xxxLarge (it clips past its block).
        .kFixedChrome()
        .accessibilityElement(children: .contain)
    }

    // MARK: Art

    @ViewBuilder private var art: some View {
        switch event.kind {
        case .burst(_, let ids):
            // A strip of the burst's covers, each at its format's ratio; it drops in height
            // until the widest cover fits the card whole. The snap centers a cover — except the
            // first, which snaps to the start, and the last, to the end (`BurstSnap`).
            // Each cover carries its title and artist/format underneath (`BurstCaption`); the
            // caption's height comes out of the art, so the card — and `FeedHits`' marks — keep
            // their tier height.
            let ts = ids.compactMap { store.title($0) }
            let widest = ts.map(\.format.aspect).max() ?? 1
            GeometryReader { geo in
                let h = max(min(geo.size.height - BurstCaption.height, (geo.size.width + 40) / widest), 0)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: BurstSnap.spacing) {
                        ForEach(ts) { t in
                            Button { store.push(.title(t.id)) } label: {
                                VStack(alignment: .leading, spacing: 0) {
                                    CoverView(title: t, height: h).zoomSource(ZoomID.title(t.id))
                                    BurstCaption(title: t)
                                }
                                .frame(width: h * t.format.aspect, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(BurstCaption.label(t))
                            .accessibilityAddTraits(.isButton)
                        }
                    }
                    .padding(.horizontal, BurstSnap.margin)
                }
                .scrollTargetBehavior(BurstSnap(widths: ts.map { h * $0.format.aspect }))
                .scrollClipDisabled()
                .frame(height: h + BurstCaption.height)
                .feedGeo("cover", event.id)
                .padding(.horizontal, -20)
                .frame(width: geo.size.width, height: geo.size.height)
            }
        case .suggestion(_, _, _, let ids):
            // The title the reason names goes in the middle and in front; the other two flank it.
            let ts = ids.compactMap { store.title($0) }
            let order = ts.count >= 3 ? [ts[1], ts[0], ts[2]] : ts
            let front = ts.count >= 3 ? 1 : order.count / 2
            GeometryReader { geo in
                let h = geo.size.height * 0.64
                ZStack {
                    ForEach(Array(order.enumerated()), id: \.element.id) { i, t in
                        let pos = CGFloat(i - front)
                        CoverView(title: t, height: h)
                            .rotationEffect(.degrees(Double(pos) * 8))
                            .offset(x: pos * 58)
                            .zIndex(i == front ? 3 : 1)
                    }
                }
                .feedGeo("cover", event.id)
                .frame(width: geo.size.width, height: geo.size.height)
            }
        default:
            if let t = title {
                GeometryReader { geo in
                    let w = min(geo.size.width, geo.size.height * t.format.aspect)
                    CoverView(title: t, width: w, height: w / t.format.aspect).zoomSource(ZoomID.title(t.id))
                        .feedGeo("cover", event.id)
                        .frame(width: geo.size.width, height: geo.size.height)
                }
            }
        }
    }

    // MARK: Text

    @ViewBuilder private var textBlock: some View {
        VStack(alignment: .leading, spacing: 9) {
            let pills = self.pills
            if !pills.isEmpty {
                FlowLayout(spacing: 7, lineSpacing: 7) {
                    ForEach(Array(pills.enumerated()), id: \.offset) { _, p in StatusPill(glyph: p.0, label: p.1) }
                    // "guardó … en" + the collection's own name: Newsreader roman lowercase, its
                    // identity everywhere else (crítica #22), not mono caps inside the pill.
                    if let c = addedCollection { collectionName(c) }
                }
            }
            switch event.kind {
            case .suggestion(let pid, let reason, let social, let ids):
                // Roman sentence, the work in italic (crítica #37: all-italic hid which part is the work).
                Self.reasonText(reason, works: ids.compactMap { store.title($0)?.name })
                    .font(.kura.news(26))
                    .foregroundColor(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                if let p = store.person(pid) {
                    Button { store.push(.person(p.id)) } label: {
                        HStack(spacing: 12) {
                            Seal(person: p, size: 44)
                            Text("@\(p.handle)").font(.kura.ui(17, .semibold)).foregroundStyle(KColor.text).lineLimit(1)
                        }
                    }
                    .buttonStyle(.plain)
                    Text(social)
                        .font(.kura.ui(14))
                        .foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                    FollowButton(state: FollowState(following: store.isFollowing(p.id)), size: .card, honey: true) { store.toggleFollow(p.id) }
                        .padding(.top, 4)
                }
            case .burst:
                EmptyView()
            default:
                if let t = title {
                    (Text(t.name).foregroundColor(KColor.text)
                     + Text(tail(t)).foregroundColor(KColor.text2))
                        .font(.kura.newsItalic(26))
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let r = store.review(event.reviewID) {
                    let revealed = !r.spoiler || store.revealedSpoilers.contains(r.id)
                    ZStack {
                        Text(r.text)
                            .font(.kura.ui(15))
                            .lineSpacing(4)
                            .foregroundStyle(KColor.text)
                            .lineLimit(3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .opacity(revealed ? 1 : 0.4)
                            .blur(radius: revealed ? 0 : 6)
                            .accessibilityHidden(!revealed)
                        if !revealed {
                            SpoilerPill { store.revealedSpoilers.insert(r.id) }
                        }
                    }
                    .padding(.top, 2)
                    .animation(KMotion.fade, value: revealed)
                }
            }
        }
    }

    /// " · creator" (artist, studio/network), the format when there's none — never the year: the
    /// same second datum the burst's captions carry (crítica #21).
    private func tail(_ t: Title) -> String {
        " · " + (t.creator ?? t.format.metaLabel)
    }

    /// The collection an add / a burst went into, drawn after its pill.
    private var addedCollection: String? {
        switch event.kind {
        case .added(let c), .burst(let c, _): return c.isEmpty ? nil : c
        default: return nil
        }
    }

    /// The collection's name, tappable when there's somewhere to go: yours (by id, else by name —
    /// the mock's events carry none), or someone's public collection page.
    @ViewBuilder private func collectionName(_ name: String) -> some View {
        let text = Text(name)
            .font(.kura.news(17))
            .foregroundStyle(KColor.text)
            .lineLimit(1)
            .frame(height: KPill.card.height)
        if let open = openCollection(named: name) {
            Button(action: open) { text.contentShape(Rectangle()) }
                .buttonStyle(.plain)
                .accessibilityLabel("Colección \(name)")
                .accessibilityAddTraits(.isButton)
        } else {
            text
        }
    }

    private func openCollection(named name: String) -> (() -> Void)? {
        if isMe {
            let mine = event.collectionID.flatMap { store.collection($0) }
                ?? store.collections.first { $0.name == name }
            guard let c = mine else { return nil }
            return { store.push(.collection(c.id)) }
        }
        guard let id = event.collectionID, let a = author else { return nil }
        return { store.push(.publicCollection(handle: a.handle, id: id)) }
    }

    /// The suggestion's reason with every named work in italic; the rest roman.
    static func reasonText(_ reason: String, works: [String]) -> Text {
        var ranges: [Range<String.Index>] = []
        for w in works where !w.isEmpty {
            var from = reason.startIndex
            while let r = reason.range(of: w, range: from..<reason.endIndex) {
                if !ranges.contains(where: { $0.overlaps(r) }) { ranges.append(r) }
                from = r.upperBound
            }
        }
        ranges.sort { $0.lowerBound < $1.lowerBound }
        var out = Text("")
        var i = reason.startIndex
        for r in ranges {
            if i < r.lowerBound { out = out + Text(String(reason[i..<r.lowerBound])) }
            out = out + Text(String(reason[r])).font(.kura.newsItalic(26))
            i = r.upperBound
        }
        if i < reason.endIndex { out = out + Text(String(reason[i...])) }
        return out
    }

    /// One vocabulary of states: each is a pill with its glyph. A completed title with a
    /// reaction shows only the reaction; a waiting add shows only the wait.
    private var pills: [(Glyph, String)] {
        func react(_ m: Mark?) -> (Glyph, String)? {
            guard let m, m != .completed else { return nil }
            return (m.glyph, isMe ? m.myLabel : m.theirLabel)
        }
        switch event.kind {
        case .obsessed:
            return [(.flame, isMe ? "Me obsesiona" : "Le obsesiona")]
        case .completed(let m):
            return [react(m) ?? (.check, "Completo")]
        case .reviewed:
            return [(.review, isMe ? "Reseñaste" : "Reseñó")] + [react(store.review(event.reviewID)?.mark)].compactMap { $0 }
        case .added(let c):
            // The name follows the pill (`collectionName`); without one, the verb stands alone.
            return [(.bookmark, (isMe ? "Guardaste" : "Guardó") + (c.isEmpty ? "" : " en"))]
        case .waitingAdd(_, let label):
            return [(.clock, (isMe ? "No puedo esperar · " : "No puede esperar · ") + label)]
        case .burst(_, let ids):
            return [(.bookmark, isMe ? "Guardaste \(ids.count) títulos en" : "Guardó \(ids.count) títulos en")]
        case .suggestion:
            return []
        }
    }

    static func when(_ h: Double) -> String {
        if h < 1 { return "hace \(max(1, Int(h * 60))) min" }
        if h < 24 { return "hace \(Int(h)) h" }
        if h < 7 * 24 { return "hace \(Int(h / 24)) d" }
        if h < 35 * 24 { return "hace \(Int(h / (7 * 24))) sem" }
        let months = Int(h / (30 * 24))
        if months < 12 { return months == 1 ? "hace 1 mes" : "hace \(months) meses" }
        let years = months / 12
        return years == 1 ? "hace 1 año" : "hace \(years) años"
    }
}

/// One card of the loading stack, laid out like an M `FeedCard` whose title fits one line (the
/// feed's usual opener): author chip (36 — seal 28 + 4/4), the 2:3 cover filling the art, and the
/// text block (a `KPill.card` pill, 9, one Newsreader italic 26 line) ending `FeedCardInset.bottom`
/// above the edge. Heights come from the real parts (the title line is a hidden `Text` in that
/// font), so the skeleton → content swap doesn't move a line. Logs `FEEDGEO` in the card's space
/// under `-kuraBodyLog YES`, tagged `skel<index>`.
private struct FeedSkeletonCard: View {
    let index: Int
    let height: CGFloat
    let topInset: CGFloat

    var body: some View {
        let id = "skel\(index)"
        VStack(alignment: .leading, spacing: FeedCardInset.gap) {
            Capsule().fill(KColor.glassBg)
                .frame(width: 168, height: 36)
                .overlay(alignment: .leading) {
                    Skeleton(radius: 999).frame(width: 28, height: 28).padding(.leading, 4)
                }
                .feedGeo("chip", id)
            GeometryReader { geo in
                let w = min(geo.size.width, geo.size.height * 2 / 3)
                Skeleton(radius: KRadius.coverL)
                    .frame(width: w, height: w * 3 / 2)
                    .feedGeo("cover", id)
                    .frame(width: geo.size.width, height: geo.size.height)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .feedGeo("art", id)
            VStack(alignment: .leading, spacing: 9) {
                Capsule().fill(KColor.glassBg).frame(width: 150, height: KPill.card.height)
                Text(verbatim: "Título")
                    .font(.kura.newsItalic(26))
                    .fixedSize(horizontal: false, vertical: true)
                    .hidden()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .leading) { Skeleton(radius: 6).frame(width: 210, height: 22) }
            }
            .feedGeo("block", id)
        }
        .padding(.horizontal, 20)
        .padding(.top, FeedCardInset.top + topInset)
        .padding(.bottom, FeedCardInset.bottom)
        .frame(height: height + topInset, alignment: .top)
        .feedGeo("card", id)
        .coordinateSpace(name: FeedCard.space)
        .kFixedChrome()
    }
}

/// The card's inner rhythm — one source for every variant. Cards abut in the stack (each starts
/// where the one above ends), so the space between the last line of a card and the first chip of
/// the next is always `bottom + top`.
enum FeedCardInset {
    static let top: CGFloat = 18
    static let bottom: CGFloat = 22
    /// Chip → art → text.
    static let gap: CGFloat = 14
}

/// Its content at its natural height, capped at `max` (nil: uncapped) — and never taller: a
/// flexible `.frame(maxHeight:)` grows to whatever the stack offers up to the cap.
private struct CappedHeight: Layout {
    let max: CGFloat?

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let natural = child.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil))
        return CGSize(width: proposal.width ?? natural.width, height: Swift.min(natural.height, max ?? .infinity))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let child = subviews.first else { return }
        let natural = child.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
        child.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: natural.height))
    }
}

private extension View {
    /// DEBUG `-kuraBodyLog YES`: `FEEDGEO <part> <event> minY maxY h` in the card's own space
    /// (top = 0, bottom = the tier height + the first card's inset) — the spacing audit's ruler.
    @ViewBuilder func feedGeo(_ part: String, _ id: String) -> some View {
        #if DEBUG
        if KBodyLog.on {
            onGeometryChange(for: CGRect.self) { $0.frame(in: .named(FeedCard.space)) } action: { r in
                KBodyLog.hit(String(format: "FEEDGEO %@ %@ minY %.1f maxY %.1f h %.1f", part, id, r.minY, r.maxY, r.height))
            }
        } else { self }
        #else
        self
        #endif
    }
}

private struct AuthorChip: View {
    let person: Person
    let age: String
    var body: some View {
        HStack(spacing: 8) {
            Seal(person: person, size: 28)
            Text("@\(person.handle)").font(.kura.ui(13, .semibold)).foregroundStyle(KColor.text).lineLimit(1)
            Text(age).monoLabel(11).fixedSize()
        }
        .padding(.leading, 4)
        .padding(.trailing, 12)
        .padding(.vertical, 4)
        .background(KColor.glassBg, in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

/// Under each cover of a burst strip: the title in Newsreader italic and, in small mono, the
/// artist (music) or studio/network (video) — the format when there's none. No year: the detail
/// lives in the ficha. Fixed sizes, so its height is exact and the art can make room for it.
private struct BurstCaption: View {
    let title: Title
    static let height: CGFloat = 46

    static func sub(_ t: Title) -> String { t.creator ?? t.format.metaLabel }
    static func label(_ t: Title) -> String { "\(t.name), \(sub(t))" }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.name)
                .font(.kura.newsItalic(16, fixed: true))
                .foregroundStyle(KColor.text)
                .lineLimit(1)
            Text(Self.sub(title))
                .font(.kura.mono(10))
                .tracking(0.8)
                .textCase(.uppercase)
                .foregroundStyle(KColor.text2)
                .lineLimit(1)
        }
        .padding(.top, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: Self.height, alignment: .top)
    }
}

/// The burst strip's magnet: the cover nearest to where the fling would land is centered in the
/// card; the first cover rests at the start and the last at the end instead (centering them would
/// leave empty track on their outer side). Positions are computed from the covers' widths, which
/// is why the strip pads its content itself instead of using `contentMargins`.
private struct BurstSnap: ScrollTargetBehavior {
    static let spacing: CGFloat = 14
    static let margin: CGFloat = 20
    let widths: [CGFloat]

    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        let viewport = context.containerSize.width
        let total = widths.reduce(0, +) + Self.spacing * CGFloat(max(widths.count - 1, 0)) + Self.margin * 2
        let maxOffset = max(0, total - viewport)
        guard widths.count > 1, maxOffset > 0 else { target.rect.origin.x = 0; return }
        var stops: [CGFloat] = [0]
        var x = Self.margin
        for (i, w) in widths.enumerated() {
            if i > 0 && i < widths.count - 1 {
                stops.append(min(max(x + w / 2 - viewport / 2, 0), maxOffset))
            }
            x += w + Self.spacing
        }
        stops.append(maxOffset)
        let proposed = target.rect.origin.x
        target.rect.origin.x = stops.min { abs($0 - proposed) < abs($1 - proposed) } ?? proposed
    }
}
