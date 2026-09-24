import SwiftUI

/// Flujo 07 · Descubrir: 19a editorial → 19d recientes → 19e escribiendo →
/// E5 buscando → 19f resultados (19h guardar en) / 19g sin resultados.
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
            } else {
                editorial
            }
        }
        .onChange(of: searching) { _, s in store.dockHidden = s }
        .onAppear {
            if let q = store.debugDiscoverQuery {
                store.debugDiscoverQuery = nil
                searching = true
                store.dockHidden = true
                query = q.text
                if q.submit { submitted = q.text } else { focused = true }
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
    }

    private func submit(_ q: String) {
        let t = q.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        query = t
        focused = false
        store.noteSearch(t)
        loading = true
        submitted = t
        Task {
            try? await Task.sleep(for: .milliseconds(600))
            loading = false
        }
    }

    // MARK: 19a

    private var editorial: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                Text("descubrir")
                    .font(.kura.screenTitle)
                    .foregroundStyle(KColor.text)
                    .padding(.top, KSize.chromeTop)
                    .padding(.bottom, 16)
                    .padding(.horizontal, 20)
                    .accessibilityAddTraits(.isHeader)

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
                    recommended
                    trends
                    upcoming
                }
                .padding(.top, 26)
                .padding(.bottom, 150)
            }
        }
        .ignoresSafeArea(.container, edges: .top)
    }

    private func inTab(_ t: Title) -> Bool { tab == nil || t.format == tab }

    // "recomendado para ti" — a tinted card with the reason.
    @ViewBuilder private var recommended: some View {
        let recs: [(String, String, String)] = [
            ("ma", "Porque te obsesiona Mala", "devendra banhart"),
            ("pearl", "Porque guardaste Spider-Man 3", "ti west"),
            ("severance", "Porque guardaste The Odyssey", "2 temporadas"),
            ("mononoke", "Porque te obsesiona El viaje de Chihiro", "hayao miyazaki")
        ]
        if let r = recs.first(where: { store.title($0.0).map(inTab) ?? false }), let t = store.title(r.0) {
            VStack(alignment: .leading, spacing: 14) {
                SectionTitle(text: "recomendado para ti").padding(.horizontal, 20)
                HStack(alignment: .bottom, spacing: 16) {
                    Button { store.push(.title(t.id)) } label: {
                        CoverView(title: t, height: 132)
                    }
                    .buttonStyle(.plain)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(r.1).monoLabel(10).lineSpacing(3)
                        Text(t.name).font(.kura.newsItalic(24)).foregroundStyle(KColor.text)
                        Text(r.2).font(.kura.ui(14)).foregroundStyle(KColor.text2)
                        GlassButton(title: store.isSaved(t.id) ? "Guardado" : "Guardar",
                                    systemImage: store.isSaved(t.id) ? "checkmark" : "plus") {
                            store.present(.saveTo(t.id))
                        }
                        .padding(.top, 4)
                    }
                    Spacer(minLength: 0)
                }
                .padding(20)
                .background(Tint.card(t.palette), in: RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                .padding(.horizontal, 12)
                .animation(.easeInOut(duration: 0.3), value: t.id)
            }
        }
    }

    // "tendencias · esta semana" — ranked rows.
    private var trends: some View {
        let ids = ["odyssey", "severance", "pearl", "chihiro", "mindofmine", "spiderman3", "ma", "mala", "eduardo"]
        let list = ids.compactMap { store.title($0) }.filter(inTab).prefix(5)
        return VStack(alignment: .leading, spacing: 14) {
            SectionTitle(text: "tendencias", trailing: "esta semana").padding(.horizontal, 20)
            VStack(spacing: 0) {
                ForEach(Array(list.enumerated()), id: \.element.id) { i, t in
                    HStack(spacing: 14) {
                        Text("\(i + 1)").font(.kura.mono(18)).foregroundStyle(KColor.text2).frame(width: 22, alignment: .leading)
                        CoverView(title: t, height: t.format == .album ? 51 : 64, radius: KRadius.coverS)
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
                    .onTapGesture { store.push(.title(t.id)) }
                }
            }
        }
    }

    // "nuevos y próximos lanzamientos"
    private var upcoming: some View {
        let items: [(String, String)] = [("odyssey", "En cines"), ("showgirl", "14 h"), ("ycse", "16 oct"),
                                         ("doomsday", "18 dic"), ("severance", "T3 · sin fecha"), ("nube", "2025")]
        let list = items.compactMap { id, when in store.title(id).map { ($0, when) } }.filter { inTab($0.0) }
        return VStack(alignment: .leading, spacing: 14) {
            SectionTitle(text: "nuevos y próximos lanzamientos").padding(.horizontal, 20)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 12) {
                    ForEach(list, id: \.0.id) { t, when in
                        let w = t.format == .album ? 150.0 : 100.0
                        Button { store.push(.title(t.id)) } label: {
                            VStack(alignment: .leading, spacing: 7) {
                                CoverView(title: t, width: w)
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

    private func metaShort(_ t: Title) -> String {
        [t.format.metaLabel, t.year.map(String.init), t.format == .album ? t.creator : t.creator.components(separatedBy: " ").last]
            .compactMap { $0 }.joined(separator: " · ")
    }
}

/// + (save) / bookmark-count chip used in discover rows.
struct SaveChip: View {
    @Environment(AppStore.self) private var store
    let titleID: String
    var body: some View {
        let n = store.collectionsContaining(titleID).count
        if n > 0 {
            Button { store.present(.saveTo(titleID)) } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bookmark.fill").font(.system(size: 12))
                    Text("\(n)").font(.kura.mono(11))
                }
                .foregroundStyle(KColor.text2)
                .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Guardado en \(n). Cambiar")
        } else {
            IconChip44(systemName: "plus", iconSize: 16, label: "Guardar") { store.present(.saveTo(titleID)) }
        }
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
                                .onTapGesture { submit(q) }
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
                                        CoverView(title: t, height: 96, radius: KRadius.coverS)
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
                        CoverView(title: t, width: t.format == .album ? 44 : 40, height: t.format == .album ? 44 : 60, radius: KRadius.coverS)
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
                    .onTapGesture { submit(s) }
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
                    .onTapGesture { submit(q) }
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
        .onTapGesture(perform: onTap)
    }

    // MARK: 19f / 19g

    @ViewBuilder private var results: some View {
        let q = submitted ?? query
        let titles = SearchIndex.titles(q, store)
        let creators = SearchIndex.creators(q, store)
        let users = SearchIndex.users(q, store)
        if titles.isEmpty && creators.isEmpty && users.isEmpty {
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
                                            CoverView(title: t, width: t.format == .album ? 48 : 44, height: t.format == .album ? 48 : 66, radius: KRadius.coverS)
                                                .frame(width: 48)
                                            VStack(alignment: .leading, spacing: 5) {
                                                Text(t.name).font(.kura.newsItalic(18)).foregroundStyle(KColor.text).lineLimit(1)
                                                Text([t.format.metaLabel, t.year.map(String.init), t.creator.components(separatedBy: " ").last]
                                                    .compactMap { $0 }.joined(separator: " · ")).monoLabel().lineLimit(1)
                                            }
                                            Spacer(minLength: 8)
                                            SaveChip(titleID: t.id)
                                        }
                                        .padding(.horizontal, 20)
                                        .frame(minHeight: 84)
                                        .contentShape(Rectangle())
                                        .onTapGesture { store.push(.title(t.id)) }
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
                                        FollowToggle(following: store.isFollowing(p.id), honey: i == 0) { store.followFromProfile(p.id) }
                                    }
                                    .padding(.horizontal, 20)
                                    .contentShape(Rectangle())
                                    .onTapGesture { store.push(.person(p.id)) }
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
            Text("Revisa cómo se escribe, o busca por persona o año.")
                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
            if let c = SearchIndex.correction(for: query, store) {
                GlassButton(title: "Buscar “\(c)”", systemImage: "magnifyingglass") { fix(c) }
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
            .font(.kura.newsMediumItalic(size * 0.42))
            .tracking(-size * 0.42 * 0.035)
            .foregroundStyle(KColor.text)
            .frame(width: size, height: size)
            .background(KColor.s2, in: Circle())
            .accessibilityHidden(true)
    }
}

/// Mock search over the catalog, creators and people.
enum SearchIndex {
    static func fold(_ s: String) -> String { s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil) }

    @MainActor static func titles(_ q: String, _ store: AppStore) -> [Title] {
        let f = fold(q.trimmingCharacters(in: .whitespaces))
        guard !f.isEmpty else { return [] }
        return store.catalogOrder.compactMap { store.title($0) }
            .filter { fold($0.name).contains(f) || fold($0.creator).contains(f) }
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
            for w in (t.name + " " + t.creator).split(separator: " ") { words.insert(fold(String(w)).trimmingCharacters(in: .punctuationCharacters)) }
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
