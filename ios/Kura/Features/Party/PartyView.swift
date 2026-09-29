import SwiftUI

/// Colección de fiesta (design `fiesta-app-v2` · collab / host / blocked / empty / loading). One page
/// for the host and the guests; `viewer` says which parts show:
///
///  - the hero: the first three songs as a fan of records (1:1), "colección de fiesta", the name in
///    Newsreader 36, "cada invitado pone N canciones", the contributors' seals + "tuya · 8 canciones"
///    or "de @eric · 8 canciones";
///  - a guest: the slots card ("Pusiste 1 de 3 · Te quedan 2"), or "Ya no puedes agregar canciones"
///    once the host blocked them; a host: nothing (no cap);
///  - "las canciones", in playlist order, each with who put it ("Pusiste tú" · "Puso @ana" ·
///    "Puso alguien"); the host's "…" (and a tap) opens Quitar / Quitar y bloquear, a guest's tap on
///    their own song opens Quitar — blocked too (they can't add, but can take theirs out);
///  - the bar at the bottom (over the page's own tail): "Buscar canción" (honey) → "Cambiar una
///    canción" once full; the host's "Invitar a la fiesta" (honey) + a search chip.
///
/// The page wears the feed gradient of the first song that has a palette (900, continuing in its
/// tone under the bar), like every collection page. No dock here: the bar is the page's action.
struct PartyView: View {
    @Environment(AppStore.self) private var store
    let partyID: String

    var body: some View {
        Group {
            if let p = store.party(partyID) {
                PartyPage(party: p)
            } else if store.partiesUnavailable {
                GoneView(title: PartyCopy.unavailableTitle, note: "Todavía no están listas en el servidor. Vuelve en unos días.")
            } else if store.partyIsMissing(partyID) {
                GoneView(title: "esta fiesta ya no está.",
                         note: "No encontramos esa fiesta. Puede que ya no exista o que no seas parte de ella.")
            } else if let e = store.loadError(.party(partyID)) {
                LoadErrorScreen(error: e) { Task { await store.loadParty(partyID, force: true) } }
            } else {
                PartyLoading()
            }
        }
        // Always re-read on the way in: other guests add while you're away.
        .task(id: partyID) { await store.loadParty(partyID, force: true) }
    }
}

/// The page's skeleton (design `loading`): the empty fan, three bars, five rows.
private struct PartyLoading: View {
    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 10) {
                    FanView(covers: [], lead: 212, ghost: true, plus: false)
                    Capsule().fill(KColor.glassBg).frame(width: 140, height: 10).padding(.top, 8)
                    RoundedRectangle(cornerRadius: 10).fill(KColor.glassBg).frame(width: 230, height: 32)
                    Capsule().fill(Color.white.opacity(0.05)).frame(width: 170, height: 12)
                    PartyRowsSkeleton().padding(.horizontal, 8).padding(.top, 26)
                }
                .kSkeletonPulse()
                .padding(.top, 126)
            }
            .ignoresSafeArea(.container, edges: .top)
            .scrollDisabled(true)
            TopChrome { EmptyView() }
        }
        .accessibilityLabel("Cargando la fiesta")
    }
}

private struct PartyPage: View {
    @Environment(AppStore.self) private var store
    let party: Party

    private var p: Party { party }
    private var guest: Bool { !p.isHost }
    private var limit: Int? { p.perGuestLimit }
    private var mine: [PartySong] { p.mySongs }
    /// The guest's full cap (unlimited never fills; solo ver never had room).
    private var full: Bool { guest && (limit ?? 0) > 0 && (p.viewer.remaining ?? 1) == 0 }

    var body: some View {
        let tint = p.tint
        ZStack(alignment: .top) {
            Tint.feedTail(tint).ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    hero
                    status
                    if p.songs.isEmpty { empty } else { songs }
                }
                .padding(.bottom, bar == nil ? 56 : 170)
                .kFeedSurface(tint, span: 900)
            }
            .refreshable { await store.loadParty(p.id, force: true) }
            .ignoresSafeArea(.container, edges: .top)

            TopChrome {
                HStack(spacing: 8) {
                    if p.isHost {
                        IconChip44(systemName: "square.and.arrow.up", label: "Compartir \(p.name)") {
                            store.present(.partyShare(p.id))
                        }
                    }
                    // The host's Opciones, or a guest's (Salir de la fiesta).
                    IconChip44(systemName: "ellipsis", iconSize: 17, label: "Opciones de \(p.name)") {
                        store.present(.partyOptions(p.id))
                    }
                }
            }
        }
        .overlay(alignment: .bottom) { bottomBar(tail: Tint.feedTail(tint)) }
    }

    // MARK: Hero

    private var hero: some View {
        VStack(spacing: 10) {
            FanView(covers: p.songs.prefix(3).map(\.art), lead: 212, ghost: p.songs.isEmpty, plus: false,
                    label: "Portadas de \(p.name)")
            Text("colección de fiesta").monoLabel(10).padding(.top, 4)
            Text(p.name)
                .font(.kura.news(36))
                .foregroundStyle(KColor.text)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            VibeLine(text: PartyCopy.heroLine(limit))
            PartyCredits(contributors: p.contributors, host: p.host, isHost: p.isHost, songCount: p.songs.count)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 126)
        .padding(.horizontal, 24)
        .padding(.bottom, 26)
    }

    // MARK: Slots / blocked / solo ver

    @ViewBuilder private var status: some View {
        if guest && p.viewer.blocked {
            card {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Ya no puedes agregar canciones").font(.kura.ui(15, .semibold)).foregroundStyle(KColor.text)
                    Text(mine.isEmpty
                         ? "\(p.host.atOrSomeone) te quitó de los colaboradores. Puedes seguir viendo la colección."
                         : "\(p.host.atOrSomeone) te quitó de los colaboradores. Puedes seguir viendo la colección y quitar las que pusiste.")
                        .font(.kura.ui(14)).foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else if guest && limit == 0 {
            card {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Esta fiesta es para escuchar").font(.kura.ui(15, .semibold)).foregroundStyle(KColor.text)
                    Text("\(p.host.atOrSomeone) armó la playlist; aquí no se agregan canciones.")
                        .font(.kura.ui(14)).foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else if guest {
            card {
                HStack(spacing: 14) {
                    HStack(spacing: 6) {
                        ForEach(0..<slotCount, id: \.self) { i in
                            if let s = mine[safe: i] {
                                SongCover(url: s.artworkURL, palette: s.palette, size: 44, radius: 6, shadow: false)
                            } else {
                                EmptySongSlot()
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(slotsTitle).font(.kura.ui(15, .semibold)).foregroundStyle(KColor.text)
                        Text(slotsSub).monoLabel(10)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private var slotCount: Int {
        guard let limit else { return min(3, max(1, mine.count + 1)) }
        return min(limit, 5)
    }

    private var slotsTitle: String {
        let n = mine.count
        guard let limit else { return n == 0 ? "Tus canciones" : "Pusiste \(PartyCopy.songs(n))" }
        if n == 0 { return limit == 1 ? "Tu canción" : "Tus \(limit) canciones" }
        if n >= limit { return limit == 1 ? "Pusiste tu canción" : "Pusiste tus \(limit)" }
        return "Pusiste \(n) de \(limit)"
    }

    private var slotsSub: String {
        let n = mine.count
        guard limit != nil else { return n == 0 ? "Todavía no pones ninguna" : "Sin límite" }
        let r = p.viewer.remaining ?? 0
        if n == 0 { return "Todavía no pones ninguna" }
        if r == 0 { return "Quita una para cambiarla" }
        return "Te \(r == 1 ? "queda" : "quedan") \(r)"
    }

    private func card<C: View>(@ViewBuilder _ c: () -> C) -> some View {
        c()
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
            .padding(.horizontal, 12)
            .padding(.bottom, 22)
    }

    // MARK: Songs

    private var songs: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("las canciones").font(.kura.news(22)).foregroundStyle(KColor.text)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 14)
            VStack(spacing: 2) {
                ForEach(p.songs) { s in
                    // Your own song always opens its sheet (C4: blocked, you can still take it out).
                    let actionable = s.canRemove || s.canBlockAuthor || s.mine
                    PartySongRow(song: s, showMore: p.isHost && actionable,
                                 onTap: actionable ? { store.present(.partySong(partyID: p.id, titleID: s.titleID)) } : nil,
                                 onMore: { store.present(.partySong(partyID: p.id, titleID: s.titleID)) })
                }
            }
            .padding(.horizontal, 8)
        }
    }

    private var empty: some View {
        VStack(spacing: 10) {
            Text("la pista está vacía.").font(.kura.news(28)).foregroundStyle(KColor.text)
            Text(p.isHost
                 ? "Nadie ha puesto nada todavía. Comparte el link y que cada quien ponga \(PartyCopy.theirs(limit))."
                 : "Nadie ha puesto nada todavía. Alguien tiene que abrir la pista.")
                .font(.kura.ui(15))
                .lineSpacing(3)
                .foregroundStyle(KColor.text2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 290)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
    }

    // MARK: Bottom bar

    private enum Bar { case search, change, host }

    private var bar: Bar? {
        if p.isHost { return .host }
        if p.viewer.blocked || limit == 0 { return nil }
        return full ? .change : .search
    }

    @ViewBuilder private func bottomBar(tail: Color) -> some View {
        if let bar {
            VStack(spacing: 10) {
                switch bar {
                case .search:
                    SolidButton(title: mine.isEmpty ? "Buscar canción" : "Buscar otra canción",
                                systemImage: "magnifyingglass", height: 56, honey: true) {
                        store.push(.partySearch(p.id))
                    }
                case .change:
                    GlassButton(title: "Cambiar una canción", height: 56, fontSize: 16, fullWidth: true, flat: true) {
                        store.present(.partyCap(p.id))
                    }
                case .host:
                    HStack(spacing: 10) {
                        SolidButton(title: "Invitar a la fiesta", height: 56, honey: true) {
                            store.present(.partyShare(p.id))
                        }
                        IconChip44(systemName: "magnifyingglass", size: 56, iconSize: 18, label: "Buscar canción") {
                            store.push(.partySearch(p.id))
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 56)
            .padding(.bottom, 12)
            .background {
                LinearGradient(stops: [.init(color: tail.opacity(0), location: 0), .init(color: tail, location: 0.42)],
                               startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea(edges: .bottom)
                    .allowsHitTesting(false)
            }
        }
    }
}
