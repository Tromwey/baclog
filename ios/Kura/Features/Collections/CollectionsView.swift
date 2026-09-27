import SwiftUI

/// Tus colecciones (propuesta 10a — "Tus colecciones y Colección, una sola página"). One
/// collection at a time:
///
///  - its FAN in a carousel that follows the finger 1:1 (`CollectionsCarousel`: one continuous
///    position, rubber band, projected release, spring 0.42) or a tap on a neighbour's name.
///    Only the fans near the position are drawn — the others slide 320 and fade — so nothing
///    half-shows at the edges except the NAMES: the current one centred in Newsreader 30, the previous and next pinned 142 pt
///    off-centre at 22, dimmed to .35, so it reads that there's more on either side. Tapping the
///    fan only centres it; holding one opens 9a (the options without the view rows);
///  - under the names, the SAME body as Colección (`CollectionBody`): credits, format pills that
///    filter and every title (holding one = 18c); 6b when it's empty;
///  - Compartir + Opciones up top (as in 10b), acting on the collection in the centre;
///  - the whole page in the feed gradient of its front cover (760), continuing in its bottom tone
///    under the dock.
///
/// Pinned first, the empty ones after the rest, "no puedo esperar" penultimate and the ghost
/// "nueva colección" last (its "+" fan, the phrase and the glass Nueva colección; the chips fade
/// over it). The current one is remembered by id (a pin reorders the list, you stay where you
/// were). Twin of the web's `collection-cards.tsx`.
struct CollectionsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            switch (store.loadState, store.collections.isEmpty) {
            case (.loading, _):
                CollectionsSkeleton()
            case (.failed, _):
                failed
            case (.loaded, true):
                NoCollectionsView()
            case (.loaded, false):
                // A title opens in place from its cell (colecciones-transiciones · 4).
                TitleHeroHost(rootTab: .collections) { CollectionsCarousel() }
            }
        }
    }

    /// The launch read failed (offline, server down): say so and offer Reintentar —
    /// never a skeleton that doesn't end. Reconnecting retries on its own too.
    private var failed: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                TabTitleBar(title: "tus colecciones") {
                    IconChip44(systemName: "plus", iconSize: 15, weight: .bold, label: "Nueva colección") {
                        store.present(.newCollection(addingTitleID: nil))
                    }
                }
                .padding(.bottom, 18)
                LoadErrorBlock(error: store.loadError(.library) ?? .server("")) {
                    Task { await store.bootstrap() }
                }
                .padding(.horizontal, 28)
                .padding(.top, 40)
            }
            .padding(.bottom, 140)
        }
        .ignoresSafeArea(.container, edges: .top)
    }
}

/// One stop of the carousel: a collection of yours, the automatic "no puedo esperar", or the
/// ghost "nueva colección" that closes it.
private enum CarouselEntry: Identifiable {
    case shelf(KCollection)
    case auto([Title])
    case new

    static let autoID = "no-puedo-esperar"
    static let newID = "nueva-coleccion"

    var id: String {
        switch self {
        case .shelf(let c): return c.id
        case .auto: return Self.autoID
        case .new: return Self.newID
        }
    }

    var name: String {
        switch self {
        case .shelf(let c): return c.name
        case .auto: return "no puedo esperar"
        case .new: return "nueva colección"
        }
    }

    var collection: KCollection? {
        if case .shelf(let c) = self { return c }
        return nil
    }
}

/// A finger on the carousel: where it took the position from (RAW, before the rubber band —
/// learning 2026-09-24) and whether the drag is ours (horizontal) or the page's scroll.
private struct CarouselGrab {
    var p0: CGFloat
    var horizontal: Bool
}

private struct NameWidths: PreferenceKey {
    static let defaultValue: [String: CGFloat] = [:]
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue()) { $1 }
    }
}

/// "Entre colecciones" (colecciones-transiciones · 1): the fans, the strip of names and the
/// background hang from ONE continuous position (`pos`, in collections), so they move together
/// and 1:1 with the finger (320 pt = one collection). Past the ends it resists (rubber band, 390).
/// Released, the velocity is projected (`pos − v·0.499/320`) to pick the neighbour — a short
/// flick is enough — and it settles on `spring(0.42, damping 1)`, or 0.86 when it was thrown
/// (|v| > 1.5 collections/s), starting at the finger's speed. The background crosses the two
/// gradients by the position; the body (line, titles) leaves by the middle of the way and the new
/// one comes in from the other side, 24 pt. Reduce Motion keeps the carousel 1:1 (it's the
/// person's own movement) and only drops the body's slide. A selection tick every time the
/// centre changes.
private struct CollectionsCarousel: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    /// The collection in the centre, by id (the web keeps it in sessionStorage). Follows the
    /// position's rounding: the body and the chips switch at the middle of the way.
    @SceneStorage("kura.carousel") private var currentID = ""
    @State private var nameWidths: [String: CGFloat] = [:]
    /// THE position.
    @State private var pos = KSpring(0)
    @State private var grab: CarouselGrab?
    @GestureState private var dragging = false

    /// One collection per 320 pt of finger; the rubber band's dimension.
    private static let step: CGFloat = 320
    private static let band: CGFloat = 390

    /// Pinned first, then the rest, the empty ones after (`orderedCollections`); "no puedo
    /// esperar" PENULTIMATE and the ghost "nueva colección" LAST (founder, propuesta 10).
    private var entries: [CarouselEntry] {
        var list = store.orderedCollections.map(CarouselEntry.shelf)
        let waiting = store.waitingTitles
        if !waiting.isEmpty { list.append(.auto(waiting)) }
        list.append(.new)
        return list
    }

    private func fan(_ e: CarouselEntry) -> [Title] {
        switch e {
        case .shelf(let c): return store.fan(of: c)
        case .auto(let ts): return Array(ts.prefix(3))
        case .new: return []
        }
    }

    private func hexes(_ e: CarouselEntry) -> [String] {
        switch e {
        case .shelf(let c): return store.hexes(of: c)
        case .auto(let ts): return AppStore.fanHexes(Array(ts.prefix(3)), ordered: ts)
        case .new: return []
        }
    }

    var body: some View {
        let list = entries
        let idx = list.firstIndex { $0.id == currentID } ?? 0
        let cur = list[idx]
        let tints = list.map(hexes)
        ZStack(alignment: .top) {
            CarouselTail(pos: pos, tints: tints).ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    header(cur)
                    strips
                    VStack(spacing: 0) {
                        fans(list)
                        names(list).padding(.top, 4)
                    }
                    .contentShape(Rectangle())
                    .simultaneousGesture(swipe(count: list.count))
                    .accessibilityElement(children: .contain)
                    CarouselBodyShift(pos: pos, reduce: reduce) {
                        below(cur)
                    }
                    .id(cur.id)
                }
                .padding(.bottom, 140)
                .background(alignment: .top) { CarouselSurface(pos: pos, tints: tints) }
                // Recedes 4 % while a title opens over it.
                .heroRecedes()
            }
            .kDebugScrollAnchor()
            .kDebugScrollLog("carousel")
            .ignoresSafeArea(.container, edges: .top)
        }
        .overlay(alignment: .bottom) { CarouselDockBand(pos: pos, tints: tints) }
        .background { CarouselIndexWatcher(pos: pos, count: list.count) { i in centre(on: i) } }
        .onAppear {
            #if DEBUG
            // `-kuraCarousel <id>`: the captures open the carousel on a given collection
            // (`nueva-coleccion` = the ghost, `no-puedo-esperar` = the automatic one).
            if let id = UserDefaults.standard.string(forKey: "kuraCarousel") { currentID = id }
            #endif
            sync(list)
        }
        .onChange(of: list.map(\.id)) { _, _ in sync(entries) }
        #if DEBUG
        .task { await demoDrag() }
        #endif
        .onChange(of: dragging) { _, live in
            guard !live else { return }
            // A drag cancelled by the system never calls onEnded: settle on the nearest. (Next
            // turn of the run loop, so a normal end — which clears `grab` — goes first.)
            DispatchQueue.main.async {
                guard let g = grab else { return }
                grab = nil
                if g.horizontal { go(Int(pos.value.rounded()), count: entries.count) }
            }
        }
    }

    // MARK: Position

    /// The position on the collection in `currentID` (first appearance, a pin or a new
    /// collection reordering the list). Never while a finger holds it.
    private func sync(_ list: [CarouselEntry]) {
        let i = list.firstIndex { $0.id == currentID } ?? 0
        if currentID != list[i].id { currentID = list[i].id }
        guard grab == nil, pos.target != CGFloat(i) else { return }
        pos.set(CGFloat(i))
    }

    /// The rounding of the position crossed into another collection (finger or spring).
    private func centre(on i: Int) {
        let list = entries
        guard list.indices.contains(i), list[i].id != currentID else { return }
        currentID = list[i].id
        KHaptic.select()
    }

    /// A tap on a neighbour's name, VoiceOver's adjustable: spring there (keeps any momentum).
    private func go(_ i: Int, count: Int) {
        let t = max(0, min(count - 1, i))
        pos.animate(to: CGFloat(t), response: KSpringSpec.carousel.response, damping: KSpringSpec.carousel.damping)
    }

    /// Visible position ← raw: resistance past either end.
    private func banded(_ raw: CGFloat, max m: CGFloat) -> CGFloat {
        if raw < 0 { return -Rubber.band(-raw * Self.step, Self.band) / Self.step }
        if raw > m { return m + Rubber.band((raw - m) * Self.step, Self.band) / Self.step }
        return raw
    }

    /// Raw ← visible (grabbing it mid-bounce continues from the finger's real offset).
    private func unbanded(_ v: CGFloat, max m: CGFloat) -> CGFloat {
        if v < 0 { return -Rubber.unband(-v * Self.step, Self.band) / Self.step }
        if v > m { return m + Rubber.unband((v - m) * Self.step, Self.band) / Self.step }
        return v
    }

    private func swipe(count: Int) -> some Gesture {
        let m = CGFloat(max(0, count - 1))
        return DragGesture(minimumDistance: 8)
            .updating($dragging) { _, live, _ in live = true }
            .onChanged { v in
                if grab == nil {
                    // The first movement decides: sideways is the carousel, up/down the page.
                    let horizontal = abs(v.translation.width) > abs(v.translation.height)
                    if horizontal { pos.stop() }
                    grab = CarouselGrab(p0: horizontal ? unbanded(pos.value, max: m) : 0, horizontal: horizontal)
                }
                guard let g = grab, g.horizontal else { return }
                pos.set(banded(g.p0 - v.translation.width / Self.step, max: m))
            }
            .onEnded { v in
                guard let g = grab else { return }
                grab = nil
                guard g.horizontal else { return }
                release(g, vx: v.velocity.width, count: count)
            }
    }

    /// Let go at `vx` pt/s: project, pick the neighbour (at most one away from where the finger
    /// took it), spring there at the finger's speed.
    private func release(_ g: CarouselGrab, vx: CGFloat, count: Int) {
        let vi = -vx / Self.step
        let b = Int(g.p0.rounded())
        var tg = Int((pos.value - vx * 0.499 / Self.step).rounded())
        tg = max(b - 1, min(b + 1, tg))
        tg = max(0, min(count - 1, tg))
        let spec = abs(vi) > 1.5 ? KSpringSpec.carouselFlung : KSpringSpec.carousel
        pos.animate(to: CGFloat(tg), response: spec.response, damping: spec.damping, velocity: vi)
    }

    #if DEBUG
    /// `-kuraCarouselDemo L140|R140`: the captures can't drive a finger, so this replays one
    /// through the same path — a grab, 140 pt left/right over 0.3 s, then the release at the
    /// drag's speed (`-kuraCarouselDemoHold 3`: hold 3 s mid-drag, then let go still).
    private func demoDrag() async {
        guard let arg = UserDefaults.standard.string(forKey: "kuraCarouselDemo"), let n = Double(arg.dropFirst()) else { return }
        let dx = CGFloat(arg.hasPrefix("L") ? -n : n)
        try? await Task.sleep(for: .milliseconds(1500))
        let count = entries.count, m = CGFloat(max(0, count - 1))
        pos.stop()
        let g = CarouselGrab(p0: unbanded(pos.value, max: m), horizontal: true)
        let steps = 18
        for i in 1...steps {
            pos.set(banded(g.p0 - dx * CGFloat(i) / CGFloat(steps) / Self.step, max: m))
            try? await Task.sleep(for: .milliseconds(16))
        }
        let hold = UserDefaults.standard.double(forKey: "kuraCarouselDemoHold")
        if hold > 0 { try? await Task.sleep(for: .seconds(hold)) }
        release(g, vx: hold > 0 ? 0 : dx / 0.3, count: count)
    }
    #endif

    // MARK: Header

    /// "tus colecciones" + Compartir and Opciones (glass 44) over the collection in the centre,
    /// the same pair as 10b. Nueva colección is no longer a chip: it's the last fan. Over the
    /// ghost (and the automatic one, which has neither a link nor options) the pair fades out.
    private func header(_ cur: CarouselEntry) -> some View {
        TabTitleBar(title: "tus colecciones") {
            ZStack(alignment: .trailing) {
                if let c = cur.collection {
                    CollectionChips(collection: c)
                        .transition(.opacity)
                }
            }
            .frame(height: 44)
            .animation(.easeOut(duration: 0.3), value: cur.collection?.id)
        }
        .padding(.bottom, 18)
    }

    @ViewBuilder private var strips: some View {
        if store.offline {
            OfflineStrip().padding(.horizontal, 12).padding(.bottom, 16)
        } else if store.libraryIncomplete, let e = store.loadError(.library) {
            // The collections arrived but some of their titles didn't (`GET /titles?ids=`).
            RetryStrip(error: e, text: "Faltan títulos en tus colecciones.") {
                Task { await store.retryLibraryTitles() }
            }
            .padding(.horizontal, 12).padding(.bottom, 16)
        }
    }

    // MARK: The fans (290 band)

    private func fans(_ list: [CarouselEntry]) -> some View {
        CarouselFans(pos: pos, ids: list.map(\.id)) { i in
            fanSlide(list[i], index: i, list: list)
        }
        .padding(.top, 14)
        .frame(maxWidth: .infinity, minHeight: 290, maxHeight: 290, alignment: .top)
    }

    /// Tapping a fan only centres it (founder): it never navigates, and an empty collection never
    /// jumps to Agregar. Holding one of yours opens 9a. An empty collection is three `s1` slots;
    /// only the ghost wears the dashed "+".
    @ViewBuilder
    private func fanSlide(_ e: CarouselEntry, index: Int, list: [CarouselEntry]) -> some View {
        let art = FanView(covers: fan(e), lead: 225, ghost: { if case .new = e { return true }; return false }())
            .frame(width: 300)
            .contentShape(Rectangle())
        let adjust: (AccessibilityAdjustmentDirection) -> Void = { dir in
            switch dir {
            case .increment: go(index + 1, count: list.count)
            case .decrement: go(index - 1, count: list.count)
            @unknown default: break
            }
        }
        if let c = e.collection {
            art
                .kPressable(longPress: { store.present(.collectionQuick(c.id)) }) {}
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(c.name), \(c.titleIDs.count) \(c.titleIDs.count == 1 ? "título" : "títulos")")
                .accessibilityHint("Desliza hacia arriba o abajo para cambiar de colección.")
                .accessibilityAction(named: "Opciones") { store.present(.collectionQuick(c.id)) }
                .accessibilityAdjustableAction(adjust)
        } else {
            art
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(e.name)
                .accessibilityHint("Desliza hacia arriba o abajo para cambiar de colección.")
                .accessibilityAdjustableAction(adjust)
        }
    }

    // MARK: The names (44 row)

    private func names(_ list: [CarouselEntry]) -> some View {
        CarouselNames(pos: pos,
                      names: list.map { CarouselName(id: $0.id, name: $0.name, ghost: $0.id == CarouselEntry.newID) },
                      widths: nameWidths) { i in go(i, count: list.count) }
            .frame(height: 44)
            .clipped()
            .onPreferenceChange(NameWidths.self) { nameWidths.merge($0) { $1 } }
    }

    // MARK: Under the names

    /// A collection of yours: the SAME body as Colección (10b) — `CollectionBody`, 6b when it's
    /// empty. "No puedo esperar": its line, count and countdowns (holding a title = 9b). The
    /// ghost: the phrase and the glass "Nueva colección".
    @ViewBuilder private func below(_ e: CarouselEntry) -> some View {
        switch e {
        case .shelf(let c):
            CollectionBody(collection: c, metaTop: 4)
        case .auto(let ts):
            VStack(spacing: 0) {
                autoMeta(ts)
                Masonry(titles: ts, badge: { t in store.releaseLabel(t).map(MasonryBadge.wait) ?? .none },
                        onHold: { t in store.present(.titleActions(titleID: t.id, collectionID: nil)) })
            }
        case .new:
            VStack(spacing: 12) {
                Text("Empieza por lo que no puedes dejar de recomendar. Una colección puede mezclar cine, series y música.")
                    .font(.kura.ui(15))
                    .lineSpacing(4)
                    .foregroundStyle(KColor.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                GlassButton(title: "Nueva colección", systemImage: "plus") {
                    store.present(.newCollection(addingTitleID: nil))
                }
                .padding(.top, 6)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 32)
            .padding(.top, 8)
        }
    }

    private func autoMeta(_ ts: [Title]) -> some View {
        let next = ts.first.flatMap { store.releaseLabel($0) }.map { " · el próximo \(Self.nextLabel($0))" } ?? ""
        return VStack(spacing: 8) {
            Text("se llena sola con lo que aún no sale")
                .font(.kura.newsItalic(15))
                .foregroundStyle(KColor.text2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text("\(ts.count) \(ts.count == 1 ? "título" : "títulos")\(next)").monoLabel(11).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.top, 4)
        .padding(.bottom, 22)
    }

    /// "4 d" → "en 4 d" · "17 oct" → "el 17 oct" · "hoy" stays.
    static func nextLabel(_ label: String) -> String {
        if label == "hoy" { return "hoy" }
        let countdown = label.range(of: #"^\d+ [hd]$"#, options: .regularExpression) != nil
        return countdown ? "en \(label)" : "el \(label)"
    }
}

// MARK: - The carousel's per-frame readers
//
// Only these read `pos.value`, so only these re-render while the finger or the spring moves it;
// the page around them (and the body's titles) re-renders when the centre changes, not per frame.

/// The fans within one collection of the position: `translateX(d·320) scale(1 − .08·|d|)`,
/// opacity `1 − 1.2·|d|` (so only the centre and what's sliding in show).
private struct CarouselFans<Slide: View>: View {
    let pos: KSpring
    let ids: [String]
    @ViewBuilder let slide: (Int) -> Slide

    var body: some View {
        let p = pos.value
        let centre = Int(p.rounded())
        let near = ids.indices.filter { abs(CGFloat($0) - p) < 1 }
        ZStack(alignment: .top) {
            ForEach(near, id: \.self) { i in
                let d = CGFloat(i) - p, a = abs(d)
                slide(i)
                    .scaleEffect(1 - 0.08 * min(1, a))
                    .offset(x: d * 320)
                    .opacity(Double(clamp01(1 - a * 1.2)))
                    .allowsHitTesting(i == centre)
                    .accessibilityHidden(i != centre)
                    .id(ids[i])
            }
        }
    }
}

private struct CarouselName {
    let id: String
    let name: String
    /// The ghost's name is a placeholder: .6 in the centre.
    let ghost: Bool
}

/// The strip of names, all from the position: the centre in Newsreader 30; a neighbour pinned
/// 142 pt off-centre (its near edge) at 22 and .35; past that it slides 278 pt more per
/// collection and fades out. Tapping a neighbour goes there.
private struct CarouselNames: View {
    let pos: KSpring
    let names: [CarouselName]
    let widths: [String: CGFloat]
    let tap: (Int) -> Void

    var body: some View {
        GeometryReader { g in
            let mid = g.size.width / 2
            let p = pos.value
            let centre = Int(p.rounded())
            ZStack(alignment: .topLeading) {
                ForEach(Array(names.enumerated()), id: \.element.id) { i, e in
                    let d = CGFloat(i) - p, a = abs(d), cd = max(-1, min(1, d))
                    if a < 2.2 {
                        let scale = (30 - 8 * min(1, a)) / 30
                        let w = (widths[e.id] ?? 0) * scale
                        // CSS: left 50% + translateX((−50 + 50·cd)% + px) → the centre sits at
                        // mid + px + cd·w/2.
                        let px = 142 * cd + (a > 1 ? (d > 0 ? 1 : -1) * (a - 1) * 278 : 0)
                        let op = a <= 1 ? 1 - 0.65 * a : max(0, 0.35 * (2 - a))
                        let ghost: CGFloat = e.ghost ? 1 - 0.4 * max(0, 1 - a) : 1
                        let neighbour = abs(i - centre) == 1
                        Text(e.name)
                            .font(.kura.news(30))
                            .foregroundStyle(KColor.text)
                            .lineLimit(1)
                            .fixedSize()
                            .background {
                                GeometryReader { t in Color.clear.preference(key: NameWidths.self, value: [e.id: t.size.width]) }
                            }
                            .scaleEffect(scale)
                            .opacity(Double(op * ghost))
                            .position(x: mid + px + cd * w / 2, y: 22)
                            .onTapGesture { if neighbour { tap(i) } }
                            .allowsHitTesting(neighbour)
                            .accessibilityHidden(i != centre)
                            .accessibilityAddTraits(i == centre ? .isHeader : [])
                    }
                }
            }
        }
    }
}

/// The body under the names: gone by the middle of the way (`1 − 2·|fr|`), sliding 48 pt per
/// collection against the finger, so the new one enters 24 pt from the other side. Reduce
/// Motion: the fade only.
private struct CarouselBodyShift<C: View>: View {
    let pos: KSpring
    let reduce: Bool
    let content: C

    init(pos: KSpring, reduce: Bool, @ViewBuilder content: () -> C) {
        self.pos = pos
        self.reduce = reduce
        self.content = content()
    }

    var body: some View {
        let fr = pos.value - pos.value.rounded()
        content
            .opacity(Double(clamp01(1 - abs(fr) * 2)))
            .offset(x: reduce ? 0 : -fr * 48)
    }
}

/// The two collections the position is between, and how far.
private func between(_ p: CGFloat, _ n: Int) -> (lo: Int, hi: Int, t: CGFloat) {
    guard n > 0 else { return (0, 0, 0) }
    let lo = max(0, min(n - 1, Int(p.rounded(.down))))
    let hi = min(n - 1, lo + 1)
    return (lo, hi, clamp01(p - CGFloat(lo)))
}

/// The page's feed gradient (760) crossing from one collection's to the next's by the position,
/// its first tone stretching up past the top on a pull.
private struct CarouselSurface: View {
    let pos: KSpring
    let tints: [[String]]

    var body: some View {
        let (lo, hi, t) = between(pos.value, tints.count)
        ZStack(alignment: .top) {
            FeedSurface(hexes: tints[lo], span: 760)
            FeedSurface(hexes: tints[hi], span: 760).opacity(Double(t))
        }
        .background(alignment: .top) {
            ZStack {
                Tint.feedTop(tints[lo])
                Tint.feedTop(tints[hi]).opacity(Double(t))
            }
            .frame(height: 1200).offset(y: -1200)
        }
        .allowsHitTesting(false)
    }
}

/// The colour the page continues in (tone 2), crossing the same way.
private struct CarouselTail: View {
    let pos: KSpring
    let tints: [[String]]

    var body: some View {
        let (lo, hi, t) = between(pos.value, tints.count)
        ZStack {
            Tint.feedTail(tints[lo])
            Tint.feedTail(tints[hi]).opacity(Double(t))
        }
    }
}

/// The 150 band under the tab bar, crossing the same way.
private struct CarouselDockBand: View {
    let pos: KSpring
    let tints: [[String]]

    var body: some View {
        let (lo, hi, t) = between(pos.value, tints.count)
        ZStack {
            Color.clear.kFeedDockBand(tints[lo])
            Color.clear.kFeedDockBand(tints[hi]).opacity(Double(t))
        }
        .allowsHitTesting(false)
    }
}

/// Reports when the rounding of the position lands on another collection.
private struct CarouselIndexWatcher: View {
    let pos: KSpring
    let count: Int
    let onChange: (Int) -> Void

    var body: some View {
        let i = max(0, min(count - 1, Int(pos.value.rounded())))
        Color.clear
            .onChange(of: i) { _, n in onChange(n) }
            .accessibilityHidden(true)
    }
}

// MARK: - 6c Cargando

/// The real header ("tus colecciones" + the two 44 chips, so nothing jumps when the page lands), then
/// the carousel's shape — the ghost fan at 225 in the same 290 band, the name's bar, the meta's
/// bar, and a first row of three columns (póster · disco · póster) — on `s1`, with the system's
/// one allowed pulse.
struct CollectionsSkeleton: View {
    var body: some View {
        VStack(spacing: 0) {
            TabTitleBar(title: "tus colecciones") {
                // The carousel's Compartir + Opciones, inert, so nothing jumps when the page lands.
                HStack(spacing: 8) {
                    ForEach(["square.and.arrow.up", "ellipsis"], id: \.self) { icon in
                        Image(systemName: icon).font(.system(size: 16, weight: .semibold)).foregroundStyle(KColor.text)
                            .frame(width: 44, height: 44)
                            .kGlass(Circle())
                    }
                }
            }
            .padding(.bottom, 18)

            VStack(spacing: 0) {
                FanView(covers: [], lead: 225, ghost: true)
                    .padding(.top, 14)
                    .frame(height: 290, alignment: .top)
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(KColor.s1)
                    .frame(width: 200, height: 26)
                    .frame(height: 44)
                    .padding(.top, 4)
                RoundedRectangle(cornerRadius: 6, style: .continuous).fill(KColor.s1)
                    .frame(width: 150, height: 14)
                    .padding(.top, 12)
                HStack(alignment: .top, spacing: 12) {
                    ForEach([2.0 / 3.0, 1.0, 2.0 / 3.0], id: \.self) { a in
                        RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous).fill(KColor.s1)
                            .aspectRatio(a, contentMode: .fit)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 34)
            }
            .kSkeletonPulse()
            Spacer(minLength: 0)
        }
        .ignoresSafeArea(.container, edges: .top)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando colecciones")
    }
}

// MARK: - 6a Sin colecciones

/// The ghost fan — three empty slots, the dashed "+" in front, which is the way in — then the
/// phrase in Newsreader 34, one line of body and the glass "Nueva colección".
struct NoCollectionsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                TabTitleBar(title: "tus colecciones") {
                    IconChip44(systemName: "plus", iconSize: 15, weight: .bold, label: "Nueva colección") {
                        store.present(.newCollection(addingTitleID: nil))
                    }
                }
                .padding(.bottom, 18)

                VStack(spacing: 14) {
                    FanView(covers: [], lead: 180, ghost: true)
                        .kPressable { store.present(.newCollection(addingTitleID: nil)) }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Nueva colección")
                        .accessibilityAddTraits(.isButton)
                    Text("aquí va lo que más vale.")
                        .font(.kura.news(34))
                        .foregroundStyle(KColor.text)
                        .multilineTextAlignment(.center)
                        .padding(.top, 16)
                    Text("Empieza por lo que no puedes dejar de recomendar. Una colección puede mezclar cine, series y música.")
                        .font(.kura.ui(15))
                        .lineSpacing(4)
                        .foregroundStyle(KColor.text2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    GlassButton(title: "Nueva colección", systemImage: "plus") {
                        store.present(.newCollection(addingTitleID: nil))
                    }
                    .padding(.top, 6)
                }
                .padding(.horizontal, 28)
                .padding(.top, 70)
            }
            .padding(.bottom, 140)
        }
        .ignoresSafeArea(.container, edges: .top)
    }
}

// MARK: - O2a Nueva colección

struct NewCollectionSheet: View {
    @Environment(AppStore.self) private var store
    let addingTitleID: String?
    var movingFrom: String? = nil
    @State private var name = ""
    @State private var privacy: Privacy = .followers
    @State private var privacySeeded = false
    @State private var choosingPrivacy = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SheetHeader(title: "nueva colección") { store.dismissSheet() }
            VStack(spacing: 14) {
                GlassField(placeholder: "ponle nombre", text: $name, serif: true, focus: $focused)
                    .submitLabel(.done)
                    .onSubmit(create)
                if choosingPrivacy {
                    VStack(spacing: 0) {
                        ForEach(Privacy.options) { p in
                            PrivacyOptionRow(privacy: p, selected: p == privacy) {
                                privacy = p
                                withAnimation(KMotion.short) { choosingPrivacy = false }
                            }
                        }
                    }
                } else {
                    Button {
                        focused = false
                        withAnimation(KMotion.short) { choosingPrivacy = true }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "person.2.fill").font(.system(size: 15))
                            Text("Quién la ve").font(.kura.ui(16, .medium))
                            Spacer()
                            Text(privacy.label).font(.kura.ui(15)).foregroundStyle(KColor.text2)
                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(KColor.text2)
                        }
                        .foregroundStyle(KColor.text)
                        .padding(.horizontal, 4)
                        .frame(minHeight: 56)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                SolidButton(title: "Crear", enabled: !name.trimmingCharacters(in: .whitespaces).isEmpty, action: create)
            }
            .padding(.top, 6)
        }
        .padding(.horizontal, 20)
        .onAppear {
            focused = true
            if !privacySeeded { privacySeeded = true; privacy = store.defaultPrivacy }
        }
    }

    private func create() {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let id = store.createCollection(name: name, privacy: privacy, adding: addingTitleID)
        store.dismissSheet()
        if let from = movingFrom, let tid = addingTitleID, let c = store.collection(id) {
            store.removeSilently(tid, from: from)
            store.showToast(ToastModel(text: "Movido a \(c.name)", kind: .info))
        } else if addingTitleID == nil {
            store.push(.collection(id))
        } else if let c = store.collection(id) {
            store.showToast(ToastModel(text: "Guardado en \(c.name)", kind: .info))
        }
    }
}

struct PrivacyOptionRow: View {
    let privacy: Privacy
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: privacy.symbol)
                    .font(.system(size: 16))
                    .foregroundStyle(KColor.text)
                    .frame(width: 40, height: 40)
                    .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(privacy.label).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                    Text(privacy.note).font(.kura.ui(13)).foregroundStyle(KColor.text2)
                }
                Spacer()
                RadioMark(on: selected)
            }
            .padding(.horizontal, 4)
            .frame(minHeight: 68)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
