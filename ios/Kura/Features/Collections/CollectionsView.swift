import SwiftUI

/// Tus colecciones (propuesta 10a — "Tus colecciones y Colección, una sola página"). One
/// collection at a time:
///
///  - its FAN in a carousel: swipe it (30 pt) or tap a neighbour's name. Only the current fan is
///    drawn — the others slide 320 and fade — so nothing half-shows at the edges except the
///    NAMES: the current one centred in Newsreader 30, the previous and next pinned 142 pt
///    off-centre at 22, dimmed to .35, so it reads that there's more on either side. Tapping the
///    fan only centres it; holding one opens 9a (the options without the view rows);
///  - under the names, the SAME body as Colección (`CollectionBody`): credits, format pills that
///    filter, "el orden" + Reordenar and every title (holding one = 18c); 6b when it's empty;
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
                CollectionsCarousel()
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

/// The carousel's curve (web: 450 ms `cubic-bezier(.16, 1, .3, 1)`).
private let carouselCurve = Animation.timingCurve(0.16, 1, 0.3, 1, duration: 0.45)

private struct NameWidths: PreferenceKey {
    static let defaultValue: [String: CGFloat] = [:]
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue()) { $1 }
    }
}

private struct CollectionsCarousel: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    /// The collection in the centre, by id (the web keeps it in sessionStorage).
    @SceneStorage("kura.carousel") private var currentID = ""
    @State private var nameWidths: [String: CGFloat] = [:]

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
        let tint = hexes(cur)
        ZStack(alignment: .top) {
            Tint.feedTail(tint).ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    header(cur)
                    strips
                    VStack(spacing: 0) {
                        fans(list, idx)
                        names(list, idx).padding(.top, 4)
                    }
                    .contentShape(Rectangle())
                    .simultaneousGesture(swipe(list, idx))
                    .accessibilityElement(children: .contain)
                    below(cur)
                        .id(cur.id)
                        .transition(.opacity)
                }
                .padding(.bottom, 140)
                .kFeedSurface(tint, span: 760)
            }
            .ignoresSafeArea(.container, edges: .top)
        }
        .kFeedDockBand(tint)
        #if DEBUG
        .onAppear {
            // `-kuraCarousel <id>`: the captures open the carousel on a given collection
            // (`nueva-coleccion` = the ghost, `no-puedo-esperar` = the automatic one).
            if let id = UserDefaults.standard.string(forKey: "kuraCarousel") { currentID = id }
        }
        #endif
    }

    private func go(_ i: Int, in list: [CarouselEntry]) {
        let next = list[max(0, min(list.count - 1, i))]
        guard next.id != currentID || currentID.isEmpty else { return }
        KHaptic.select()
        withAnimation(reduce ? KMotion.fade : carouselCurve) { currentID = next.id }
    }

    private func swipe(_ list: [CarouselEntry], _ idx: Int) -> some Gesture {
        DragGesture(minimumDistance: 12)
            .onEnded { v in
                let dx = v.translation.width
                guard abs(dx) > 30, abs(dx) > abs(v.translation.height) else { return }
                go(idx + (dx < 0 ? 1 : -1), in: list)
            }
    }

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

    private func fans(_ list: [CarouselEntry], _ idx: Int) -> some View {
        let near = Array(list.enumerated()).filter { abs($0.offset - idx) <= 1 }
        return ZStack(alignment: .top) {
            ForEach(near, id: \.element.id) { i, e in
                let d = i - idx
                fanSlide(e, index: idx, list: list)
                    .scaleEffect(d == 0 ? 1 : 0.92)
                    .offset(x: CGFloat(d) * 320)
                    .opacity(d == 0 ? 1 : 0)
                    .allowsHitTesting(d == 0)
                    .accessibilityHidden(d != 0)
            }
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
            case .increment: go(index + 1, in: list)
            case .decrement: go(index - 1, in: list)
            @unknown default: break
            }
        }
        if let c = e.collection {
            art
                .kPressable(longPress: { store.present(.collectionQuick(c.id)) }) {}
                .zoomSource(ZoomID.collection(c.id))
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

    private func names(_ list: [CarouselEntry], _ idx: Int) -> some View {
        GeometryReader { g in
            let mid = g.size.width / 2
            ZStack(alignment: .topLeading) {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, e in
                    let d = max(-2, min(2, i - idx))
                    let scale: CGFloat = d == 0 ? 1 : 22.0 / 30.0
                    let w = (nameWidths[e.id] ?? 0) * scale
                    let x: CGFloat = d == 0 ? 0 : CGFloat(d.signum()) * ((abs(d) == 1 ? 142 : 420) + w / 2)
                    let isNew = e.id == CarouselEntry.newID
                    Text(e.name)
                        .font(.kura.news(30))
                        .foregroundStyle(KColor.text)
                        .lineLimit(1)
                        .fixedSize()
                        .background {
                            GeometryReader { t in Color.clear.preference(key: NameWidths.self, value: [e.id: t.size.width]) }
                        }
                        .scaleEffect(scale)
                        // The ghost's name is a placeholder: .6 in the centre.
                        .opacity(d == 0 ? (isNew ? 0.6 : 1) : abs(d) == 1 ? 0.35 : 0)
                        .position(x: mid + x, y: 22)
                        .onTapGesture { if abs(d) == 1 { go(i, in: list) } }
                        .allowsHitTesting(abs(d) == 1)
                        .accessibilityHidden(d != 0)
                        .accessibilityAddTraits(d == 0 ? .isHeader : [])
                }
            }
        }
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
