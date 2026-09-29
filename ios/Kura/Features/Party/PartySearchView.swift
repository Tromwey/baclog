import SwiftUI

/// "Buscar canción" (design `search-idle` · `search-loading` · `search-results` · `search-dup` ·
/// `search-error`): the field with Cancelar, "Te quedan 2 de 3", and the iTunes results from
/// `GET /parties/{id}/songs?q=` — Agregar, or "Ya está" with who put it. Adding the last one you
/// had opens "ya pusiste tus 3." (`AppStore.addPartySong`).
struct PartySearchView: View {
    @Environment(AppStore.self) private var store
    let partyID: String

    enum Phase: Equatable { case idle, loading, results, error(KuraAPIError) }

    @State private var query = ""
    @State private var phase: Phase = .idle
    @State private var hits: [PartySongHit] = []
    @State private var adding: Set<String> = []
    @FocusState private var focused: Bool

    private var party: Party? { store.party(partyID) }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").font(.system(size: 16, weight: .semibold)).foregroundStyle(KColor.text2)
                    TextField("", text: $query, prompt: Text("Canción o artista").foregroundStyle(KColor.text3))
                        .font(.kura.ui(16))
                        .foregroundStyle(KColor.text)
                        .tint(KColor.text)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .submitLabel(.search)
                        .focused($focused)
                        .onSubmit { Task { await run(query, debounce: false) } }
                    if !query.isEmpty {
                        Button { query = "" } label: {
                            Image(systemName: "xmark.circle.fill").font(.system(size: 15)).foregroundStyle(KColor.text3)
                                .frame(width: 28, height: 28)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Borrar texto")
                    }
                }
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: KRadius.field, style: .continuous))
                Button("Cancelar") { store.pop() }
                    .font(.kura.ui(15, .medium))
                    .foregroundStyle(KColor.text)
                    .padding(.horizontal, 10)
                    .frame(height: 44)
                    .buttonStyle(.plain)
            }
            .padding(.leading, 16)
            .padding(.trailing, 12)
            .padding(.vertical, 6)

            Text(remainLabel)
                .monoLabel(11, tracking: 0.1, color: KColor.text3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.top, 10)
                .padding(.bottom, 6)

            ScrollView(showsIndicators: false) {
                content.padding(.horizontal, 8).padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .padding(.top, 8)
        .background(KColor.bg.ignoresSafeArea())
        .onAppear {
            focused = true
            #if DEBUG
            // `-kuraPartyQuery caifanes|thriller|error`: the captures open with a search typed.
            if query.isEmpty, let q = UserDefaults.standard.string(forKey: "kuraPartyQuery") { query = q; focused = false }
            #endif
        }
        .task(id: query) { await run(query, debounce: true) }
        .task { await store.loadParty(partyID) }
        // A sheet over the search ("ya pusiste tus 3.") never sits on the keyboard.
        .onChange(of: store.sheet) { _, sh in if sh != nil { focused = false } }
        // The party changed (an add, a removal in the cap sheet): the "Ya está" marks follow.
        .onChange(of: party?.songs.map(\.titleID)) { _, _ in remark() }
    }

    // MARK: States

    @ViewBuilder private var content: some View {
        switch phase {
        case .idle:
            Text("Busca por nombre de la canción o del artista.")
                .font(.kura.ui(15))
                .foregroundStyle(KColor.text2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24)
                .padding(.top, 60)
        case .loading:
            PartyRowsSkeleton(trailing: 88)
        case .error(let e):
            let copy = errorCopy(e)
            VStack(alignment: .leading, spacing: 10) {
                Text(copy.title)
                    .font(.kura.news(30))
                    .foregroundStyle(KColor.text)
                    .accessibilityAddTraits(.isHeader)
                Text(copy.note)
                    .font(.kura.ui(15))
                    .lineSpacing(3)
                    .foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
                SolidButton(title: "Reintentar", honey: true) { Task { await run(query, debounce: false) } }
                    .frame(width: 170)
                    .padding(.top, 12)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 56)
        case .results:
            if hits.isEmpty {
                Text("Nada con «\(query.trimmingCharacters(in: .whitespaces))». Prueba con el artista o con menos palabras.")
                    .font(.kura.ui(15))
                    .foregroundStyle(KColor.text2)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 24)
                    .padding(.top, 60)
            } else {
                VStack(spacing: 2) {
                    ForEach(hits) { h in row(h) }
                }
            }
        }
    }

    private func row(_ h: PartySongHit) -> some View {
        let dup = h.inParty != nil
        return HStack(spacing: 12) {
            SongCover(url: h.artworkURL, palette: h.palette, size: 56, radius: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(h.title).font(.kura.newsItalic(18)).foregroundStyle(KColor.text).lineLimit(1)
                if !h.subtitle.isEmpty {
                    Text(h.subtitle).font(.kura.ui(13)).foregroundStyle(KColor.text2).lineLimit(1)
                }
                if let d = h.dupLine {
                    Text(d).font(.kura.ui(12, .medium)).foregroundStyle(KColor.text3).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                Task { await add(h) }
            } label: {
                ZStack {
                    Text(dup ? "Ya está" : "Agregar").opacity(adding.contains(h.id) ? 0 : 1)
                    if adding.contains(h.id) { ProgressView().tint(KColor.text) }
                }
                .font(.kura.ui(14, .medium))
                .foregroundStyle(dup ? KColor.text3 : KColor.text)
                .padding(.horizontal, 16)
                .frame(height: 44)
                .background(dup ? Color.white.opacity(0.05) : KColor.glassBg, in: Capsule())
                .contentShape(Capsule())
            }
            .kPress()
            .disabled(adding.contains(h.id))
            .accessibilityLabel(dup ? "Ya está: \(h.dupLine ?? "")" : "Agregar \(h.title)")
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
    }

    /// The search's error, by what failed. (`.notFound` never gets here: `run` leaves the page.)
    private func errorCopy(_ e: KuraAPIError) -> (title: String, note: String) {
        switch e {
        case .rateLimited:
            return ("un momento.", "Fueron muchas búsquedas seguidas. Espera unos segundos y vuelve a intentarlo.")
        // A 503 is iTunes down — or the server without parties at all (its reads said so too).
        case .unavailable where store.partiesUnavailable:
            return (PartyCopy.unavailableTitle, PartyCopy.unavailable)
        case .unavailable:
            return ("no pudimos buscar.", "El buscador de canciones no respondió. Vuelve a intentarlo en unos segundos; tus canciones siguen guardadas.")
        default:
            return ("no pudimos buscar.", "No hubo respuesta. Revisa tu conexión y vuelve a intentarlo; tus canciones siguen guardadas.")
        }
    }

    private var remainLabel: String {
        guard let p = party else { return " " }
        if p.isHost || p.perGuestLimit == nil { return "Pon las que quieras" }
        let limit = p.perGuestLimit ?? 0
        let r = p.viewer.remaining ?? 0
        if limit == 0 { return "Solo para escuchar" }
        if r == 0 { return limit == 1 ? "Ya pusiste tu canción" : "Ya pusiste tus \(limit)" }
        return "Te \(r == 1 ? "queda" : "quedan") \(r) de \(limit)"
    }

    // MARK: Actions

    private func run(_ q: String, debounce: Bool) async {
        let t = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { phase = .idle; hits = []; return }
        if debounce {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
        }
        phase = .loading
        switch await store.searchPartySongs(partyID, query: t) {
        case .results(let r):
            if Task.isCancelled { return }
            hits = r
            phase = .results
        case .failed(let e):
            if e == .cancelled || Task.isCancelled { return }
            if e == .notFound {
                // The party isn't there for you any more (deleted, you left, a block with the
                // host): out of the search, and the re-read takes the page too if it's gone.
                if store.path(store.tab).last == .partySearch(partyID) { store.pop() }
                await store.loadParty(partyID, force: true)
                return
            }
            phase = .error(e)
        }
    }

    /// "Ya está": say who put it (design toast); otherwise add.
    private func add(_ h: PartySongHit) async {
        if let inParty = h.inParty {
            store.showToast(ToastModel(text: inParty.mine ? "Ya la pusiste tú." : "Ya está, la puso \(inParty.addedBy.atOrSomeone)", kind: .info))
            return
        }
        adding.insert(h.id)
        defer { adding.remove(h.id) }
        if await store.addPartySong(partyID, h) == .added {
            remark()
        }
    }

    /// Re-derives each hit's "Ya está" from the party (after an add or a removal).
    private func remark() {
        guard let p = party else { return }
        let byID = Dictionary(p.songs.map { ($0.titleID, $0) }, uniquingKeysWith: { a, _ in a })
        hits = hits.map { h in
            var h = h
            h.inParty = byID[h.titleID].map { PartySongHit.InParty(mine: $0.mine, addedBy: $0.addedBy) }
            return h
        }
    }
}
