import SwiftUI

/// Flujo 07 · Descubrir: 19a editorial (Todo) → 19d recientes → 19e escribiendo →
/// E5 buscando → 19f resultados (19h guardar en) / 19g sin resultados. Cine, Series y Música en
/// la pista abren su propia página (`DiscoverFormatPage`, "Descubrir Final – Formatos" 2a–2c).
struct DiscoverView: View {
    @Environment(AppStore.self) private var store
    @State private var searching = false
    @State private var query = ""
    @State private var submitted: String?
    @State private var loading = false
    @State private var tab: MediaFormat? = nil
    @FocusState private var focused: Bool

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            if searching {
                SearchMode(query: $query, submitted: $submitted, loading: $loading, focused: $focused,
                           cancel: cancelSearch, submit: submit)
            } else if let format = tab {
                // "A cada formato se entra por la pista de arriba" (Descubrir Final – Formatos 2a–2c).
                DiscoverFormatPage(format: format, tab: $tab) {
                    withAnimation(KMotion.short) { searching = true }
                    focused = true
                }
                .id(format)
            } else {
                editorial
            }
        }
        .onChange(of: searching) { _, s in store.dockHidden = s }
        .task { await store.loadDiscover() }
        .onAppear {
            if let q = store.debugDiscoverQuery {
                store.debugDiscoverQuery = nil
                searching = true
                store.dockHidden = true
                query = q.text
                if q.submit { submit(q.text) } else { focused = true }
            }
        }
    }

    private func cancelSearch() {
        focused = false
        withAnimation(KMotion.short) {
            searching = false
            query = ""
            submitted = nil
        }
        store.clearSearch()
    }

    /// E5 · `GET /search` + `GET /people/search`; the skeleton shows while it runs.
    private func submit(_ q: String) {
        let t = q.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        query = t
        focused = false
        store.noteSearch(t)
        loading = true
        submitted = t
        Task {
            await store.runSearch(t)
            if submitted == t { loading = false }
        }
    }

    // MARK: 19a

    private var editorial: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                TabTitleBar(title: "descubrir")
                    .padding(.bottom, 16)

                Button {
                    withAnimation(KMotion.short) { searching = true }
                    focused = true
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass").font(.system(size: 16, weight: .medium))
                        Text("Obras, personas, usuarios").font(.kura.ui(16))
                        Spacer()
                    }
                    .foregroundStyle(KColor.text2)
                    .padding(.horizontal, 16)
                    .frame(height: 48)
                    .background(KColor.glassBg, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)

                MonoSegmented(options: [(nil, "Todo"), (.film, "Cine"), (.series, "Series"), (.album, "Música")],
                              selection: $tab, height: 40)
                    .padding(.horizontal, 20)
                    .padding(.top, 14)

                VStack(alignment: .leading, spacing: 34) {
                    if store.discover == nil, !store.discoverLoading, let e = store.loadError(.discover) {
                        LoadErrorBlock(error: e) { Task { await store.loadDiscover(force: true) } }
                            .padding(.horizontal, 28)
                            .padding(.top, 20)
                    } else if let d = store.discover, d.recommended.isEmpty, d.trending.isEmpty, d.upcoming.isEmpty {
                        // A fresh account: nothing to recommend yet.
                        VStack(alignment: .leading, spacing: 10) {
                            Text("todavía no hay nada que recomendarte.").font(.kura.news(28)).foregroundStyle(KColor.text)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("Guarda y completa lo que te obsesiona; con eso aparece lo tuyo aquí. Mientras, busca arriba.")
                                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 28)
                        .padding(.top, 20)
                    } else {
                        recommended
                        trends
                        upcoming
                    }
                }
                .padding(.top, 26)
                .padding(.bottom, 150)
            }
        }
        .ignoresSafeArea(.container, edges: .top)
    }

    /// The editorial is Todo's page; the formats have their own (`DiscoverFormatPage`).
    private func inTab(_ t: Title) -> Bool { true }

    /// The subtitle under a recommendation: the creator, or the series length.
    private func recSubtitle(_ t: Title) -> String {
        if t.format == .series, let d = t.detail { return d }
        return t.lowerCreator ?? ""
    }

    // "recomendado para ti" — a tinted card with the reason.
    @ViewBuilder private var recommended: some View {
        let recs = store.discover?.recommended ?? []
        if store.discover == nil && store.discoverLoading {
            DiscoverSkeleton()
        } else if let r = recs.first(where: { inTab($0.title) }), let t = store.title(r.title.id) ?? Optional(r.title) {
            VStack(alignment: .leading, spacing: 14) {
                SectionTitle(text: "recomendado para ti").padding(.horizontal, 20)
                // Centered, and the name capped at 2 lines: a long album name ("… (Original Motion
                // Picture Soundtrack)") ran to 4 lines and left the cover stranded at the bottom.
                HStack(alignment: .center, spacing: 16) {
                    Button { store.push(.title(t.id)) } label: {
                        CoverView(title: t, height: 132).zoomSource(ZoomID.title(t.id))
                    }
                    .buttonStyle(.plain)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(r.reason).monoLabel(10).lineSpacing(3).lineLimit(2)
                        Text(t.name).font(.kura.newsItalic(24)).foregroundStyle(KColor.text)
                            .lineLimit(2).minimumScaleFactor(0.85)
                        Text(recSubtitle(t)).font(.kura.ui(14)).foregroundStyle(KColor.text2).lineLimit(1)
                        SaveChip(titleID: t.id, style: .pill)
                            .padding(.top, 4)
                    }
                    Spacer(minLength: 0)
                }
                .padding(20)
                .background(Tint.card(t.palette), in: RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                .padding(.horizontal, 12)
                .animation(KMotion.tint, value: t.id)
                // Cover + text + pill side by side in a card: past xxxLarge the pill truncates.
                .kFixedChrome()
            }
        }
    }

    // "tendencias · esta semana" — ranked rows.
    @ViewBuilder private var trends: some View {
        let list = (store.discover?.trending ?? []).map { store.title($0.title.id) ?? $0.title }.filter(inTab).prefix(5)
        if !list.isEmpty {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle(text: "tendencias", trailing: "esta semana").padding(.horizontal, 20)
            VStack(spacing: 0) {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, t in
                    HStack(spacing: 14) {
                        Text("\(i + 1)").font(.kura.mono(18)).foregroundStyle(KColor.text2).frame(width: 22, alignment: .leading)
                        CoverView(title: t, height: t.format == .album ? 51 : 64, radius: KRadius.coverS).zoomSource(ZoomID.title(t.id))
                            .frame(width: 48)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(t.name).font(.kura.newsItalic(17)).foregroundStyle(KColor.text).lineLimit(1)
                            Text(metaShort(t)).monoLabel().lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        SaveChip(titleID: t.id)
                    }
                    .padding(.horizontal, 20)
                    .frame(minHeight: 76)
                    .contentShape(Rectangle())
                    .kPressable(.row) { store.push(.title(t.id)) }
                }
            }
        }
        }
    }

    /// "En cines" · "14 h" · "T3 · sin fecha" · "2025" — what the rail says under a title.
    private func upcomingLabel(_ t: Title, releaseDate: Date?) -> String {
        if t.release != nil, store.isUnreleased(t) || t.upcomingSeason != nil {
            return store.releaseLabel(t, withSeason: true) ?? ""
        }
        if let d = releaseDate, d > store.now { return store.label(for: .day(KuraJSON.dayAtNoon(d))) }
        if t.watch.contains(where: \.isCinema) { return "En cines" }
        return t.year.map(String.init) ?? ""
    }

    // "nuevos y próximos lanzamientos"
    @ViewBuilder private var upcoming: some View {
        let list = (store.discover?.upcoming ?? []).map { u -> (Title, String) in
            let t = store.title(u.title.id) ?? u.title
            return (t, upcomingLabel(t, releaseDate: u.releaseDate))
        }.filter { inTab($0.0) }
        if !list.isEmpty {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle(text: "nuevos y próximos lanzamientos").padding(.horizontal, 20)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 12) {
                    ForEach(list, id: \.0.id) { t, when in
                        let w = t.format == .album ? 150.0 : 100.0
                        Button { store.push(.title(t.id)) } label: {
                            VStack(alignment: .leading, spacing: 7) {
                                CoverView(title: t, width: w).zoomSource(ZoomID.title(t.id))
                                Text(t.name).font(.kura.newsItalic(14)).foregroundStyle(KColor.text)
                                    .lineLimit(1).frame(width: w, alignment: .leading)
                                Text(when).monoLabel(10).lineLimit(1).frame(width: w, alignment: .leading)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
            }
            .scrollClipDisabled()
        }
        }
    }

    private func metaShort(_ t: Title) -> String {
        [t.format.metaLabel, t.year.map(String.init), t.format == .album ? t.creator : t.creatorShort]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

// MARK: - Search mode

private struct SearchMode: View {
    @Environment(AppStore.self) private var store
    @Binding var query: String
    @Binding var submitted: String?
    @Binding var loading: Bool
    var focused: FocusState<Bool>.Binding
    let cancel: () -> Void
    let submit: (String) -> Void
    @State private var filter = "Todo"

    private var typing: Bool { submitted == nil || submitted != query }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").font(.system(size: 16, weight: .medium)).foregroundStyle(KColor.text2)
                    TextField("", text: $query, prompt: Text("Obras, personas, usuarios").foregroundStyle(KColor.text2))
                        .font(.kura.ui(16))
                        .foregroundStyle(KColor.text)
                        .tint(KColor.accent)
                        .focused(focused)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .submitLabel(.search)
                        .onSubmit { submit(query) }
                    if !query.isEmpty {
                        Button { query = ""; submitted = nil; focused.wrappedValue = true } label: {
                            Image(systemName: "xmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(KColor.text2)
                                .frame(width: 28, height: 28)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Borrar búsqueda")
                    }
                }
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(submitted != nil && !typing ? KColor.glassBg : Color.white.opacity(0.12), in: Capsule())
                Button("Cancelar", action: cancel)
                    .font(.kura.ui(16, .medium))
                    .foregroundStyle(KColor.text)
            }
            .padding(.horizontal, 20)
            .padding(.top, KSize.chromeTop)

            if query.trimmingCharacters(in: .whitespaces).isEmpty {
                recents
            } else if typing {
                suggestions
            } else if loading {
                SearchSkeleton()
            } else {
                results
            }
        }
        .ignoresSafeArea(.container, edges: .top)
    }

    // MARK: 19d

    private var recents: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 26) {
                if !store.recentSearches.isEmpty {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("búsquedas recientes").font(.kura.news(24)).foregroundStyle(KColor.text)
                            Spacer()
                            Button { withAnimation(KMotion.short) { store.recentSearches = [] } } label: {
                                Text("Borrar").monoLabel(11, color: KColor.text3)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 20)
                        VStack(spacing: 0) {
                            ForEach(store.recentSearches, id: \.self) { q in
                                HStack(spacing: 14) {
                                    Image(systemName: "clock.arrow.circlepath").font(.system(size: 16)).foregroundStyle(KColor.text2)
                                    Text(q).font(.kura.ui(16)).foregroundStyle(KColor.text)
                                    Spacer()
                                    Button {
                                        withAnimation(KMotion.short) { store.recentSearches.removeAll { $0 == q } }
                                    } label: {
                                        Image(systemName: "xmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(KColor.text2)
                                            .frame(width: 44, height: 44)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Quitar \(q)")
                                }
                                .padding(.leading, 20).padding(.trailing, 8)
                                .frame(minHeight: 52)
                                .contentShape(Rectangle())
                                .kPressable(.row) { submit(q) }
                            }
                        }
                    }
                }
                let viewed = store.recentlyViewed.compactMap { store.title($0) }
                if !viewed.isEmpty {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("vistos hace poco").font(.kura.news(24)).foregroundStyle(KColor.text).padding(.horizontal, 20)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(alignment: .bottom, spacing: 12) {
                                ForEach(viewed) { t in
                                    Button { store.push(.title(t.id)) } label: {
                                        CoverView(title: t, height: 96, radius: KRadius.coverS).zoomSource(ZoomID.title(t.id))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.bottom, 12)
                        }
                        .scrollClipDisabled()
                    }
                }
            }
            .padding(.top, 24)
            .padding(.bottom, 340)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    // MARK: 19e

    private var suggestions: some View {
        let q = query.trimmingCharacters(in: .whitespaces)
        let titles = SearchIndex.titles(q, store).prefix(3)
        let creators = SearchIndex.creators(q, store).prefix(1)
        let users = SearchIndex.users(q, store).prefix(1)
        let queries = store.recentSearches.filter { fold($0).contains(fold(q)) && fold($0) != fold(q) }.prefix(2)
        return ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                ForEach(Array(titles.enumerated()), id: \.element.id) { i, t in
                    suggestionRow(onTap: { store.push(.title(t.id)) }) {
                        CoverView(title: t, width: t.format == .album ? 44 : 40, height: t.format == .album ? 44 : 60, radius: KRadius.coverS).zoomSource(ZoomID.title(t.id))
                            .frame(width: 44)
                    } text: {
                        Highlight(text: t.name, query: q, serif: true)
                        Text([t.format.metaLabel, t.year.map(String.init), t.format == .album ? t.creator : nil]
                            .compactMap { $0 }.joined(separator: " · ")).monoLabel().lineLimit(1)
                    }
                    if i == 0, let c = creators.first {
                        suggestionRow(onTap: { store.push(.creator(c.name)) }) {
                            InitialsSeal(initials: c.initials, size: 44)
                        } text: {
                            Highlight(text: c.name, query: q, serif: false)
                            Text("Persona · \(c.role) · \(c.works) obras").monoLabel().lineLimit(1)
                        }
                    }
                }
                if titles.isEmpty, let c = creators.first {
                    suggestionRow(onTap: { store.push(.creator(c.name)) }) {
                        InitialsSeal(initials: c.initials, size: 44)
                    } text: {
                        Highlight(text: c.name, query: q, serif: false)
                        Text("Persona · \(c.role) · \(c.works) obras").monoLabel().lineLimit(1)
                    }
                }
                ForEach(users) { p in
                    suggestionRow(onTap: { store.push(.person(p.id)) }) {
                        Seal(person: p, size: 44)
                    } text: {
                        Highlight(text: "@" + p.handle, query: q, serif: false)
                        Text("Usuario · \(p.common.count) en común").monoLabel().lineLimit(1)
                    }
                }
                ForEach(Array(queries), id: \.self) { s in
                    HStack(spacing: 14) {
                        Image(systemName: "magnifyingglass").font(.system(size: 16)).foregroundStyle(KColor.text2).frame(width: 44)
                        Highlight(text: s, query: q, serif: false)
                        Spacer()
                    }
                    .padding(.horizontal, 20)
                    .frame(minHeight: 52)
                    .contentShape(Rectangle())
                    .kPressable(.row) { submit(s) }
                }
                if titles.isEmpty && creators.isEmpty && users.isEmpty {
                    HStack(spacing: 14) {
                        Image(systemName: "magnifyingglass").font(.system(size: 16)).foregroundStyle(KColor.text2).frame(width: 44)
                        Text("Buscar «\(q)»").font(.kura.ui(16)).foregroundStyle(KColor.text)
                        Spacer()
                    }
                    .padding(.horizontal, 20)
                    .frame(minHeight: 52)
                    .contentShape(Rectangle())
                    .kPressable(.row) { submit(q) }
                }
            }
            .padding(.top, 14)
            .padding(.bottom, 340)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func suggestionRow<L: View, T: View>(onTap: @escaping () -> Void,
                                                @ViewBuilder leading: () -> L,
                                                @ViewBuilder text: () -> T) -> some View {
        HStack(spacing: 14) {
            leading()
            VStack(alignment: .leading, spacing: 4) { text() }
            Spacer(minLength: 8)
            Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(KColor.text3)
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 64)
        .contentShape(Rectangle())
        .kPressable(.row, action: onTap)
    }

    // MARK: 19f / 19g

    @ViewBuilder private var results: some View {
        let q = submitted ?? query
        let titles = store.searchResults.map { store.title($0.id) ?? $0.title }
        let creators = SearchIndex.creators(q, store)
        let users = store.searchPeople
        if let e = store.searchError, e == .unavailable || e == .offline {
            VStack(alignment: .leading, spacing: 16) {
                Text(e == .offline ? "sin conexión." : "el catálogo no responde.").font(.kura.news(32)).foregroundStyle(KColor.text)
                Text(e == .offline ? "Revisa tu red y vuelve a buscar." : "Inténtalo de nuevo en un momento.")
                    .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                GlassButton(title: "Reintentar", systemImage: "arrow.clockwise", flat: true) { submit(q) }
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 28)
            .padding(.top, 120)
        } else if titles.isEmpty && creators.isEmpty && users.isEmpty {
            NoResults(query: q) { fix in
                query = fix
                submit(fix)
            }
        } else {
            VStack(spacing: 0) {
                ChipRow(options: ["Todo", "Cine", "Series", "Música", "Personas", "Usuarios"].map { ($0, $0) }, selection: $filter)
                    .padding(.top, 14)
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 28) {
                        if ["Todo", "Personas"].contains(filter), let c = creators.first {
                            Button { store.push(.creator(c.name)) } label: {
                                HStack(spacing: 16) {
                                    InitialsSeal(initials: c.initials, size: 64)
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(c.name.lowercased()).font(.kura.news(24)).foregroundStyle(KColor.text)
                                        Text("\(c.role) · \(c.works) obras").monoLabel().lineLimit(1)
                                    }
                                    Spacer()
                                }
                                .padding(18)
                                .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 12)
                        }
                        let shown = titles.filter { t in
                            switch filter {
                            case "Cine": return t.format == .film
                            case "Series": return t.format == .series
                            case "Música": return t.format == .album
                            case "Todo": return true
                            default: return false
                            }
                        }
                        if !shown.isEmpty {
                            VStack(alignment: .leading, spacing: 14) {
                                SectionTitle(text: "obras", trailing: "\(shown.count)").padding(.horizontal, 20)
                                VStack(spacing: 0) {
                                    ForEach(shown) { t in
                                        HStack(spacing: 14) {
                                            CoverView(title: t, width: t.format == .album ? 48 : 44, height: t.format == .album ? 48 : 66, radius: KRadius.coverS).zoomSource(ZoomID.title(t.id))
                                                .frame(width: 48)
                                            VStack(alignment: .leading, spacing: 5) {
                                                Text(t.name).font(.kura.newsItalic(18)).foregroundStyle(KColor.text).lineLimit(1)
                                                Text([t.format.metaLabel, t.year.map(String.init), t.creatorShort]
                                                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).monoLabel().lineLimit(1)
                                            }
                                            Spacer(minLength: 8)
                                            SaveChip(titleID: t.id)
                                        }
                                        .padding(.horizontal, 20)
                                        .frame(minHeight: 84)
                                        .contentShape(Rectangle())
                                        .kPressable(.row) { store.push(.title(t.id)) }
                                    }
                                }
                            }
                        }
                        if ["Todo", "Usuarios"].contains(filter), !users.isEmpty {
                            VStack(alignment: .leading, spacing: 14) {
                                SectionTitle(text: "usuarios").padding(.horizontal, 20)
                                ForEach(Array(users.enumerated()), id: \.element.id) { i, p in
                                    HStack(spacing: 14) {
                                        Seal(person: p, size: 44)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text("@\(p.handle)").font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                                            Text("\(p.common.count) en común").monoLabel().lineLimit(1)
                                        }
                                        Spacer()
                                        // Honey once per screen: the first user only.
                                        FollowButton(state: FollowState(following: store.isFollowing(p.id)), honey: i == 0) { store.followFromProfile(p.id) }
                                    }
                                    .padding(.horizontal, 20)
                                    .contentShape(Rectangle())
                                    .kPressable(.row) { store.push(.person(p.id)) }
                                }
                            }
                        }
                    }
                    .padding(.top, 22)
                    .padding(.bottom, 150)
                }
            }
        }
    }

    private func fold(_ s: String) -> String { s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil) }
}

/// 19a while `GET /discover` runs: the shape of the recommendation card.
private struct DiscoverSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Skeleton(radius: 6).frame(width: 180, height: 22).padding(.horizontal, 20)
            HStack(alignment: .bottom, spacing: 16) {
                Skeleton().frame(width: 88, height: 132)
                VStack(alignment: .leading, spacing: 10) {
                    Skeleton(radius: 5).frame(width: 140, height: 10)
                    Skeleton(radius: 6).frame(width: 170, height: 22)
                    Skeleton(radius: 5).frame(width: 110, height: 12)
                }
                Spacer(minLength: 0)
            }
            .padding(20)
            .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
            .padding(.horizontal, 12)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando")
    }
}

/// E5 · Buscando — skeletons with the shape of the results.
private struct SearchSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                ForEach(["Todo", "Cine", "Series", "Música"], id: \.self) { l in
                    Text(l).monoLabel(11, tracking: 0.1, color: l == "Todo" ? KColor.text : KColor.text2)
                        .padding(.horizontal, 16).frame(height: 40)
                        .background(l == "Todo" ? KColor.glassSelected : KColor.glassBg, in: Capsule())
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)
            HStack(spacing: 16) {
                Skeleton(radius: 999).frame(width: 64, height: 64)
                VStack(alignment: .leading, spacing: 10) {
                    Skeleton(radius: 6).frame(width: 150, height: 18)
                    Skeleton(radius: 5).frame(width: 100, height: 10)
                }
                Spacer()
            }
            .padding(18)
            .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
            .padding(.horizontal, 12)
            .padding(.top, 20)
            VStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { _ in
                    HStack(spacing: 14) {
                        RoundedRectangle(cornerRadius: 8).fill(KColor.s1).frame(width: 44, height: 66)
                        VStack(alignment: .leading, spacing: 10) {
                            RoundedRectangle(cornerRadius: 6).fill(KColor.s1).frame(width: 200, height: 16)
                            RoundedRectangle(cornerRadius: 5).fill(KColor.s1).frame(width: 130, height: 10)
                        }
                        Spacer()
                    }
                    .frame(minHeight: 84)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 26)
            Spacer()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Buscando")
    }
}

/// 19g · sin resultados, with the correction as a button.
private struct NoResults: View {
    @Environment(AppStore.self) private var store
    let query: String
    let fix: (String) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("nada con “\(query)”.").font(.kura.news(32)).foregroundStyle(KColor.text)
            Text("Revisa cómo se escribe o busca por persona o año.")
                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
            if let c = SearchIndex.correction(for: query, store) {
                GlassButton(title: "Buscar “\(c)”", systemImage: "magnifyingglass", flat: true) { fix(c) }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 28)
        .padding(.top, 120)
    }
}

/// Text with the query highlighted: rest in text2, match in text (heavier).
struct Highlight: View {
    let text: String
    let query: String
    var serif: Bool
    var body: some View {
        let base: Font = serif ? .kura.newsItalic(18) : .kura.ui(16)
        let strong: Font = serif ? .kura.newsMediumItalic(18) : .kura.ui(16, .semibold)
        if let r = text.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) {
            (Text(text[..<r.lowerBound]).font(base).foregroundColor(KColor.text2)
             + Text(text[r]).font(strong).foregroundColor(KColor.text)
             + Text(text[r.upperBound...]).font(base).foregroundColor(KColor.text2))
                .lineLimit(1)
        } else {
            Text(text).font(base).foregroundColor(KColor.text).lineLimit(1)
        }
    }
}

/// Seal for someone without an obsession tone (s2 + text).
struct InitialsSeal: View {
    let initials: String
    var size: CGFloat
    var body: some View {
        Text(initials)
            .font(.kura.newsMediumItalic(size * 0.42, fixed: true))
            .tracking(-size * 0.42 * 0.035)
            .foregroundStyle(KColor.text)
            .frame(width: size, height: size)
            .background(KColor.s2, in: Circle())
            .accessibilityHidden(true)
    }
}

/// Local index over what the app already knows (typing suggestions, creators,
/// the "did you mean" correction). The real search is `store.runSearch`.
enum SearchIndex {
    static func fold(_ s: String) -> String { s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil) }

    @MainActor static func titles(_ q: String, _ store: AppStore) -> [Title] {
        let f = fold(q.trimmingCharacters(in: .whitespaces))
        guard !f.isEmpty else { return [] }
        return store.catalogOrder.compactMap { store.title($0) }
            .filter { fold($0.name).contains(f) || fold($0.creator ?? "").contains(f) }
    }

    @MainActor static func creators(_ q: String, _ store: AppStore) -> [Creator] {
        let f = fold(q.trimmingCharacters(in: .whitespaces))
        guard !f.isEmpty else { return [] }
        let names = Set(store.catalogOrder.compactMap { store.title($0)?.creator })
        return names.filter { fold($0).contains(f) }.sorted().map { store.creator($0) }
    }

    @MainActor static func users(_ q: String, _ store: AppStore) -> [Person] {
        let f = fold(q.trimmingCharacters(in: .whitespaces)).replacingOccurrences(of: "@", with: "")
        guard !f.isEmpty else { return [] }
        return store.people.values.filter { $0.id != store.me.id && (fold($0.handle).contains(f) || fold($0.name).contains(f)) }
            .sorted { $0.common.count > $1.common.count }
    }

    /// Closest catalog word within two edits ("mononokee" → "mononoke").
    @MainActor static func correction(for q: String, _ store: AppStore) -> String? {
        let f = fold(q)
        var words = Set<String>()
        for t in store.catalogOrder.compactMap({ store.title($0) }) {
            for w in (t.name + " " + (t.creator ?? "")).split(separator: " ") { words.insert(fold(String(w)).trimmingCharacters(in: .punctuationCharacters)) }
        }
        let best = words.filter { $0.count > 2 }.map { ($0, distance($0, f)) }.min { $0.1 < $1.1 }
        guard let best, best.1 > 0, best.1 <= 2 else { return nil }
        return best.0
    }

    static func distance(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        var prev = Array(0...b.count)
        for i in 1...max(a.count, 1) where !a.isEmpty {
            var cur = [i] + Array(repeating: 0, count: b.count)
            for j in 1...max(b.count, 1) where !b.isEmpty {
                cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1))
            }
            prev = cur
        }
        return a.isEmpty ? b.count : prev[b.count]
    }
}

// MARK: - Descubrir por formato (2a–2c)

/// Claude Design "Descubrir Final – Formatos": one page per format, entered from the track.
///  - 2a Cine · tiempo y humor: three runtime windows + an OPTIONAL humor (tap it again to
///    clear it); both filter the 2:3 grid, and a picked humor tints the page.
///  - 2b Series · maratón: finished miniseries under two lenses; the pill is the whole series'
///    hours, the meta its network and episodes; Guardar sits on the poster.
///  - 2c Música · por momento: moments read from the chart's genres; the picked one tints the
///    page. Albums 1:1, then the releases still ahead in your own collections.
/// Every page closes with Colecciones Kuradas. Twin of the web's `format-pages.tsx`; the data
/// and the mood vocabularies come from `GET /discover/formats/{format}`.
private struct DiscoverFormatPage: View {
    @Environment(AppStore.self) private var store
    let format: MediaFormat
    @Binding var tab: MediaFormat?
    let openSearch: () -> Void
    @State private var time = 1
    @State private var lens = 1
    @State private var mood: Int?

    private var timeParam: Int? { format == .film ? time : nil }
    private var payload: DiscoverFormatPayload? { store.discoverFormats[AppStore.formatKey(format, time: timeParam)] }
    private func fresh(_ t: Title) -> Title { store.title(t.id) ?? t }

    /// Cine: the humor's items (all without one). Series: what fits the lens. Música: the moment's.
    private var shown: [DiscoverFormatPayload.Item] {
        guard let p = payload else { return [] }
        switch format {
        case .film:
            return Array(p.titles.filter { mood == nil || $0.moods.contains(mood!) }.prefix(12))
        case .series:
            let limit: Int = p.lenses.indices.contains(lens) ? (p.lenses[lens].maxMinutes ?? Int.max) : Int.max
            return Array(p.titles.filter { ($0.minutes ?? Int.max) <= limit }.prefix(12))
        case .album:
            return Array(p.titles.filter { $0.moods.contains(musicMood) }.prefix(8))
        }
    }

    /// Música opens on the first moment the chart can fill.
    private var musicMood: Int {
        if let mood { return mood }
        let p = payload
        return p?.moods.indices.first { i in p?.titles.contains { $0.moods.contains(i) } == true } ?? 0
    }

    private var hexes: [String] {
        let moods = payload?.moods ?? []
        switch format {
        case .film:
            if let m = mood, moods.indices.contains(m) { return moods[m].palette }
            return shown.first.map { fresh($0.title).palette } ?? []
        case .series:
            return shown.first.map { fresh($0.title).palette } ?? []
        case .album:
            return moods.indices.contains(musicMood) ? moods[musicMood].palette : []
        }
    }

    var body: some View {
        let tint = hexes
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    MonoSegmented(options: [(nil, "Todo"), (.film, "Cine"), (.series, "Series"), (.album, "Música")],
                                  selection: $tab, height: 40)
                    Button(action: openSearch) {
                        Image(systemName: "magnifyingglass").font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(KColor.text)
                            .frame(width: 50, height: 50)
                            .background(KColor.glassBg, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Buscar")
                }
                .padding(.horizontal, 20)
                .padding(.top, KSize.chromeTop - 8)

                switch format {
                case .film: cine
                case .series: series
                case .album: music
                }

                kuradas
                if format == .album { soonDiscs }
            }
            .padding(.bottom, 150)
            .kFeedSurface(tint, span: 760)
            .animation(KMotion.tint, value: tint)
        }
        .ignoresSafeArea(.container, edges: .top)
        .background(Tint.feedTail(tint).ignoresSafeArea())
        .kFeedDockBand(tint)
        .task(id: AppStore.formatKey(format, time: timeParam)) {
            await store.loadDiscoverFormat(format, time: timeParam)
        }
    }

    // MARK: 2a

    @ViewBuilder private var cine: some View {
        Text("¿cuánto tiempo tienes?").font(.kura.news(34)).foregroundStyle(KColor.text)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 20).padding(.top, 32).padding(.bottom, 16)
        FlowChoices(choices: payload?.times ?? Self.fallbackTimes, selection: $time)
            .padding(.horizontal, 20)
        Text("¿y de qué humor?").font(.kura.news(22)).foregroundStyle(KColor.text)
            .padding(.horizontal, 20).padding(.top, 30).padding(.bottom, 14)
        MoodRow(moods: payload?.moods ?? [], selection: mood) { i in
            withAnimation(KMotion.short) { mood = mood == i ? nil : i }
        }
        grid(empty: payload?.titles.isEmpty == true
             ? "No pudimos traer películas ahora. Prueba en un rato."
             : "Nada con ese humor en ese tiempo. Prueba otra duración o quita el humor.") { item in
            let t = fresh(item.title)
            tile(t, pill: item.runtimeMinutes.map { "\($0) min" }) {
                if item.inCinemas {
                    Image(systemName: "ticket.fill").font(.system(size: 9))
                    Text("En cines").monoLabel(10)
                } else {
                    Text([t.year.map(String.init), item.genre].compactMap { $0 }.joined(separator: " · "))
                        .monoLabel(10).lineLimit(1)
                }
            }
        }
    }

    private static let fallbackTimes: [DiscoverFormatPayload.Choice] = [
        .init(label: "una hora y algo", sub: "menos de 100 min"),
        .init(label: "hasta dos horas", sub: "100 a 130 min"),
        .init(label: "sin prisa", sub: "más de 130 min"),
    ]

    // MARK: 2b

    @ViewBuilder private var series: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("para maratonear").font(.kura.news(34)).foregroundStyle(KColor.text)
            Text("Miniseries completas, sin temporadas por venir.").font(.kura.ui(15)).foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 20).padding(.top, 32).padding(.bottom, 18)
        FlowChoices(choices: payload?.lenses ?? [], selection: $lens)
            .padding(.horizontal, 20)
        grid(empty: payload?.titles.isEmpty == true
             ? "No pudimos traer series ahora. Prueba en un rato."
             : "Nada tan corto por ahora. Prueba con un fin de semana.") { item in
            let t = fresh(item.title)
            tile(t, pill: item.minutes.map(Self.hours), save: true) {
                Image(systemName: "play.fill").font(.system(size: 9))
                Text([item.network, item.episodes.map { "\($0) ep" }].compactMap { $0 }.joined(separator: " · "))
                    .monoLabel(10).lineLimit(1)
            }
        }
    }

    /// "3,9 h" / "12 h" — one decimal, Spanish comma (twin of the web's `hoursLabel`).
    private static func hours(_ minutes: Int) -> String {
        let h = (Double(minutes) / 60 * 10).rounded() / 10
        let s = h == h.rounded() ? String(Int(h)) : String(format: "%.1f", h).replacingOccurrences(of: ".", with: ",")
        return "\(s) h"
    }

    // MARK: 2c

    @ViewBuilder private var music: some View {
        Text("¿para qué momento?").font(.kura.news(34)).foregroundStyle(KColor.text)
            .padding(.horizontal, 20).padding(.top, 32).padding(.bottom, 18)
        MoodRow(moods: payload?.moods ?? [], selection: payload == nil ? nil : musicMood) { i in
            withAnimation(KMotion.short) { mood = i }
        }
        grid(empty: payload?.titles.isEmpty == true
             ? "No pudimos traer discos ahora. Prueba en un rato."
             : "Nada para ese momento en lo que más suena hoy. Prueba otro.") { item in
            let t = fresh(item.title)
            tile(t, pill: nil) {
                Text([t.creator, t.year.map(String.init)].compactMap { $0 }.joined(separator: " · "))
                    .monoLabel(10).lineLimit(1)
            }
        }
    }

    /// "próximos discos · en tus colecciones" — the library's albums still ahead (`GET /discover`).
    @ViewBuilder private var soonDiscs: some View {
        let list = (store.discover?.upcoming ?? []).map { (fresh($0.title), $0.releaseDate) }.filter { $0.0.format == .album }
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                SectionTitle(text: "próximos discos", trailing: "en tus colecciones", size: 22).padding(.horizontal, 20)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(list, id: \.0.id) { t, date in
                            Button { store.push(.title(t.id)) } label: {
                                VStack(alignment: .leading, spacing: 7) {
                                    CoverView(title: t, width: 150).zoomSource(ZoomID.title(t.id))
                                    Text(t.name).font(.kura.newsItalic(15)).foregroundStyle(KColor.text)
                                        .lineLimit(1).frame(width: 150, alignment: .leading)
                                    if let d = date {
                                        Text(store.label(for: .day(KuraJSON.dayAtNoon(d)))).monoLabel(10).lineLimit(1)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
                }
                .scrollClipDisabled()
            }
            .padding(.top, 40)
        }
    }

    // MARK: pieces

    @ViewBuilder
    private func grid<Cell: View>(empty: String, @ViewBuilder cell: @escaping (DiscoverFormatPayload.Item) -> Cell) -> some View {
        let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        if payload == nil {
            LazyVGrid(columns: columns, spacing: 24) {
                ForEach(0..<4, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 14, style: .continuous).fill(KColor.glassBg)
                        .aspectRatio(format == .album ? 1 : 2.0 / 3.0, contentMode: .fit)
                }
            }
            .padding(.horizontal, 20).padding(.top, 26)
            .accessibilityHidden(true)
        } else if shown.isEmpty {
            Text(empty).font(.kura.ui(15)).foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 20).padding(.top, 26)
        } else {
            LazyVGrid(columns: columns, spacing: 24) {
                ForEach(shown) { item in cell(item) }
            }
            .padding(.horizontal, 20).padding(.top, 26)
        }
    }

    private func tile<Meta: View>(_ t: Title, pill: String?, save: Bool = false,
                                  @ViewBuilder meta: () -> Meta) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            CoverView(title: t, radius: 14, fluid: true)
                .zoomSource(ZoomID.title(t.id))
                .overlay(alignment: .bottomLeading) {
                    if let pill {
                        Text(pill).font(.kura.mono(11)).tracking(0.44).foregroundStyle(KColor.text)
                            .padding(.horizontal, 10).frame(height: 26)
                            .background(KColor.glassArt, in: Capsule())
                            .padding(8)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    if save { SaveChip(titleID: t.id).padding(6) }
                }
            Text(t.name).font(.kura.newsItalic(18)).foregroundStyle(KColor.text).lineLimit(1)
            HStack(spacing: 6) { meta() }.foregroundStyle(KColor.text2)
        }
        .contentShape(Rectangle())
        .kPressable { store.push(.title(t.id)) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    // MARK: Colecciones Kuradas

    @ViewBuilder private var kuradas: some View {
        let cards = payload?.kuradas ?? []
        if !cards.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Colecciones Kuradas").font(.kura.news(22)).foregroundStyle(KColor.text)
                    Text("Hechas a mano por nuestros expertos").font(.kura.ui(15)).foregroundStyle(KColor.text2)
                }
                .padding(.horizontal, 20)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(cards) { k in kuradaCard(k) }
                    }
                    .scrollTargetLayout()
                    .padding(.horizontal, 12)
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollClipDisabled()
            }
            .padding(.top, 44)
        }
    }

    private func kuradaCard(_ k: DiscoverFormatPayload.Kurada) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            FanView(covers: k.covers.map(fresh), lead: format == .album ? 118 : 140, label: "Portadas de \(k.name)")
                .frame(maxWidth: .infinity, minHeight: 150)
            Text(k.name).font(.kura.news(24)).foregroundStyle(KColor.text).lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Text("k").font(.kura.newsMediumItalic(15)).foregroundStyle(KColor.onAccent)
                    .frame(width: 26, height: 26).background(KColor.accent, in: Circle())
                    .accessibilityHidden(true)
                Text("\(k.curator) · \(format.label.lowercased())").font(.kura.ui(13)).foregroundStyle(KColor.text2).lineLimit(1)
                Spacer(minLength: 4)
                Text(k.count == 1 ? "1 título" : "\(k.count) títulos").monoLabel(10)
            }
        }
        .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 20)
        .frame(width: 300, alignment: .leading)
        .background(Tint.card(k.palette), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .kPressable { store.push(.publicCollection(handle: k.handle, id: k.id)) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

/// "¿cuánto tiempo tienes?" · "una tarde" — 52 pt two-line choice pills that wrap.
private struct FlowChoices: View {
    let choices: [DiscoverFormatPayload.Choice]
    @Binding var selection: Int

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { pills }
            VStack(alignment: .leading, spacing: 8) { pills }
        }
    }

    @ViewBuilder private var pills: some View {
        ForEach(Array(choices.enumerated()), id: \.offset) { i, c in
            let on = i == selection
            Button { withAnimation(KMotion.short) { selection = i } } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(c.label).font(.kura.ui(15, .semibold)).foregroundStyle(KColor.text)
                    Text(c.sub).monoLabel(10, tracking: 0.06)
                }
                .padding(.horizontal, 18).padding(.vertical, 6)
                .frame(minHeight: 52)
                .background(on ? KColor.glassSelected : KColor.glassBg, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(on ? .isSelected : [])
        }
    }
}

/// The humor / moment swatches: a 64 pt disc in the mood's two tones, ringed when picked.
private struct MoodRow: View {
    let moods: [DiscoverFormatPayload.Mood]
    let selection: Int?
    let pick: (Int) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 10) {
                ForEach(Array(moods.enumerated()), id: \.offset) { i, m in
                    let on = selection == i
                    Button { pick(i) } label: {
                        VStack(spacing: 9) {
                            Circle()
                                .fill(LinearGradient(colors: m.palette.map { Color(hex: $0) },
                                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                                .frame(width: 64, height: 64)
                                .padding(5)
                                .overlay { if on { Circle().stroke(KColor.text, lineWidth: 2) } }
                            Text(m.label).font(.kura.ui(13)).foregroundStyle(on ? KColor.text : KColor.text2)
                                .multilineTextAlignment(.center).lineLimit(3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(width: 76)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.horizontal, 15)
        }
        .scrollClipDisabled()
    }
}

