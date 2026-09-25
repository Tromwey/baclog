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

    /// How far a card's body runs past its own height, so the card rising from
    /// underneath always mounts over filled color instead of bare bg.
    private let ext: CGFloat = 120
    /// E1 stays up once shown, until you leave the tab: following the first suggestion used to
    /// flip the feed to "quiet" on the spot and the other suggestions went with it.
    @State private var holdEmpty = false

    var body: some View {
        Group {
            if store.loadState == .failed {
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
                Text("tu gente todavía no hace nada.").font(.kura.news(32)).foregroundStyle(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Cuando completen, se obsesionen o reseñen algo, aparece aquí.")
                    .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
                GlassButton(title: "Buscar más gente", systemImage: "magnifyingglass") { store.select(.discover) }
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

    /// The stack's shape while `GET /feed` runs.
    private var loading: some View {
        VStack(spacing: 0) {
            header
            VStack(alignment: .leading, spacing: 14) {
                Skeleton(radius: 999).frame(width: 150, height: 28)
                Skeleton().frame(maxWidth: .infinity).frame(height: 260)
                Skeleton(radius: 6).frame(width: 220, height: 26)
                Skeleton(radius: 5).frame(width: 140, height: 12)
                Spacer()
            }
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(KColor.s1)
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: KRadius.screen, topTrailingRadius: KRadius.screen, style: .continuous))
        }
        .background(KColor.bg.ignoresSafeArea())
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
                // Cards snap under the header (scroll-padding-top); the first one runs up behind it.
                .contentMargins(.top, hdr, for: .scrollContent)
                .scrollTargetBehavior(.viewAligned)
                .scrollPosition(id: $position, anchor: .top)
                .task {
                    guard let anchor = store.debugFeedAnchor else { return }
                    try? await Task.sleep(for: .milliseconds(900))
                    position = anchor
                }

                header(transparent: true)
                    .zIndex(1)

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
                        .kShadow(.stack)
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
        VStack(alignment: .leading, spacing: 14) {
            if isSuggestion {
                SuggestionPill()
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
            textBlock
                .frame(maxHeight: textMax, alignment: .top)
                .clipped()
        }
        .padding(.horizontal, 20)
        .padding(.top, 18 + topInset)
        .padding(.bottom, 22)
        .frame(height: height + topInset, alignment: .top)
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
            let ts = ids.compactMap { store.title($0) }
            let widest = ts.map(\.format.aspect).max() ?? 1
            GeometryReader { geo in
                let h = min(geo.size.height, (geo.size.width + 40) / widest)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: BurstSnap.spacing) {
                        ForEach(ts) { t in
                            Button { store.push(.title(t.id)) } label: { CoverView(title: t, height: h).zoomSource(ZoomID.title(t.id)) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, BurstSnap.margin)
                }
                .scrollTargetBehavior(BurstSnap(widths: ts.map { h * $0.format.aspect }))
                .scrollClipDisabled()
                .frame(height: h)
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
                .frame(width: geo.size.width, height: geo.size.height)
            }
        default:
            if let t = title {
                GeometryReader { geo in
                    let w = min(geo.size.width, geo.size.height * t.format.aspect)
                    CoverView(title: t, width: w, height: w / t.format.aspect).zoomSource(ZoomID.title(t.id))
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
                }
            }
            switch event.kind {
            case .suggestion(let pid, let reason, let social, _):
                Text(reason)
                    .font(.kura.newsItalic(26))
                    .foregroundStyle(KColor.text)
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

    /// " · artist" for music, " · year" for film and series.
    private func tail(_ t: Title) -> String {
        if t.format == .album, let c = t.creator { return " · \(c)" }
        if let y = t.year { return " · \(y)" }
        return t.creator.map { " · \($0)" } ?? ""
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
            return [(.bookmark, isMe ? "Agregaste a \(c)" : "Agregó a \(c)")]
        case .waitingAdd(_, let label):
            return [(.clock, "No puede esperar · \(label)")]
        case .burst(let c, let ids):
            return [(.bookmark, isMe ? "Agregaste \(ids.count) títulos a \(c)" : "Agregó \(ids.count) títulos a \(c)")]
        case .suggestion:
            return []
        }
    }

    static func when(_ h: Double) -> String {
        if h < 1 { return "hace \(max(1, Int(h * 60))) min" }
        if h < 24 { return "hace \(Int(h)) h" }
        if h < 7 * 24 { return "hace \(Int(h / 24)) d" }
        if h < 35 * 24 { return "hace \(Int(h / (7 * 24))) sem" }
        return "hace \(Int(h / (30 * 24))) meses"
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

/// The suggestion's header, where the author chip goes on every other card.
private struct SuggestionPill: View {
    var body: some View {
        HStack(spacing: 8) {
            GlyphView(glyph: .users, size: 13)
            Text("Sugerencia para ti")
                .font(.kura.mono(12))
                .tracking(0.72)
                .textCase(.uppercase)
                .foregroundStyle(KColor.text)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(KColor.glassBg, in: Capsule())
        .fixedSize()
        .accessibilityElement(children: .combine)
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
