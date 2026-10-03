import SwiftUI

/// A party centred in Tus colecciones (founder, 2026-09-29: "debería mostrarse como las demás
/// colecciones, solo que en formato de lista"). What `CollectionBody` is to a collection, in a
/// party's shape: under the carousel's names,
///
///  - the meta, like a collection's: the line ("cada invitado pone 3 canciones"), then the
///    contributors' seals + "tuya · 8 canciones" / "de @eric · 8 canciones" (the card's mono meta
///    while the party loads);
///  - the page's actions as flat content buttons (never Liquid Glass, never honey — the carousel
///    has no accent action): the host's "Invitar" + "Buscar canción"; a guest's "Buscar canción",
///    or "Cambiar una canción" once their cap is full; nothing for a blocked guest or a "solo ver"
///    party (the same rules as `PartyView`'s bar);
///  - EVERY song as `PartyView`'s rows (1:1 cover, italic title, artist, seal + "Puso @x" /
///    "Pusiste tú"), no heading — like a collection's titles, straight under the meta. A row you
///    can act on (the host's, your own) opens its sheet; any other opens the party.
///
/// Loads ONLY the party in the centre (`loadParty`, cached): this view exists for the centred
/// entry alone (the carousel keys its body by id), after a short debounce so a flick across
/// several parties doesn't fire one read per card. The cache is re-read when `GET /parties` says
/// the count moved (someone added while you were away). Loading = the rows' skeleton; a failure =
/// a Reintentar strip; a 404 takes the card out of the carousel (`loadParty` → `partyGone`).
struct PartyCarouselBody: View {
    @Environment(AppStore.self) private var store
    let card: PartyCard

    /// Enough for a flick to pass through without reading every party it crosses.
    private static let debounce: Duration = .milliseconds(250)

    var body: some View {
        let party = store.party(card.id)
        VStack(spacing: 0) {
            meta(party)
            if let party {
                actions(party)
                if party.songs.isEmpty { empty(party) } else { rows(party) }
            } else if let e = store.loadError(.party(card.id)) {
                RetryStrip(error: e, text: e == .offline ? nil : "No se cargaron las canciones.") {
                    Task { await store.loadParty(card.id, force: true) }
                }
                .padding(.horizontal, 12)
            } else {
                PartyRowsSkeleton(trailing: 0)
                    .padding(.horizontal, 8)
                    .accessibilityElement()
                    .accessibilityLabel("Cargando las canciones")
            }
        }
        .task(id: "\(card.id)#\(card.songCount)") { await load() }
    }

    private func load() async {
        let cached = store.party(card.id)
        // Cached and still the count the list reports: nothing to read.
        if let cached, cached.songs.count == card.songCount { return }
        try? await Task.sleep(for: Self.debounce)
        guard !Task.isCancelled else { return }
        await store.loadParty(card.id, force: cached != nil)
    }

    // MARK: Meta

    private func meta(_ party: Party?) -> some View {
        VStack(spacing: 10) {
            VibeLine(text: PartyCopy.heroLine(party?.perGuestLimit ?? card.perGuestLimit))
            if let party {
                PartyCredits(contributors: party.contributors, host: party.host, isHost: party.isHost,
                             songCount: party.songs.count)
                    .padding(.top, 2)
            } else {
                Text(card.meta).monoLabel(11).multilineTextAlignment(.center).padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.top, 4)
        .padding(.bottom, 22)
    }

    // MARK: Actions (the same rules as PartyView's bar)

    private enum Action { case host, search, change }

    private func action(_ p: Party) -> Action? {
        if p.isHost { return .host }
        if p.viewer.blocked || p.perGuestLimit == 0 { return nil }
        let full = (p.perGuestLimit ?? 0) > 0 && (p.viewer.remaining ?? 1) == 0
        return full ? .change : .search
    }

    @ViewBuilder private func actions(_ p: Party) -> some View {
        if let a = action(p) {
            HStack(spacing: 8) {
                switch a {
                case .host:
                    GlassButton(title: "Invitar", systemImage: "person.badge.plus", flat: true) {
                        store.present(.partyShare(p.id))
                    }
                    search(p, title: "Buscar canción")
                case .search:
                    search(p, title: p.mySongs.isEmpty ? "Buscar canción" : "Buscar otra canción")
                case .change:
                    GlassButton(title: "Cambiar una canción", systemImage: "arrow.2.squarepath", flat: true) {
                        store.present(.partyCap(p.id))
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24)
            .padding(.bottom, 18)
        }
    }

    private func search(_ p: Party, title: String) -> some View {
        GlassButton(title: title, systemImage: "magnifyingglass", flat: true) {
            store.push(.partySearch(p.id))
        }
    }

    // MARK: Songs

    private func rows(_ p: Party) -> some View {
        LazyVStack(spacing: 2) {
            ForEach(p.songs) { s in
                // Your own song always opens its sheet (C4: blocked, you can still take it out).
                let actionable = s.canRemove || s.canBlockAuthor || s.mine
                PartySongRow(song: s, showMore: p.isHost && actionable,
                             onTap: {
                                 if actionable { store.present(.partySong(partyID: p.id, titleID: s.titleID)) }
                                 else { store.push(.party(p.id)) }
                             },
                             onMore: { store.present(.partySong(partyID: p.id, titleID: s.titleID)) })
                    .accessibilityAddTraits(.isButton)
                    .accessibilityHint(actionable ? "Abre las opciones de la canción." : "Abre la fiesta.")
            }
        }
        .padding(.horizontal, 8)
    }

    /// No songs yet: `PartyView`'s empty copy, in a collection's empty size (22, like 6b).
    private func empty(_ p: Party) -> some View {
        VStack(spacing: 10) {
            Text("la pista está vacía.")
                .font(.kura.news(22))
                .foregroundStyle(KColor.text2)
                .multilineTextAlignment(.center)
            Text(p.isHost
                 ? "Nadie ha agregado canciones todavía. Comparte el link y que cada quien agregue \(PartyCopy.theirs(p.perGuestLimit))."
                 : "Nadie ha agregado canciones todavía. Alguien tiene que abrir la pista.")
                .font(.kura.ui(15))
                .lineSpacing(3)
                .foregroundStyle(KColor.text2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 290)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 28)
        .padding(.top, 8)
    }
}

/// A party's pair of glass chips (44): the host's Compartir + Opciones, a guest's Opciones (Salir
/// de la fiesta). Its page's top right and Tus colecciones' header over the centred party — the
/// party's `CollectionChips`.
struct PartyChips: View {
    @Environment(AppStore.self) private var store
    let party: Party

    var body: some View {
        HStack(spacing: 8) {
            if party.isHost {
                IconChip44(systemName: "square.and.arrow.up", label: "Compartir \(party.name)") {
                    store.present(.partyShare(party.id))
                }
            }
            IconChip44(systemName: "ellipsis", iconSize: 17, label: "Opciones de \(party.name)") {
                store.present(.partyOptions(party.id))
            }
        }
    }
}
