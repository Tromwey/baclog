import SwiftUI

/// Colección (Colecciones formalizado · 2a). The collection continues from its fan: the fan grows
/// into the header.
///
/// The whole page wears the FEED gradient of the fan's front cover (168°, anchored at 900,
/// continuing in its bottom tone). Header: Volver · Compartir + Opciones; the fan at 225;
/// "fijada" in mono (only when pinned); the name in Newsreader 36; the line in italic 16; the credits
/// (seals + names only once collaborators exist); and the format pills (always:
/// one format = a label, several = they filter; tap again to clear).
///
/// Everything under the name is `CollectionBody`, the SAME body Tus colecciones draws under its
/// carousel (propuesta 10): the titles in three columns (`Masonry`)
/// in the MANUAL order — or Recientes · Título · Estado · Año (per device), or the list (16c).
/// Holding a title: 18c (Tu reacción · Reseñar · Usar como portada · Mover · Quitar). Twin of the
/// web's `collection-screen.tsx`.
struct CollectionDetailView: View {
    @Environment(AppStore.self) private var store
    let collectionID: String
    /// Opened as a hero page (from the profile): its titles open in place too (`TitleHeroHost`,
    /// the cover grows into the ficha). Pushed, it keeps the push + the system's cover zoom.
    var hostsTitleHero = false

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

    @ViewBuilder
    private func content(_ c: KCollection) -> some View {
        if hostsTitleHero {
            TitleHeroHost { page(c) }
        } else {
            page(c)
        }
    }

    private func page(_ c: KCollection) -> some View {
        let empty = c.titleIDs.isEmpty
        let tint = empty ? [] : store.hexes(of: c)

        return ZStack(alignment: .top) {
            Tint.feedTail(tint).ignoresSafeArea().heroBackdrop()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    FanHeader(fan: store.fan(of: c), name: c.name, ghost: empty,
                              onGhost: { store.present(.addTitles(c.id)) }, bottom: empty ? 26 : 0) {
                        // Only "fijada", and only when it is (founder, 2026-09-27): who sees
                        // it lives in Opciones ("Quién la ve"), and "colección" repeated the
                        // screen. Unpinned = no eyebrow; the VStack drops its spacing too.
                        if !empty && c.pinned {
                            Text("fijada").monoLabel(10).padding(.top, 4)
                        }
                    } below: {
                        EmptyView()
                    }
                    // Everything under the name is the same body as Tus colecciones (propuesta 10).
                    CollectionBody(collection: c) {
                        if let e = loadError(c) {
                            RetryStrip(error: e, text: e == .offline ? "Sin conexión. No se cargó el resto." : "No se cargó el resto.") {
                                Task { await store.loadCollection(c.id, force: true) }
                            }
                            .padding(.horizontal, 12)
                            .padding(.bottom, 12)
                        }
                    }
                }
                .padding(.bottom, 56)
                .kDockClearance()
                .kFeedSurface(tint, span: 900)
                // Recedes 4 % while a title opens over it (`TitleHeroHost`).
                .heroRecedes()
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
            // On a hero page the fan IS the one from the profile row: it flies here (`heroTarget`),
            // then the name rises from 35 %.
            if ghost, let onGhost {
                FanView(covers: [], lead: 225, ghost: true)
                    .heroTarget()
                    .kPressable(action: onGhost)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Agregar a \(name)")
                    .accessibilityAddTraits(.isButton)
            } else {
                FanView(covers: fan, lead: 225, ghost: ghost, label: "Portadas de \(name)")
                    .heroTarget()
            }
            label.heroLead()
            Text(name)
                .font(.kura.news(ghost ? 30 : 36))
                .foregroundStyle(KColor.text)
                .multilineTextAlignment(.center)
                .padding(.top, ghost ? 6 : 0)
                .accessibilityAddTraits(.isHeader)
                .heroLead()
            below.heroLead()
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

/// The credits (2a). No count any more (founder, 2026-09-27): a collection nobody shares had no
/// seals either, so its credits line was ONLY "N títulos" — now there's nothing left to say, and
/// the caller doesn't render this view at all (no empty row sitting in the VStack's spacing).
/// With collaborators (not on the app yet — no caller passes them) it's just your seal + theirs
/// at 26, overlapping 7, and "tú y mo".
struct Credits: View {
    @Environment(AppStore.self) private var store
    var collaborators: [Person] = []

    var body: some View {
        if !collaborators.isEmpty {
            HStack(spacing: 8) {
                HStack(spacing: -7) {
                    Seal(person: store.me, size: 26)
                    ForEach(collaborators) { p in Seal(person: p, size: 26) }
                }
                Text(Self.names(collaborators))
            }
            .font(.kura.ui(13))
            .foregroundStyle(KColor.text2)
            .padding(.top, 2)
            .accessibilityElement(children: .combine)
        }
    }

    /// "tú y mo", "tú, mo y ja" (first names, lowercase — the web's `ownCreditLine`).
    static func names(_ people: [Person]) -> String {
        let all = ["tú"] + people.map { ($0.name.split(separator: " ").first.map(String.init) ?? $0.handle).lowercased() }
        return all.count <= 1 ? (all.first ?? "") : all.dropLast().joined(separator: ", ") + " y " + all.last!
    }
}

/// A format and its count. With an `action` it filters (several formats); without one it's a
/// label — the collection's only format (founder, 2026-09-27: the pills always show).
struct FormatPill: View {
    let format: MediaFormat
    let count: Int
    var selected = false
    var action: (() -> Void)? = nil

    var body: some View {
        if let action {
            Button(action: action) { face }
                .buttonStyle(.plain)
                .accessibilityLabel(spoken)
                .accessibilityAddTraits(selected ? .isSelected : [])
        } else {
            face
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken)
        }
    }

    /// "3 películas", "1 serie", "2 álbumes" — the glyph alone says nothing to VoiceOver
    /// (critica 2026-09-27 #31).
    private var spoken: String {
        let one = count == 1
        switch format {
        case .film: return "\(count) \(one ? "película" : "películas")"
        case .series: return "\(count) \(one ? "serie" : "series")"
        case .album: return "\(count) \(one ? "álbum" : "álbumes")"
        }
    }

    private var face: some View {
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
}

/// 6b — "colección nueva, repisa vacía." (22, text2: under the collection's own name it's the
/// second voice, not a rival headline — critica 2026-09-27 #13) + the flat Agregar títulos.
struct EmptyCollectionBody: View {
    let add: () -> Void
    var body: some View {
        VStack(spacing: 12) {
            Text("colección nueva, repisa vacía.")
                .font(.kura.news(22))
                .foregroundStyle(KColor.text2)
                .multilineTextAlignment(.center)
            Text("Empieza por lo que no puedes dejar de recomendar.")
                .font(.kura.ui(15))
                .foregroundStyle(KColor.text2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            // Content, not floating chrome: flat on every OS.
            GlassButton(title: "Agregar títulos", systemImage: "plus", height: 48, fontSize: 16, flat: true, action: add)
                .padding(.top, 14)
        }
        .padding(.horizontal, 28)
        .padding(.top, 8)
    }
}

// MARK: - Bodies

/// 16c · Lista: rows 72, cover in a 56 slot, italic 19, meta mono 11 led by your reaction's glyph
/// (every row reads the same — no icon floating at the right edge of some rows only). Straight
/// under the pills with the same 26 as the columns (critica 2026-09-27 #27).
struct TitleList: View {
    @Environment(AppStore.self) private var store
    @Environment(\.heroHost) private var hero
    @Environment(\.accessibilityReduceMotion) private var reduce
    let titles: [Title]
    let collectionID: String

    var body: some View {
        LazyVStack(spacing: 0) {
            ForEach(titles) { t in
                HStack(spacing: 14) {
                    CoverView(title: t, width: t.format == .album ? 56 : 40, height: t.format == .album ? 56 : 60,
                              radius: KRadius.coverS)
                        .zoomSource(ZoomID.title(t.id))
                        .heroSource(t.id)
                        .frame(width: 56)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(t.name).font(.kura.newsItalic(19)).foregroundStyle(KColor.text).lineLimit(1)
                        HStack(spacing: 6) {
                            if let m = store.mark(t.id) {
                                GlyphView(glyph: m.glyph, size: 12)
                            } else if store.isUnreleased(t) {
                                GlyphView(glyph: .clock, size: 12)
                            }
                            Text(meta(t)).monoLabel(11).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 72)
                .contentShape(Rectangle())
                .kPressable(.row(inset: -10), longPress: {
                    store.present(.titleActions(titleID: t.id, collectionID: collectionID))
                }) { openTitle(t.id) }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
            }
        }
        .padding(.horizontal, 20)
        // The first row's cover sits 6 into its 72: pull up so cover-to-pills matches the
        // columns' 26.
        .padding(.top, -6)
    }

    /// In place when a hero hosts the list (the cover grows into the ficha), else a push.
    private func openTitle(_ id: String) {
        if let hero, hero.kind == .title { hero.open(id, reduce: reduce) } else { store.push(.title(id)) }
    }

    private func meta(_ t: Title) -> String {
        var parts = [t.format.metaLabel]
        // No year in a collection row: detail lives in the ficha (founder, 2026-09-27).
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
                            Text(WaitingMeta.line(all, store: store)).monoLabel(11)
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
                .kDockClearance()
                .kFeedSurface(tint, span: 900)
            }
            .ignoresSafeArea(.container, edges: .top)
            TopChrome { EmptyView() }
        }
    }
}
