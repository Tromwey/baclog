import SwiftUI

/// Tus colecciones (propuesta 10a — "Tus colecciones y Colección, una sola página"). One
/// collection at a time:
///
///  - its FAN in a carousel that follows the finger 1:1 (`CollectionsCarousel`: one continuous
///    position, rubber band, projected release, spring 0.42) or a tap on a neighbour's name.
///    Only the fans near the position are drawn — the others slide 320 and fade — so nothing
///    half-shows at the edges except the NAMES: the current one centred in Newsreader 30, the previous and next pinned 142 pt
///    off-centre at 22, dimmed to .45, so it reads that there's more on either side. Tapping the
///    fan only centres it; holding one opens the same Opciones as the ⋯ chip (view rows included:
///    the collection's body is right below — founder, 2026-09-29);
///  - under the names, the SAME body as Colección (`CollectionBody`): credits, format pills that
///    filter and every title (holding one = 18c); 6b when it's empty;
///  - Compartir + Opciones up top (as in 10b), acting on the collection in the centre;
///  - the whole page in the feed gradient of its front cover (760), continuing in its bottom tone
///    under the dock.
///
/// The ghost "nueva colección" FIRST (its "+" fan, the phrase and the glass Nueva colección; the
/// chips fade over it), then pinned, the rest, the empty ones and "no puedo esperar" last. The
/// current one is remembered by id (a pin reorders the list, you stay where you were); with none
/// remembered — or a remembered one that's gone — it opens on the first REAL collection (index 1),
/// never on the ghost, which peeks to the left as a dimmed name. Twin of the web's
/// `collection-cards.tsx`.
struct CollectionsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            // A party (host or guest) counts: someone who only joined one by its link has no
            // collection of their own, and the party must still be one swipe away.
            switch (store.loadState, store.collections.isEmpty && store.partyCards.isEmpty) {
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
        // "De fiesta" (`GET /parties`): silent when the server doesn't have parties yet (503).
        .task { await store.loadParties() }
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
/// ghost "nueva colección" that opens it (to the left of the first collection).
private enum CarouselEntry: Identifiable {
    case shelf(KCollection)
    case auto([Title])
    case new
    /// A party (colección de fiesta), yours or one you joined — `GET /parties`. Its body is
    /// `PartyCarouselBody` (its songs as a list), never `CollectionBody` (a song is not a title);
    /// its fan opens `Route.party`.
    case party(PartyCard)

    static let autoID = "no-puedo-esperar"
    static let newID = "nueva-coleccion"

    var id: String {
        switch self {
        case .shelf(let c): return c.id
        case .auto: return Self.autoID
        case .new: return Self.newID
        case .party(let p): return "party:\(p.id)"
        }
    }

    var name: String {
        switch self {
        case .shelf(let c): return c.name
        case .auto: return "no puedo esperar"
        case .new: return "nueva colección"
        case .party(let p): return p.name
        }
    }

    var collection: KCollection? {
        if case .shelf(let c) = self { return c }
        return nil
    }

    var partyID: String? {
        if case .party(let p) = self { return p.id }
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
    /// The first appearance already chose where to start (see `onAppear`).
    @State private var placed = false
    @GestureState private var dragging = false

    /// One collection per 320 pt of finger; the rubber band's dimension.
    private static let step: CGFloat = 320
    private static let band: CGFloat = 390

    /// The ghost "nueva colección" FIRST (founder, 2026-09-27: to the left of the first
    /// collection), then pinned, the rest, the empty ones (`orderedCollections`) and "no puedo
    /// esperar" LAST.
    private var entries: [CarouselEntry] {
        var list: [CarouselEntry] = [.new]
        // Parties right after the ghost (fiesta-app-v2 `list`: "la fiesta de eric" first).
        list += store.partyCards.map(CarouselEntry.party)
        list += store.orderedCollections.map(CarouselEntry.shelf)
        let waiting = store.waitingTitles
        if !waiting.isEmpty { list.append(.auto(waiting)) }
        return list
    }

    /// Where `currentID` sits; nothing remembered (or it's gone) = the first REAL collection,
    /// index 1 — never the ghost at 0. (`CollectionsView` only shows the carousel with at least
    /// one collection; the clamp is for safety.)
    private static func index(of id: String, in list: [CarouselEntry]) -> Int {
        list.firstIndex { $0.id == id } ?? min(1, list.count - 1)
    }

    private func fan(_ e: CarouselEntry) -> [Title] {
        switch e {
        case .shelf(let c): return store.fan(of: c)
        case .auto(let ts): return Array(ts.prefix(3))
        case .new: return []
        case .party(let p): return p.fan
        }
    }

    private func hexes(_ e: CarouselEntry) -> [String] {
        switch e {
        case .shelf(let c): return store.hexes(of: c)
        case .auto(let ts): return AppStore.fanHexes(Array(ts.prefix(3)), ordered: ts)
        case .new: return []
        case .party(let p): return p.palette
        }
    }

    var body: some View {
        let list = entries
        let idx = Self.index(of: currentID, in: list)
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
            // Opening Tus colecciones never lands on the ghost: a remembered "nueva colección"
            // (left there last session) starts on the first collection instead. Only on the first
            // appearance — a list change while you're on the ghost keeps you there.
            if !placed, currentID == CarouselEntry.newID { currentID = "" }
            #if DEBUG
            // `-kuraCarousel <id>`: the captures open the carousel on a given collection
            // (`nueva-coleccion` = the ghost, first; `no-puedo-esperar` = the automatic one, last).
            if !placed, let id = UserDefaults.standard.string(forKey: "kuraCarousel") { currentID = id }
            #endif
            placed = true
            // `pos.set` = no spring: the first frame is already on it, nothing slides in.
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
        let i = Self.index(of: currentID, in: list)
        if currentID != list[i].id { currentID = list[i].id }
        guard grab == nil, pos.target != CGFloat(i) else { return }
        pos.set(CGFloat(i))
    }

    /// The rounding of the position crossed into another collection (finger or spring).
    private func centre(on i: Int) {
        let list = entries
        guard list.indices.contains(i), list[i].id != currentID else { return }
        currentID = list[i].id
        KHaptic.play(.selection)
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
    /// the same pair as 10b. Nueva colección is no longer a chip: it's the first fan. Over the
    /// ghost (and the automatic one, which has neither a link nor options) the pair fades out.
    private func header(_ cur: CarouselEntry) -> some View {
        TabTitleBar(title: "tus colecciones") {
            ZStack(alignment: .trailing) {
                if let c = cur.collection {
                    CollectionChips(collection: c)
                        .transition(.opacity)
                } else if case .party(let card) = cur, let p = store.party(card.id) {
                    // The party's own pair (as on its page): the host's Compartir + Opciones, a
                    // guest's Opciones (Salir). Only once it's loaded — the sheets read it.
                    PartyChips(party: p)
                        .transition(.opacity)
                }
            }
            .frame(height: 44)
            .animation(.easeOut(duration: 0.3), value: cur.id)
            .animation(.easeOut(duration: 0.3), value: store.party(cur.partyID ?? "") != nil)
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
        } else if let e = store.loadError(.parties) {
            // `GET /parties` failed (not the 503 of "no parties yet", which stays silent).
            PartiesRetryStrip(error: e).padding(.horizontal, 12).padding(.bottom, 16)
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
        // The ghost wears the dashed "+"; an EMPTY collection draws the same ghost without the
        // "+" (critica 2026-09-27 #13: 6b used to leave ~250 pt of nothing where the fan goes —
        // the profile's vitrina already drew it). Its one way in is "Agregar títulos" below.
        let isNew: Bool = { if case .new = e { return true }; return false }()
        let emptyShelf: Bool = {
            if case .party(let p) = e { return p.songCount == 0 }
            return e.collection?.titleIDs.isEmpty ?? false
        }()
        let art = FanView(covers: fan(e), lead: 225, ghost: isNew || emptyShelf, plus: isNew)
            .frame(width: 300)
            .contentShape(Rectangle())
        let adjust: (AccessibilityAdjustmentDirection) -> Void = { dir in
            switch dir {
            case .increment: go(index + 1, count: list.count)
            case .decrement: go(index - 1, count: list.count)
            @unknown default: break
            }
        }
        if case .party(let p) = e {
            // A party's fan opens it (design `list`: the centred party goes to its page).
            art
                .kPressable { store.push(.party(p.id)) }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(p.name), fiesta, \(PartyCopy.songs(p.songCount))")
                .accessibilityAddTraits(.isButton)
                .accessibilityHint("Desliza hacia arriba o abajo para cambiar de colección.")
                .accessibilityAdjustableAction(adjust)
        } else if let c = e.collection {
            art
                .kPressable(longPress: { store.present(.more(c.id)) }) {}
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(c.name), \(c.titleIDs.count) \(c.titleIDs.count == 1 ? "título" : "títulos")")
                .accessibilityHint("Desliza hacia arriba o abajo para cambiar de colección.")
                .accessibilityAction(named: "Opciones") { store.present(.more(c.id)) }
                .accessibilityAdjustableAction(adjust)
        } else {
            art
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(e.name)
                .accessibilityHint("Desliza hacia arriba o abajo para cambiar de colección.")
                .accessibilityAdjustableAction(adjust)
        }
    }

    // MARK: The names (44 row, 56 for a two-line name)

    private func names(_ list: [CarouselEntry]) -> some View {
        let names = list.map { CarouselName(id: $0.id, name: $0.name, ghost: $0.id == CarouselEntry.newID) }
        return CarouselNames(pos: pos, names: names, widths: nameWidths) { i in go(i, count: list.count) }
            .frame(height: CarouselNames.height(pos.value, names: names, widths: nameWidths))
            // Clipped sideways only: a two-line neighbour (22 × 2) next to a one-line centre is
            // a few pt taller than the 44 strip and must not lose its top and bottom.
            .mask(Rectangle().padding(.vertical, -12))
            .onPreferenceChange(NameWidths.self) { nameWidths.merge($0) { $1 } }
    }

    // MARK: Under the names

    /// A collection of yours: the SAME body as Colección (10b) — `CollectionBody`, 6b when it's
    /// empty. A party: its songs as a list (`PartyCarouselBody`). "No puedo esperar": its line, count and countdowns (holding a title = 9b). The
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
        case .party(let p):
            // Its songs, as a list, like any collection shows its titles (founder, 2026-09-29).
            PartyCarouselBody(card: p)
        case .new:
            VStack(spacing: 12) {
                Text("Empieza por lo que no puedes dejar de recomendar. Una colección puede mezclar películas, series y álbumes.")
                    .font(.kura.ui(15))
                    .lineSpacing(4)
                    .foregroundStyle(KColor.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                // Content, not floating chrome: flat on every OS (never Liquid Glass).
                GlassButton(title: "Nueva colección", systemImage: "plus", flat: true) {
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
        VStack(spacing: 8) {
            Text("se llena sola con lo que aún no sale")
                .font(.kura.newsItalic(15))
                .foregroundStyle(KColor.text2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text(WaitingMeta.line(ts, store: store)).monoLabel(11).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.top, 4)
        .padding(.bottom, 22)
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
    /// The ghost's name. Drawn in `text` like any other (critica 2026-09-27 #30: dimmed to .6 it
    /// read as disabled).
    let ghost: Bool
}

/// The strip of names, all from the position: the centre in Newsreader 30; a neighbour pinned
/// 142 pt off-centre (its near edge) at 22 and .45; past that it slides 278 pt more per
/// collection and fades out. Tapping a neighbour goes there.
///
/// A name that doesn't fit ONE line at 30 in 256 (founder, 2026-09-29) drops to 24 and takes up
/// to TWO lines, tight, in the same 256, and the strip grows 44 → 56 with the position (so the
/// body glides instead of jumping). 256 keeps it clear of the neighbours: 2·142 − 2·14 of air.
/// Names are capped at `AppStore.collectionNameLimit` (40, measured on Newsreader: ~0.42 em per
/// character → 40 fill ~405 of the 512 two lines give at 24, with room for word breaks), and
/// anything wider still ends in "…". The full name is on the collection's page and in VoiceOver.
private struct CarouselNames: View {
    static let maxName: CGFloat = 256
    static let oneLineHeight: CGFloat = 44
    static let twoLineHeight: CGFloat = 56

    /// Whether this name needs the two-line 24 treatment (its natural width at 30 > 256).
    static func isLong(_ id: String, _ widths: [String: CGFloat]) -> Bool { (widths[id] ?? 0) > maxName }

    /// The strip's height at the position: 44 or 56 per name, crossing with the drag.
    static func height(_ p: CGFloat, names: [CarouselName], widths: [String: CGFloat]) -> CGFloat {
        let (lo, hi, t) = between(p, names.count)
        guard !names.isEmpty else { return oneLineHeight }
        func h(_ i: Int) -> CGFloat { isLong(names[i].id, widths) ? twoLineHeight : oneLineHeight }
        return h(lo) + (h(hi) - h(lo)) * t
    }

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
                        let long = Self.isLong(e.id, widths)
                        // Centre 30 → neighbour 22; a long name 24 → 22.
                        let size: CGFloat = long ? 24 : 30
                        let scale = (size - (size - 22) * min(1, a)) / size
                        let box = long ? Self.maxName : min(widths[e.id] ?? Self.maxName, Self.maxName)
                        let w = box * scale
                        // CSS: left 50% + translateX((−50 + 50·cd)% + px) → the centre sits at
                        // mid + px + cd·w/2.
                        let px = 142 * cd + (a > 1 ? (d > 0 ? 1 : -1) * (a - 1) * 278 : 0)
                        // Neighbours at .45 (≈3.6:1 on the darkest tint): they're tappable, so
                        // they clear WCAG 1.4.11's 3:1 (critica 2026-09-27 #32; was .35 ≈ 2.9:1).
                        let op = a <= 1 ? 1 - 0.55 * a : max(0, 0.45 * (2 - a))
                        let neighbour = abs(i - centre) == 1
                        Text(e.name)
                            .font(.kura.news(size))
                            .lineSpacing(long ? 2 : 0)
                            .foregroundStyle(KColor.text)
                            .multilineTextAlignment(.center)
                            .lineLimit(long ? 2 : 1)
                            .truncationMode(.tail)
                            .frame(width: box)
                            .fixedSize(horizontal: false, vertical: true)
                            .background {
                                // The natural width at 30, measured unconstrained (decides `long`).
                                Text(e.name).font(.kura.news(30)).lineLimit(1).fixedSize().hidden()
                                    .background {
                                        GeometryReader { t in Color.clear.preference(key: NameWidths.self, value: [e.id: t.size.width]) }
                                    }
                            }
                            .scaleEffect(scale)
                            .opacity(Double(op))
                            // Vertically centred in the strip: a one-line neighbour sits level
                            // with the middle of a two-line centre.
                            .position(x: mid + px + cd * w / 2, y: g.size.height / 2)
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

/// The 150 band under the tab bar, crossing the same way: ONE band over the crossing tail. Two
/// stacked bands (`band(lo)` + `band(hi).opacity(t)`) over-darken where the ramp is partial and
/// the band popped as a shadow while dragging (2026-09-27).
private struct CarouselDockBand: View {
    let pos: KSpring
    let tints: [[String]]

    var body: some View {
        Color.clear.kFeedDockBand(fill: CarouselTail(pos: pos, tints: tints))
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
/// "No se cargaron tus fiestas." + Reintentar (`GET /parties` failed; the collections are fine).
private struct PartiesRetryStrip: View {
    @Environment(AppStore.self) private var store
    let error: KuraAPIError

    var body: some View {
        RetryStrip(error: error, text: error == .offline ? "Sin conexión. No se cargaron tus fiestas." : "No se cargaron tus fiestas.") {
            Task { await store.loadParties(force: true) }
        }
    }
}

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
                // Someone whose only "collection" is a party they joined: a failed `GET /parties`
                // must not read as "you have nothing".
                if let e = store.loadError(.parties) {
                    PartiesRetryStrip(error: e).padding(.horizontal, 12).padding(.bottom, 16)
                }

                VStack(spacing: 14) {
                    FanView(covers: [], lead: 180, ghost: true)
                        .kPressable { store.present(.newCollection(addingTitleID: nil)) }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Nueva colección")
                        .accessibilityAddTraits(.isButton)
                    Text("aquí va lo que más vale")
                        .font(.kura.news(34))
                        .foregroundStyle(KColor.text)
                        .multilineTextAlignment(.center)
                        .padding(.top, 16)
                    Text("Empieza por lo que no puedes dejar de recomendar. Una colección puede mezclar películas, series y álbumes.")
                        .font(.kura.ui(15))
                        .lineSpacing(4)
                        .foregroundStyle(KColor.text2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    GlassButton(title: "Nueva colección", systemImage: "plus", flat: true) {
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
    @State private var privacy: Privacy = .onlyMe
    @State private var privacySeeded = false
    @State private var choosingPrivacy = false
    /// Colección | Fiesta (fiesta-app-v2 `create`). Only when creating from scratch: saving a title
    /// "en una nueva" is always a normal collection (a party holds songs, never a title).
    @State private var party = false
    @State private var perGuestLimit: Int? = PartyCopy.defaultLimit
    @State private var creatingParty = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SheetHeader(title: "nueva colección") { store.dismissSheet() }
            VStack(spacing: 14) {
                if addingTitleID == nil {
                    kindPicker
                }
                GlassField(placeholder: party ? "la fiesta de…" : "nombre de la colección", text: $name, serif: true, focus: $focused)
                    .submitLabel(.done)
                    .onSubmit(create)
                    .onChange(of: name) { _, v in
                        let cap = party ? 60 : AppStore.collectionNameLimit
                        if v.count > cap { name = String(v.prefix(cap)) }
                    }
                if party {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Canciones por invitado").font(.kura.ui(14, .semibold)).foregroundStyle(KColor.text)
                        PartyLimitStepper(limit: $perGuestLimit)
                    }
                } else if choosingPrivacy {
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
                SolidButton(title: party ? "Crear fiesta" : "Crear",
                            enabled: !creatingParty && !name.trimmingCharacters(in: .whitespaces).isEmpty, action: create)
            }
            .padding(.top, 6)
        }
        .padding(.horizontal, 20)
        .onAppear {
            focused = true
            if !privacySeeded { privacySeeded = true; privacy = store.defaultPrivacy }
            #if DEBUG
            // `-kuraScreen partycreate`: the sheet opens on Fiesta.
            if UserDefaults.standard.bool(forKey: "kuraNewParty"), addingTitleID == nil {
                party = true; name = "la fiesta de mariel"; focused = false
            }
            #endif
        }
    }

    /// Colección (series, películas o álbumes) | Fiesta (cada invitado agrega canciones).
    private var kindPicker: some View {
        VStack(spacing: 8) {
            kindRow(false, "Colección", "Agrega películas, series o álbumes.")
            kindRow(true, "Fiesta", "Cada invitado agrega canciones.")
        }
    }

    private func kindRow(_ isParty: Bool, _ title: String, _ note: String) -> some View {
        let on = party == isParty
        return Button {
            withAnimation(KMotion.fade) { party = isParty }
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.kura.ui(16, .semibold)).foregroundStyle(KColor.text)
                Text(note).font(.kura.ui(14)).foregroundStyle(KColor.text2).multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(on ? KColor.glassSelected : KColor.glassBg,
                        in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func create() {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        if party {
            guard !creatingParty else { return }
            creatingParty = true
            Task {
                // Opens the party with its share sheet (`AppStore.createParty`); a failure says why.
                await store.createParty(name: name, perGuestLimit: perGuestLimit)
                creatingParty = false
            }
            return
        }
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
