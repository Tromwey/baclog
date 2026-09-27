import SwiftUI

/// Tus colecciones (Colecciones formalizado · 1a — replaces the format filter and the spine
/// cards). One collection at a time:
///
///  - its FAN in a carousel: swipe it (30 pt) or tap a neighbour's name. Only the current fan is
///    drawn — the others slide 320 and fade — so nothing half-shows at the edges except the
///    NAMES: the current one centred in Newsreader 30, the previous and next pinned 142 pt
///    off-centre at 22, dimmed to .35, so it reads that there's more on either side;
///  - its line (Newsreader italic 15) and "N títulos · solo tú";
///  - up to 30 of its titles in three columns (`Masonry`), in the manual order, + "Ver los N";
///  - the whole page in the feed gradient of its front cover (760), continuing in its bottom tone
///    under the dock.
///
/// The pinned collection comes first, the automatic "no puedo esperar" last; the current one is
/// remembered by id (a pin reorders the list, you stay where you were). Compartir (next to
/// Nueva colección) shares the collection in the centre. Tapping the fan opens it; holding it
/// opens Agregar títulos · Compartir · Fijar · Renombrar. Twin of the web's `collection-cards.tsx`.
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

/// One stop of the carousel: a collection of yours, or the automatic "no puedo esperar".
private enum CarouselEntry: Identifiable {
    case shelf(KCollection)
    case auto([Title])

    static let autoID = "no-puedo-esperar"

    var id: String {
        switch self {
        case .shelf(let c): return c.id
        case .auto: return Self.autoID
        }
    }

    var name: String {
        switch self {
        case .shelf(let c): return c.name
        case .auto: return "no puedo esperar"
        }
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

    private var entries: [CarouselEntry] {
        var list = store.orderedCollections.map(CarouselEntry.shelf)
        let waiting = store.waitingTitles
        if !waiting.isEmpty { list.append(.auto(waiting)) }
        return list
    }

    private func fan(_ e: CarouselEntry) -> [Title] {
        switch e {
        case .shelf(let c): return store.fan(of: c)
        case .auto(let ts): return Array(ts.prefix(3))
        }
    }

    private func hexes(_ e: CarouselEntry) -> [String] {
        switch e {
        case .shelf(let c): return store.hexes(of: c)
        case .auto(let ts): return AppStore.fanHexes(Array(ts.prefix(3)), ordered: ts)
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
                    meta(cur)
                    titles(cur)
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
            // `-kuraCarousel <id>`: the captures open the carousel on a given collection.
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

    private func header(_ cur: CarouselEntry) -> some View {
        TabTitleBar(title: "tus colecciones") {
            HStack(spacing: 8) {
                if case .shelf(let c) = cur {
                    IconChip44(systemName: "square.and.arrow.up", label: "Compartir \(c.name)") {
                        store.present(.share(c.id))
                    }
                }
                IconChip44(systemName: "plus", iconSize: 15, weight: .bold, label: "Nueva colección") {
                    store.present(.newCollection(addingTitleID: nil))
                }
            }
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
                fanSlide(e, current: d == 0, index: idx, list: list)
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

    private func fanSlide(_ e: CarouselEntry, current: Bool, index: Int, list: [CarouselEntry]) -> some View {
        let covers = fan(e)
        let empty = covers.isEmpty
        return FanView(covers: covers, lead: 225, ghost: empty)
            .frame(width: 300)
            .contentShape(Rectangle())
            .kPressable(longPress: hold(e)) { open(e) }
            .zoomSource(ZoomID.collection(e.id))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(empty ? "Agregar títulos a \(e.name)" : "Abrir \(e.name)")
            .accessibilityHint("Desliza hacia arriba o abajo para cambiar de colección.")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { open(e) }
            .accessibilityAdjustableAction { dir in
                switch dir {
                case .increment: go(index + 1, in: list)
                case .decrement: go(index - 1, in: list)
                @unknown default: break
                }
            }
    }

    private func open(_ e: CarouselEntry) {
        switch e {
        case .auto: store.push(.automatic)
        case .shelf(let c):
            if c.titleIDs.isEmpty { store.present(.addTitles(c.id)) } else { store.push(.collection(c.id)) }
        }
    }

    private func hold(_ e: CarouselEntry) -> (() -> Void)? {
        guard case .shelf(let c) = e else { return nil }
        return { store.present(.collectionQuick(c.id)) }
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
                    Text(e.name)
                        .font(.kura.news(30))
                        .foregroundStyle(KColor.text)
                        .lineLimit(1)
                        .fixedSize()
                        .background {
                            GeometryReader { t in Color.clear.preference(key: NameWidths.self, value: [e.id: t.size.width]) }
                        }
                        .scaleEffect(scale)
                        .opacity(d == 0 ? 1 : abs(d) == 1 ? 0.35 : 0)
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

    // MARK: Line + meta

    private func meta(_ e: CarouselEntry) -> some View {
        let (vibe, line): (String?, String) = {
            switch e {
            case .auto(let ts):
                let next = ts.first.flatMap { store.releaseLabel($0) }.map { " · el próximo \(Self.nextLabel($0))" } ?? ""
                return ("se llena sola con lo que aún no sale", "\(ts.count) \(ts.count == 1 ? "título" : "títulos")\(next)")
            case .shelf(let c):
                let n = c.titleIDs.count
                return (c.shownVibe, "\(n) \(n == 1 ? "título" : "títulos") · solo tú")
            }
        }()
        return VStack(spacing: 8) {
            if let vibe {
                Text(vibe)
                    .font(.kura.newsItalic(15))
                    .foregroundStyle(KColor.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(line).monoLabel(11).multilineTextAlignment(.center)
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

    // MARK: Titles

    @ViewBuilder private func titles(_ e: CarouselEntry) -> some View {
        switch e {
        case .auto(let ts):
            Masonry(titles: ts, badge: { t in store.releaseLabel(t).map(MasonryBadge.wait) ?? .none })
        case .shelf(let c):
            if c.titleIDs.isEmpty {
                VStack(spacing: 12) {
                    Text("Empieza por lo que no puedes dejar de recomendar.")
                        .font(.kura.ui(15))
                        .foregroundStyle(KColor.text2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    GlassButton(title: "Agregar títulos", systemImage: "plus", height: 48, fontSize: 16) {
                        store.present(.addTitles(c.id))
                    }
                }
                .padding(.horizontal, 32)
            } else {
                // The manual order (never the collection's own sort), 30 at most.
                let shown = Array(c.titleIDs.compactMap { store.title($0) }.prefix(30))
                VStack(spacing: 4) {
                    Masonry(titles: shown)
                    if c.titleIDs.count > shown.count {
                        GlassButton(title: "Ver los \(c.titleIDs.count) títulos") { store.push(.collection(c.id)) }
                    }
                }
            }
        }
    }
}

// MARK: - 6c Cargando

/// The real header ("tus colecciones" + the 44 chip, so nothing jumps when the page lands), then
/// the carousel's shape — the ghost fan at 225 in the same 290 band, the name's bar, the meta's
/// bar, and a first row of three columns (póster · disco · póster) — on `s1`, with the system's
/// one allowed pulse.
struct CollectionsSkeleton: View {
    var body: some View {
        VStack(spacing: 0) {
            TabTitleBar(title: "tus colecciones") {
                Image(systemName: "plus").font(.system(size: 15, weight: .bold)).foregroundStyle(KColor.text)
                    .frame(width: 44, height: 44)
                    .kGlass(Circle())
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

// MARK: - Mantener presionado un abanico

/// Holding a fan (frame 10, sheetOpen): the name 24 + mono meta, then Agregar títulos ·
/// Compartir · Fijar/Desfijar · Renombrar.
struct CollectionQuickSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String

    var body: some View {
        if let c = store.collection(collectionID) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(c.name).font(.kura.news(24)).foregroundStyle(KColor.text).lineLimit(1)
                    Spacer()
                    Text(kindMeta(c)).monoLabel()
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 8)
                SheetRow(systemImage: "plus", label: "Agregar títulos") {
                    store.present(.addTitles(c.id))
                }
                SheetRow(systemImage: "square.and.arrow.up", label: "Compartir") {
                    store.present(.share(c.id))
                }
                SheetRow(systemImage: c.pinned ? "pin.slash" : "pin", label: c.pinned ? "Desfijar" : "Fijar",
                         action: { store.dismissSheet(); store.togglePin(c.id) }) {
                    if c.pinned { Text("fijada").monoLabel() }
                }
                SheetRow(systemImage: "pencil", label: "Renombrar") {
                    store.present(.rename(c.id))
                }
            }
            .padding(.horizontal, 12)
        }
    }

    /// "12 títulos" or "5 · cine, música" (the formats a collection mixes).
    private func kindMeta(_ c: KCollection) -> String {
        let ts = store.titles(in: c)
        let n = c.titleIDs.count
        let kinds = MediaFormat.allCases.filter { f in ts.contains { $0.format == f } }
        guard kinds.count > 1 else { return "\(n) \(n == 1 ? "título" : "títulos")" }
        return "\(n) · " + kinds.map(\.sectionName).joined(separator: ", ")
    }
}
