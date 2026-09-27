import SwiftUI

/// Colección (Colecciones formalizado · 2a). The collection continues from its fan: the fan grows
/// into the header.
///
/// The whole page wears the FEED gradient of the fan's front cover (168°, anchored at 900,
/// continuing in its bottom tone). Header: Volver · Compartir + Opciones; the fan at 225;
/// "colección · fijada" in mono; the name in Newsreader 36; the line in italic 16; the credits
/// (your seal + "solo tú · 12 títulos"); and the format pills that filter (only with more than
/// one format; tap again to clear).
///
/// Everything under the name is `CollectionBody`, the SAME body Tus colecciones draws under its
/// carousel (propuesta 10): "el orden" + Reordenar, then the titles in three columns (`Masonry`)
/// in the MANUAL order — or Recientes · Título · Estado · Año (per device), or the list (16c).
/// Holding a title: 18c (Tu reacción · Reseñar · Usar como portada · Mover · Quitar). Twin of the
/// web's `collection-screen.tsx`.
struct CollectionDetailView: View {
    @Environment(AppStore.self) private var store
    let collectionID: String

    var body: some View {
        let c = store.collection(collectionID)
        // Ids known, titles not (yet): never draw "repisa vacía" for a full collection.
        let ready = c.flatMap { c in (!c.titleIDs.isEmpty && store.titles(in: c).isEmpty) ? nil : c }
        ResourceScreen(value: ready,
                       missing: c == nil,
                       error: c.flatMap(loadError),
                       retry: { Task { await store.loadCollection(collectionID, force: true) } },
                       skeleton: .collection) { c in
            content(c)
        }
        .task(id: collectionID) { await store.loadCollection(collectionID) }
    }

    /// This collection's read failed, or the launch couldn't bring titles it has.
    private func loadError(_ c: KCollection) -> KuraAPIError? {
        if let e = store.loadError(.collection(c.id)) { return e }
        let missing = c.titleIDs.contains { store.title($0) == nil }
        return missing ? store.loadError(.library) : nil
    }

    private func content(_ c: KCollection) -> some View {
        let empty = c.titleIDs.isEmpty
        let tint = empty ? [] : store.hexes(of: c)

        return ZStack(alignment: .top) {
            Tint.feedTail(tint).ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    FanHeader(fan: store.fan(of: c), name: c.name, ghost: empty,
                              onGhost: { store.present(.addTitles(c.id)) }, bottom: empty ? 26 : 0) {
                        if !empty {
                            Text(c.pinned ? "colección · fijada" : "colección").monoLabel(10).padding(.top, 4)
                        }
                    } below: {
                        EmptyView()
                    }
                    // Everything under the name is the same body as Tus colecciones (propuesta 10).
                    CollectionBody(collection: c) {
                        if let e = loadError(c) {
                            RetryStrip(error: e, text: e == .offline ? nil : "Faltan títulos de esta colección.") {
                                Task { await store.loadCollection(c.id, force: true) }
                            }
                            .padding(.horizontal, 12)
                            .padding(.bottom, 12)
                        }
                    }
                }
                .padding(.bottom, 56)
                .kFeedSurface(tint, span: 900)
            }
            .ignoresSafeArea(.container, edges: .top)

            TopChrome {
                CollectionChips(collection: c)
            }
        }
    }

    /// The formats in the order each first appears.
    static func formats(_ titles: [Title]) -> [MediaFormat] { CollectionBody<EmptyView>.formats(titles) }
}

/// Compartir + Opciones in glass (44, `kGlass`), over one collection — 10b's top right and 10a's
/// header (the collection in the centre). Opciones opens the full sheet (18a).
struct CollectionChips: View {
    @Environment(AppStore.self) private var store
    let collection: KCollection

    var body: some View {
        HStack(spacing: 8) {
            IconChip44(systemName: "square.and.arrow.up", label: "Compartir \(collection.name)") {
                store.present(.share(collection.id))
            }
            IconChip44(systemName: "ellipsis", iconSize: 17, label: "Opciones de \(collection.name)") {
                store.present(.more(collection.id))
            }
        }
    }
}

extension SortMode {
    /// The body's heading under the header ("el orden" is the owner's manual order).
    var heading: String {
        switch self {
        case .manual: return "el orden"
        case .recent: return "recientes"
        case .title: return "por título"
        case .status: return "por estado"
        case .year: return "por año"
        }
    }
}

// MARK: - Header

/// A collection's header, from its fan: the fan at 225 (ghost + "+" when empty), a mono label,
/// the name in Newsreader 36 (30 when empty), then whatever goes under it. Pushed screens put it
/// 126 from the top (under Volver).
struct FanHeader<Label: View, Below: View>: View {
    let fan: [Title]
    let name: String
    var ghost = false
    var onGhost: (() -> Void)? = nil
    /// The gap under the header (0 when `CollectionBody` follows: it brings its own).
    var bottom: CGFloat = 26
    @ViewBuilder var label: Label
    @ViewBuilder var below: Below

    var body: some View {
        VStack(spacing: 10) {
            if ghost, let onGhost {
                FanView(covers: [], lead: 225, ghost: true)
                    .kPressable(action: onGhost)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Agregar a \(name)")
                    .accessibilityAddTraits(.isButton)
            } else {
                FanView(covers: fan, lead: 225, ghost: ghost, label: "Portadas de \(name)")
            }
            label
            Text(name)
                .font(.kura.news(ghost ? 30 : 36))
                .foregroundStyle(KColor.text)
                .multilineTextAlignment(.center)
                .padding(.top, ghost ? 6 : 0)
                .accessibilityAddTraits(.isHeader)
            below
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 126)
        .padding(.horizontal, 24)
        .padding(.bottom, bottom)
    }
}

/// The collection's line: Newsreader italic 16, text2, ~32 characters wide.
struct VibeLine: View {
    let text: String
    var size: CGFloat = 16
    var body: some View {
        Text(text)
            .font(.kura.newsItalic(size))
            .foregroundStyle(KColor.text2)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 300)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The credits (2a): your seal at 26 and "solo tú · 12 títulos" (collaborators don't exist on
/// the app yet: the credit is always yours alone).
struct Credits: View {
    @Environment(AppStore.self) private var store
    let count: Int
    var body: some View {
        HStack(spacing: 8) {
            Seal(person: store.me, size: 26)
            Text("solo tú · \(count) \(count == 1 ? "título" : "títulos")")
                .font(.kura.ui(13))
                .foregroundStyle(KColor.text2)
        }
        .padding(.top, 2)
        .accessibilityElement(children: .combine)
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

/// 6b — "colección nueva, repisa vacía." + the glass Agregar títulos.
struct EmptyCollectionBody: View {
    let add: () -> Void
    var body: some View {
        VStack(spacing: 12) {
            Text("colección nueva, repisa vacía.")
                .font(.kura.news(28))
                .foregroundStyle(KColor.text)
                .multilineTextAlignment(.center)
            Text("Empieza por lo que no puedes dejar de recomendar.")
                .font(.kura.ui(15))
                .foregroundStyle(KColor.text2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            GlassButton(title: "Agregar títulos", systemImage: "plus", height: 48, fontSize: 16, action: add)
                .padding(.top, 14)
        }
        .padding(.horizontal, 28)
        .padding(.top, 8)
    }
}

// MARK: - Bodies

/// 16c · Lista: rows 80, cover in a 60 slot, italic 19, meta mono 11, glyph.
struct TitleList: View {
    @Environment(AppStore.self) private var store
    let titles: [Title]
    let collectionID: String

    var body: some View {
        LazyVStack(spacing: 0) {
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
                .kPressable(.row(inset: -10), longPress: {
                    store.present(.titleActions(titleID: t.id, collectionID: collectionID))
                }) { store.push(.title(t.id)) }
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
        if let cr = t.creator { parts.append(cr) }
        if store.isUnreleased(t), let l = store.releaseLabel(t) { parts.append(l) }
        return parts.joined(separator: " · ")
    }
}

// MARK: - 37b No puedo esperar (automatic)

/// The automatic collection: the same screen with the "auto" pill, the countdown on every cover
/// and no membership actions. Soonest first; the fan leads with the soonest.
struct WaitingCollectionView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        let all = store.waitingTitles
        let fan = Array(all.prefix(3))
        let tint = AppStore.fanHexes(fan, ordered: all)
        let next = all.first.flatMap { store.releaseLabel($0) }

        ZStack(alignment: .top) {
            Tint.feedTail(tint).ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    FanHeader(fan: fan, name: "no puedo esperar", ghost: all.isEmpty) {
                        HStack(spacing: 6) {
                            GlyphView(glyph: .clock, size: 12)
                            Text("auto").monoLabel(10, color: KColor.text)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .kArtGlass(in: Capsule())
                        .padding(.top, 4)
                    } below: {
                        VibeLine(text: "se llena sola con lo que aún no sale")
                        if !all.isEmpty {
                            Text("\(all.count) \(all.count == 1 ? "título" : "títulos")\(next.map { " · el próximo \(Self.nextLabel($0))" } ?? "")")
                                .monoLabel(11)
                        }
                    }
                    if all.isEmpty {
                        VStack(spacing: 10) {
                            Text("nada por estrenarse.").font(.kura.news(28)).foregroundStyle(KColor.text)
                            Text("Lo que guardes y todavía no salga aparece aquí solo, con cuánto falta.")
                                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 32)
                        .padding(.top, 16)
                    } else {
                        // 9b: holding a title opens the reduced 18c (Tu reacción · Reseñar).
                        Masonry(titles: all, badge: { t in store.releaseLabel(t).map(MasonryBadge.wait) ?? .none },
                                onHold: { t in store.present(.titleActions(titleID: t.id, collectionID: nil)) })
                    }
                }
                .padding(.bottom, 56)
                .kFeedSurface(tint, span: 900)
            }
            .ignoresSafeArea(.container, edges: .top)
            TopChrome { EmptyView() }
        }
    }

    /// "4 d" → "en 4 d" · "17 oct" → "el 17 oct" · "hoy" stays.
    static func nextLabel(_ label: String) -> String {
        if label == "hoy" { return "hoy" }
        let countdown = label.range(of: #"^\d+ [hd]$"#, options: .regularExpression) != nil
        return countdown ? "en \(label)" : "el \(label)"
    }
}
