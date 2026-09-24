import SwiftUI

/// 17 · Colección — tinted header with the chosen cover; body grouped by
/// format, shelved (grid) or as a list (16c). Empty → 15d.
struct CollectionDetailView: View {
    @Environment(AppStore.self) private var store
    let collectionID: String
    @State private var filter: MediaFormat? = nil

    var body: some View {
        if let c = store.collection(collectionID) {
            content(c)
        } else {
            GoneView()
        }
    }

    private func content(_ c: KCollection) -> some View {
        let all = store.titles(in: c)
        let formats = MediaFormat.allCases.filter { f in all.contains { $0.format == f } }
        let visible = filter.map { f in all.filter { $0.format == f } } ?? all

        return ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    if all.isEmpty {
                        EmptyCollectionHeader(collection: c)
                    } else {
                        CollectionHeader(
                            name: c.name,
                            palette: store.palette(of: c),
                            lead: { leadCover(c) },
                            formats: formats.map { f in (f, all.filter { $0.format == f }.count) },
                            filter: $filter
                        )
                        bodyContent(c, titles: visible, formats: filter == nil ? formats : [filter!])
                    }
                }
                .padding(.bottom, 56)
            }
            .ignoresSafeArea(.container, edges: .top)

            TopChrome {
                IconChip44(systemName: "ellipsis", iconSize: 17, label: "Opciones de la colección") {
                    store.present(.more(c.id))
                }
            }
        }
    }

    @ViewBuilder private func leadCover(_ c: KCollection) -> some View {
        if let t = store.coverTitle(of: c) {
            Button { store.push(.changeCover(c.id)) } label: {
                CoverView(title: t, height: 240)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Portada: \(t.name). Cambiar portada")
        }
    }

    @ViewBuilder
    private func bodyContent(_ c: KCollection, titles: [Title], formats: [MediaFormat]) -> some View {
        if c.layout == .list {
            TitleList(titles: titles, collectionID: c.id)
        } else if formats.count > 1 {
            GroupedShelves(titles: titles, formats: formats, collectionID: c.id)
        } else {
            ShelfGrid(titles: titles, collectionID: c.id)
        }
    }
}

// MARK: - Header

struct CollectionHeader<Lead: View>: View {
    let name: String
    let palette: [String]?
    @ViewBuilder var lead: Lead
    let formats: [(MediaFormat, Int)]
    @Binding var filter: MediaFormat?

    var body: some View {
        VStack(spacing: 12) {
            lead
            Text(name)
                .font(.kura.news(24))
                .foregroundStyle(KColor.text)
                .multilineTextAlignment(.center)
                .padding(.top, 8)
                .accessibilityAddTraits(.isHeader)
            if !formats.isEmpty {
                HStack(spacing: 6) {
                    ForEach(formats, id: \.0) { f, n in
                        FormatPill(format: f, count: n, selected: filter == f) {
                            withAnimation(KMotion.short) { filter = (filter == f) ? nil : f }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 124)
        .padding(.horizontal, 24)
        .padding(.bottom, 28)
        .background {
            Group {
                if let palette { Tint.header(palette) } else { Tint.neutralHeader }
            }
            .animation(KMotion.tint, value: palette)
        }
    }
}

struct FormatPill: View {
    let format: MediaFormat
    let count: Int
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Image(systemName: format.symbol).font(.system(size: 13, weight: .medium))
                Text("\(count)").font(.kura.mono(12))
            }
            .foregroundStyle(KColor.text)
            .padding(.horizontal, 14)
            .frame(height: 40)
            .background(selected ? KColor.glassSelected : KColor.glassBg, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(format.label), \(count)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Bodies

/// A cover in a collection body: italic 14 title + mono 10 sub, tap → ficha,
/// long press → 18c.
struct ShelfItem: View {
    @Environment(AppStore.self) private var store
    let title: Title
    let collectionID: String
    /// nil → fill the grid column.
    var width: CGFloat? = nil
    var showsSub = true

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            if let width {
                CoverView(title: title, width: width, height: width / title.format.aspect, badge: badge)
                    .zoomSource(ZoomID.title(title.id))
            } else {
                CoverView(title: title, badge: badge, fluid: true)
                    .zoomSource(ZoomID.title(title.id))
            }
            Text(title.name)
                .font(.kura.newsItalic(14))
                .foregroundStyle(KColor.text)
                .lineLimit(1)
                .frame(maxWidth: width ?? .infinity, alignment: .leading)
            if showsSub {
                Text(sub)
                    .monoLabel(10)
                    .lineLimit(1)
                    .frame(maxWidth: width ?? .infinity, alignment: .leading)
            }
        }
        .frame(width: width)
        .contentShape(Rectangle())
        .onTapGesture { store.push(.title(title.id)) }
        .onLongPressGesture(minimumDuration: 0.4) {
            guard !collectionID.isEmpty else { return }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            store.present(.titleActions(titleID: title.id, collectionID: collectionID))
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: "Opciones") {
            store.present(.titleActions(titleID: title.id, collectionID: collectionID))
        }
    }

    private var sub: String {
        [title.year.map(String.init), title.format == .album ? title.creator : title.creator.components(separatedBy: " ").last]
            .compactMap { $0 }.joined(separator: " · ")
    }

    private var badge: CoverBadge {
        if let m = store.mark(title.id) { return .mark(m) }
        if store.isUnreleased(title), let l = store.releaseLabel(title) { return .waiting(l) }
        return .none
    }
}

struct GroupedShelves: View {
    let titles: [Title]
    let formats: [MediaFormat]
    let collectionID: String

    var body: some View {
        VStack(spacing: 30) {
            ForEach(formats) { f in
                let items = titles.filter { $0.format == f }
                if !items.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(f.sectionName).font(.kura.news(24)).foregroundStyle(KColor.text)
                            Spacer()
                            Text("\(items.count)").monoLabel(12)
                        }
                        .padding(.horizontal, 20)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(alignment: .bottom, spacing: 12) {
                                ForEach(items) { t in
                                    ShelfItem(title: t, collectionID: collectionID, width: t.format == .album ? 150 : 100)
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.bottom, 6)
                        }
                        .scrollClipDisabled()
                    }
                }
            }
        }
        .padding(.top, 22)
    }
}

struct ShelfGrid: View {
    let titles: [Title]
    let collectionID: String

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .bottom), count: 3),
                  alignment: .leading, spacing: 20) {
            ForEach(titles) { t in
                ShelfItem(title: t, collectionID: collectionID)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
    }
}

/// 16c · Lista: rows 80, cover in a 60 slot, italic 19, meta mono 11, glyph.
struct TitleList: View {
    @Environment(AppStore.self) private var store
    let titles: [Title]
    let collectionID: String

    var body: some View {
        VStack(spacing: 0) {
            ForEach(titles) { t in
                HStack(spacing: 14) {
                    CoverView(title: t, width: t.format == .album ? 56 : 40, height: t.format == .album ? 56 : 60,
                              radius: KRadius.coverS)
                        .zoomSource(ZoomID.title(t.id))
                        .frame(width: 60)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(t.name).font(.kura.newsItalic(19)).foregroundStyle(KColor.text).lineLimit(1)
                        Text(meta(t)).monoLabel(11).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    if let m = store.mark(t.id) {
                        GlyphView(glyph: m.glyph, size: 16)
                    } else if store.isUnreleased(t) {
                        GlyphView(glyph: .clock, size: 16)
                    }
                }
                .frame(minHeight: 80)
                .contentShape(Rectangle())
                .onTapGesture { store.push(.title(t.id)) }
                .onLongPressGesture(minimumDuration: 0.4) {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    store.present(.titleActions(titleID: t.id, collectionID: collectionID))
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private func meta(_ t: Title) -> String {
        var parts = [t.format.metaLabel]
        if let y = t.year { parts.append(String(y)) }
        parts.append(t.creator)
        if store.isUnreleased(t), let l = store.releaseLabel(t) { parts.append(l) }
        return parts.joined(separator: " · ")
    }
}

// MARK: - 15d Colección vacía

struct EmptyCollectionHeader: View {
    @Environment(AppStore.self) private var store
    let collection: KCollection

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 12) {
                Button { store.present(.addTitles(collection.id)) } label: { EmptyCoverSlot() }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Agregar a \(collection.name)")
                Text(collection.name).font(.kura.news(24)).foregroundStyle(KColor.text).padding(.top, 8)
            }
            .padding(.top, 124)
            VStack(spacing: 10) {
                Text("colección nueva, repisa vacía.")
                    .font(.kura.news(28))
                    .foregroundStyle(KColor.text)
                    .multilineTextAlignment(.center)
                Text("Empieza por lo que no puedes dejar de recomendar.")
                    .font(.kura.ui(15))
                    .foregroundStyle(KColor.text2)
                    .multilineTextAlignment(.center)
                GlassButton(title: "Agregar títulos", systemImage: "plus", height: 48, fontSize: 16) {
                    store.present(.addTitles(collection.id))
                }
                .padding(.top, 16)
            }
            .padding(.top, 40)
            .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity)
    }
}

struct GoneView: View {
    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 10) {
                Text("esta colección ya no existe.").font(.kura.news(28)).foregroundStyle(KColor.text)
                Text("Se borró o dejó de estar disponible.").font(.kura.ui(15)).foregroundStyle(KColor.text2)
            }
            .padding(.horizontal, 24)
            .padding(.top, 140)
            .frame(maxWidth: .infinity, alignment: .leading)
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
    }
}

// MARK: - 37b No puedo esperar (automatic)

struct WaitingCollectionView: View {
    @Environment(AppStore.self) private var store
    @State private var filter: MediaFormat? = nil

    var body: some View {
        let all = store.waitingTitles
        let formats = MediaFormat.allCases.filter { f in all.contains { $0.format == f } }
        let visible = filter.map { f in all.filter { $0.format == f } } ?? all

        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    CollectionHeader(name: "no puedo esperar", palette: ["#5ca6cb", "#33566e"], lead: {
                        ZStack(alignment: .bottomLeading) {
                            LinearGradient(colors: [Color(hex: "#3a5a70"), Color(hex: "#1c2a35")],
                                           startPoint: Tint.angle160.start, endPoint: Tint.angle160.end)
                            Image(systemName: "clock.fill")
                                .font(.system(size: 96))
                                .foregroundStyle(KColor.waiting)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                            Text("auto").monoLabel(11, tracking: 0.14, color: KColor.text)
                                .padding(.leading, 16).padding(.bottom, 14)
                        }
                        .frame(width: 240, height: 240)
                        .clipShape(RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous))
                        .kShadow(.cover)
                        .accessibilityLabel("Portada de no puedo esperar")
                    }, formats: formats.map { f in (f, all.filter { $0.format == f }.count) }, filter: $filter)

                    Text("Lo que guardaste antes de que saliera. Se ordena solo: primero lo que ya salió, luego lo más próximo.")
                        .font(.kura.ui(13))
                        .foregroundStyle(KColor.text2)
                        .padding(.horizontal, 24)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    ShelfGrid(titles: visible, collectionID: "")
                }
                .padding(.bottom, 56)
            }
            .ignoresSafeArea(.container, edges: .top)
            TopChrome { EmptyView() }
        }
    }
}
