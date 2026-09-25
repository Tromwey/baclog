import SwiftUI

/// 24a/24b/24c · Ficha — film, series or album. Tinted header (180°, fades to
/// bg), cover, italic title, ribbon, actions; then sections in Newsreader 24.
struct TitleDetailView: View {
    @Environment(AppStore.self) private var store
    let titleID: String

    var body: some View {
        Group {
            if let t = store.title(titleID) {
                detail(t)
            } else if store.missingTitles.contains(titleID) {
                GoneView(title: "este título ya no está.", note: "Se quitó del catálogo o dejó de estar disponible.")
            } else if let e = store.loadError(.title(titleID)) {
                LoadErrorScreen(error: e) { Task { await store.loadTitle(titleID, force: true) } }
            } else {
                LoadingScreen()
            }
        }
        .task(id: titleID) { await store.loadTitle(titleID) }
    }

    private func detail(_ t: Title) -> some View {
            ZStack(alignment: .top) {
                KColor.bg.ignoresSafeArea()
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        TitleHeader(title: t)
                        if let e = store.loadError(.title(t.id)) {
                            RetryStrip(error: e, text: e == .offline ? nil : "No se pudo cargar toda la ficha.") {
                                Task { await store.loadTitle(t.id, force: true) }
                            }
                            .padding(.horizontal, 12)
                            .padding(.top, 4)
                        }
                        TitleSections(title: t)
                            .padding(.top, 10)
                            .padding(.horizontal, 24)
                            .padding(.bottom, 56)
                    }
                }
                .ignoresSafeArea(.container, edges: .top)

                TopChrome {
                    IconChip44(systemName: "ellipsis", iconSize: 17, label: "Opciones") {
                        store.present(.titleMore(t.id))
                    }
                }
            }
            .onAppear { store.noteViewed(t.id) }
    }
}

// MARK: - Header

private struct TitleHeader: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    let title: Title

    var body: some View {
        let t = title
        let unreleased = store.isUnreleased(t)
        let today = store.releaseLabel(t) == "hoy"
        let mark = store.mark(t.id)
        let saved = store.collectionsContaining(t.id).count

        VStack(spacing: 12) {
            CoverView(title: t,
                      width: t.format == .album ? 240 : 200,
                      height: t.format == .album ? 240 : 300)
                .overlay(alignment: .topLeading) {
                    if today {
                        HStack(spacing: 6) {
                            GlyphView(glyph: .clock, size: 13, color: KColor.bg)
                            Text("hoy").font(.kura.mono(11, medium: true)).tracking(1.1).textCase(.uppercase)
                        }
                        .foregroundStyle(KColor.bg)
                        .padding(.leading, 9).padding(.trailing, 11)
                        .frame(height: 28)
                        .background(KColor.waiting, in: Capsule())
                        .padding(10)
                        .accessibilityLabel("Sale hoy")
                    }
                }
            Text(t.name)
                .font(.kura.workTitle)
                .foregroundStyle(KColor.text)
                .multilineTextAlignment(.center)
                .padding(.top, 10)
                .accessibilityAddTraits(.isHeader)
            if let c = t.lowerCreator {
                Text(c).font(.kura.ui(15)).foregroundStyle(KColor.text2).multilineTextAlignment(.center)
            }
            Text(metaLine(t, unreleased: unreleased)).monoLabel()

            if let c = t.counts {
                CountRibbon(items: ribbon(c))
                    .padding(.top, 2)
                    .accessibilityLabel(ribbonA11y(c))
            }

            HStack(spacing: 8) {
                if !(unreleased && t.format == .album) {
                    completeButton(t, mark: mark, solid: today)
                }
                saveButton(t, saved: saved)
                if !unreleased && !today && t.format != .series {
                    IconChip44(systemName: "bubble", iconSize: 16, weight: .regular, label: "Reseñar") {
                        store.present(.complete(titleID: t.id, focusReview: true))
                    }
                }
            }
            .padding(.top, 8)
            .padding(.horizontal, -10)
            // A row of 44 pt pills: it holds up to xxxLarge, past that it would truncate.
            .kFixedChrome()

            if unreleased, let sentence = store.releaseSentence(t) {
                Text(sentence.capitalizedFirst).monoLabel().padding(.top, 2)
            } else if t.upcomingSeason != nil, let label = store.releaseLabel(t, withSeason: true) {
                Text(label).monoLabel().padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, KSize.pushedTitleTop)
        .padding(.horizontal, 24)
        .padding(.bottom, 30)
        .background(Tint.header(t.palette))
    }

    private func completeButton(_ t: Title, mark: Mark?, solid: Bool) -> some View {
        Button {
            store.present(.complete(titleID: t.id, focusReview: false))
        } label: {
            HStack(spacing: 8) {
                if let mark { GlyphView(glyph: mark.glyph, size: 16).transition(reduce ? .opacity : .scale.combined(with: .opacity)) }
                Text(mark?.myLabel ?? "Completar")
                    .font(.kura.ui(15, .semibold))
                    .lineLimit(1)
                    .fixedSize()
                    .contentTransition(.interpolate)
            }
            .foregroundStyle(solid && mark == nil ? KColor.bg : KColor.text)
            .padding(.leading, mark == nil ? (solid ? 18 : 16) : 14).padding(.trailing, solid ? 18 : 16)
            .frame(height: 44)
            .background(solid && mark == nil ? KColor.text : KColor.glassBg, in: Capsule())
            .contentShape(Capsule())
        }
        .kPress()
        .kAnimation(KMotion.spring, value: mark)
        .accessibilityLabel(mark.map { "Tu reacción: \($0.myLabel). Cambiar" } ?? "Completar")
    }

    private func saveButton(_ t: Title, saved: Int) -> some View {
        Button {
            store.present(.saveTo(t.id))
        } label: {
            HStack(spacing: 8) {
                Image(systemName: saved > 0 ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 14, weight: .semibold))
                Text(saved == 0 ? "Guardar" : (saved == 1 ? "En 1 colección" : "En \(saved) colecciones"))
                    .font(.kura.ui(15, .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(KColor.text)
            .padding(.leading, 14).padding(.trailing, 16)
            .frame(height: 44)
            .background(KColor.glassBg, in: Capsule())
            .contentShape(Capsule())
        }
        .kPress()
    }

    private func metaLine(_ t: Title, unreleased: Bool) -> String {
        if t.format == .album && unreleased {
            return [t.year.map(String.init), "álbum", t.trackCount.map { "\($0) tracks" }].compactMap { $0 }.joined(separator: " · ")
        }
        var parts: [String] = []
        if let y = t.year { parts.append(String(y)) }
        if let d = t.detail { parts.append(d) }
        if parts.isEmpty { parts.append(t.format.metaLabel) }
        return parts.joined(separator: " · ")
    }

    private func ribbon(_ c: TitleCounts) -> [(Glyph, String)] {
        var items: [(Glyph, String)] = []
        if c.obsessed != "—" { items.append((.flame, c.obsessed)) }
        if c.liked != "—" { items.append((.thumb, c.liked)) }
        if c.completed != "—" { items.append((.check, c.completed)) }
        if let w = c.waiting { items.append((.clock, w)) }
        if c.saved != "—" { items.append((.bookmark, c.saved)) }
        return items
    }

    private func ribbonA11y(_ c: TitleCounts) -> String {
        var s: [String] = []
        if c.obsessed != "—" { s += ["\(c.obsessed) obsesionados", "\(c.liked) les gusta", "\(c.completed) completos"] }
        if let w = c.waiting { s.append("\(w) esperando") }
        if c.saved != "—" { s.append("\(c.saved) guardados") }
        return s.joined(separator: ", ")
    }
}

// MARK: - Sections

private struct TitleSections: View {
    @Environment(AppStore.self) private var store
    let title: Title

    var body: some View {
        let t = title
        VStack(alignment: .leading, spacing: 30) {
            if t.format == .album {
                AlbumSections(title: t)
            } else {
                if !t.watch.isEmpty { whereToWatch(t) }
                else if t.watchElsewhere != nil { notAvailable(t) }
                if t.format == .series { SeriesSections(title: t) }
            }
            if let s = t.synopsis {
                Text(s).font(.kura.ui(15)).lineSpacing(5).foregroundStyle(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            peopleSection(t)
            reviewsSection(t)
            inYourCollections(t)
            alsoBy(t)
        }
    }

    private func whereToWatch(_ t: Title) -> some View {
        let unreleased = store.isUnreleased(t)
        let label = store.releaseLabel(t)
        return VStack(alignment: .leading, spacing: 4) {
            SectionTitle(text: "dónde ver", trailing: "México")
            ForEach(t.watch) { w in
                Link(destination: w.url ?? providerURL(w.name)) {
                    HStack(spacing: 14) {
                        Group {
                            if w.isCinema {
                                Image(systemName: "ticket").font(.system(size: 16))
                            } else {
                                Text(w.short).font(.kura.mono(12, medium: true))
                            }
                        }
                        .foregroundStyle(KColor.text)
                        .frame(width: 40, height: 40)
                        .background(KColor.s2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        Text(w.name).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                        Spacer()
                        if w.isCinema {
                            let when = label == "hoy" ? "desde hoy" : (unreleased ? (label ?? "") : cinemaSince(t))
                            Text(when).monoLabel(11, color: label == "hoy" ? KColor.waiting : KColor.text2)
                        } else {
                            Text(w.kind).monoLabel()
                        }
                        if label != "hoy" || !w.isCinema {
                            Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(KColor.text2)
                        }
                    }
                    .frame(minHeight: 56)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("\(w.name), \(w.kind)")
            }
            if unreleased, let sentence = store.releaseLabel(t) {
                Text({ if case .day = t.release { return "Te avisamos el \(sentence) y cuando llegue a streaming." }
                       return "Te avisamos cuando salga y cuando llegue a streaming." }())
                    .font(.kura.ui(13)).foregroundStyle(KColor.text2)
            } else if let note = t.watchNote, label != "hoy" {
                Text(note).font(.kura.ui(13)).foregroundStyle(KColor.text2)
            }
        }
    }

    private func cinemaSince(_ t: Title) -> String {
        guard case .day(let d)? = t.release else { return "" }
        let c = store.cal.dateComponents([.day, .month], from: d)
        let months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
        return "desde \(c.day ?? 1) \(months[(c.month ?? 1) - 1])"
    }

    /// E4 · no disponible aquí.
    private func notAvailable(_ t: Title) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "dónde ver", trailing: "México")
            Text("No está en streaming en México.").font(.kura.ui(16)).foregroundStyle(KColor.text)
            if let e = t.watchElsewhere {
                Text(e).font(.kura.ui(14)).foregroundStyle(KColor.text2)
            }
            let on = store.alerts.contains(t.id)
            Button { store.toggleAlert(t.id) } label: {
                HStack(spacing: 8) {
                    GlyphView(glyph: on ? .check : .clock, size: 16, color: on ? KColor.text : KColor.waiting)
                    Text(on ? "Te avisamos cuando llegue" : "Avísame cuando llegue").font(.kura.ui(15, .semibold))
                }
                .foregroundStyle(KColor.text)
                .padding(.leading, 14).padding(.trailing, 18)
                .frame(height: 44)
                .background(on ? KColor.glassBg : KColor.waiting.opacity(0.18), in: Capsule())
            }
            .kPress()
            .animation(KMotion.short, value: on)
        }
    }

    private func providerURL(_ name: String) -> URL {
        switch name {
        case "Max": return URL(string: "https://www.max.com")!
        case "Prime Video": return URL(string: "https://www.primevideo.com")!
        case "En cines": return URL(string: "https://cinepolis.com")!
        default: return URL(string: "https://tv.apple.com")!
        }
    }

    @ViewBuilder
    private func peopleSection(_ t: Title) -> some View {
        let people = store.followedMarks(for: t.id)
        if !people.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "gente que sigues")
                VStack(spacing: 0) {
                    ForEach(people, id: \.0.id) { p, pm in
                        Button { store.push(.person(p.id)) } label: {
                            HStack(spacing: 12) {
                                Seal(person: p, size: 36)
                                Text("@\(p.handle)").font(.kura.ui(15, .medium)).foregroundStyle(KColor.text)
                                Spacer()
                                HStack(spacing: 7) {
                                    GlyphView(glyph: pm.mark?.glyph ?? .clock, size: 14)
                                    Text((pm.mark?.theirLabel ?? "No puede esperar") + (pm.suffix.map { " · \($0)" } ?? ""))
                                        .monoLabel(11, tracking: 0.06)
                                }
                            }
                            .frame(minHeight: 52)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func reviewsSection(_ t: Title) -> some View {
        let reviews = store.visibleReviews(t.id)
        if !reviews.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "reseñas")
                ForEach(reviews) { r in ReviewCard(review: r) }
                moreReviews(t)
            }
        }
    }

    /// "Más reseñas" while the server says there's a next page; a failure keeps the button and says so.
    @ViewBuilder
    private func moreReviews(_ t: Title) -> some View {
        if store.reviewCursors[t.id] != nil {
            let busy = store.reviewsPaging.contains(t.id)
            VStack(alignment: .leading, spacing: 8) {
                GlassButton(title: busy ? "Cargando…" : "Más reseñas", systemImage: busy ? nil : "chevron.down") {
                    Task { await store.loadMoreReviews(t.id) }
                }
                .disabled(busy)
                if let e = store.loadError(.moreReviews(t.id)), !busy {
                    Text(e == .offline ? "Sin conexión. Inténtalo de nuevo." : "No se pudieron cargar. Inténtalo de nuevo.")
                        .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                }
            }
            .padding(.top, 2)
        }
    }

    @ViewBuilder
    private func inYourCollections(_ t: Title) -> some View {
        let cols = store.collectionsContaining(t.id)
        if !cols.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "en tus colecciones")
                FlowLayout(spacing: 8, lineSpacing: 8) {
                    ForEach(cols) { c in
                        Button { store.push(.collection(c.id)) } label: {
                            Text(c.name)
                                .font(.kura.news(17))
                                .foregroundStyle(KColor.text)
                                .padding(.horizontal, 16)
                                .frame(height: 40)
                                .background(KColor.glassBg, in: Capsule())
                        }
                        .kPress()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func alsoBy(_ t: Title) -> some View {
        let others = t.creator == nil ? [] : store.catalogOrder.compactMap { store.title($0) }.filter { $0.creator == t.creator && $0.id != t.id }
        if !others.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Button { store.push(.creator(t.creator ?? "")) } label: {
                    SectionTitle(text: "también de \(t.lowerCreator ?? "")")
                }
                .buttonStyle(.plain)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .bottom, spacing: 12) {
                        ForEach(others) { o in
                            Button { store.push(.title(o.id)) } label: {
                                VStack(alignment: .leading, spacing: 7) {
                                    CoverView(title: o, width: o.format == .album ? 130 : 100).zoomSource(ZoomID.title(o.id))
                                    Text(o.name).font(.kura.newsItalic(14)).foregroundStyle(KColor.text)
                                        .lineLimit(1)
                                        .frame(width: o.format == .album ? 130 : 100, alignment: .leading)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 8)
                }
                .scrollClipDisabled()
                .padding(.horizontal, -24)
            }
        }
    }
}

// MARK: - Review card (s1, radius 18) with spoiler blur

struct ReviewCard: View {
    @Environment(AppStore.self) private var store
    let review: Review
    var lineLimit: Int? = nil

    var body: some View {
        if store.reportedReviews.contains(review.id) {
            // Folds in place after a report (like the web): the page never jumps.
            Text("Gracias. La revisamos.")
                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 18).padding(.vertical, 16)
                .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
        } else {
            card
        }
    }

    private var card: some View {
        let revealed = !review.spoiler || store.revealedSpoilers.contains(review.id)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                if let p = store.person(review.authorID) {
                    Seal(person: p, size: 32)
                    // `authorHandle` is null for an account without a handle: fall back to the name, or "tú".
                    Text(p.handle.isEmpty ? (p.name.isEmpty ? "tú" : p.name) : "@\(p.handle)")
                        .font(.kura.ui(15, .medium)).foregroundStyle(KColor.text)
                } else if review.authorID.isEmpty {
                    Text("tú").font(.kura.ui(15, .medium)).foregroundStyle(KColor.text)
                }
                Spacer()
                if let m = review.mark { GlyphView(glyph: m.glyph, size: 14) }
                if ReviewMenu.applies(to: review, me: store.me.id) {
                    ReviewMenu(review: review)
                        .padding(.trailing, -6)
                }
            }
            ZStack {
                Text(review.text)
                    .font(.kura.ui(15))
                    .lineSpacing(5)
                    .foregroundStyle(KColor.text)
                    .lineLimit(lineLimit)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .blur(radius: revealed ? 0 : 7)
                    .accessibilityHidden(!revealed)
                if !revealed {
                    SpoilerPill { store.revealedSpoilers.insert(review.id) }
                }
            }
            .animation(KMotion.fade, value: revealed)
        }
        .padding(18)
        .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
    }
}

struct SpoilerPill: View {
    let reveal: () -> Void
    var body: some View {
        Button(action: reveal) {
            HStack(spacing: 6) {
                Text("Contiene spoiler").foregroundStyle(KColor.text2)
                Text("·").foregroundStyle(KColor.text3)
                Text("Mostrar").foregroundStyle(KColor.text)
            }
            .font(.kura.mono(11))
            .tracking(0.88)
            .textCase(.uppercase)
            .padding(.horizontal, 14)
            .frame(height: 36)
            .modifier(SpoilerSurface())
            .environment(\.colorScheme, .dark)
            .kHitArea(vertical: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Contiene spoiler. Mostrar")
    }
}

/// iOS 26+: the spoiler control is Liquid Glass over the blurred text.
private struct SpoilerSurface: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular.interactive(), in: Capsule())
        } else {
            content.background {
                ZStack {
                    Capsule().fill(.ultraThinMaterial)
                    Capsule().fill(KColor.glassArt)
                }
            }
        }
    }
}

// MARK: - 24b Serie

private struct SeriesSections: View {
    @Environment(AppStore.self) private var store
    let title: Title
    @State private var season: Int = 0
    @State private var expanded = false

    var body: some View {
        let t = title
        let watched = store.userTitles[t.id]?.watchedEpisodes ?? []
        let current = currentSeason(t, watched)
        let shown = season == 0 ? current : season

        VStack(alignment: .leading, spacing: 30) {
            if let s = t.seasons.first(where: { $0.number == current }) {
                progressCard(t, s, watched)
            }
            if let s = t.seasons.first(where: { $0.number == shown }) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("episodios").font(.kura.news(24)).foregroundStyle(KColor.text)
                        Spacer()
                        HStack(spacing: 4) {
                            ForEach(t.seasons) { se in
                                Button { withAnimation(KMotion.short) { season = se.number; expanded = false } } label: {
                                    Text("T\(se.number)")
                                        .font(.kura.mono(11))
                                        .foregroundStyle(se.number == shown ? KColor.text : KColor.text2)
                                        .padding(.vertical, 8).padding(.horizontal, 14)
                                        .background(se.number == shown ? Color.white.opacity(0.1) : .clear, in: Capsule())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Temporada \(se.number)")
                                .accessibilityAddTraits(se.number == shown ? .isSelected : [])
                            }
                        }
                        .padding(4)
                        .background(KColor.glassBg, in: Capsule())
                    }
                    .padding(.bottom, 6)

                    let next = nextEpisode(s, watched)
                    ForEach(Array(s.episodes.enumerated()).prefix(expanded ? s.episodes.count : 6), id: \.offset) { i, name in
                        let key = "T\(s.number)E\(i + 1)"
                        let seen = watched.contains(key)
                        HStack(spacing: 14) {
                            Text("E\(i + 1)").font(.kura.mono(12)).foregroundStyle(KColor.text2).frame(width: 26, alignment: .leading)
                            Text(name).font(.kura.ui(15)).foregroundStyle(seen ? KColor.text2 : KColor.text).lineLimit(1)
                            Spacer()
                            Button { store.toggleEpisode(t.id, key: key) } label: {
                                Group {
                                    if seen { GlyphView(glyph: .check, size: 16) }
                                    else { Circle().strokeBorder(Color.white.opacity(0.3), lineWidth: 2).frame(width: 18, height: 18) }
                                }
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .padding(.trailing, -10)
                            .accessibilityLabel(seen ? "Marcar E\(i + 1) sin ver" : "Marcar E\(i + 1) visto")
                        }
                        .frame(minHeight: 52)
                        .padding(.horizontal, next == i + 1 ? 12 : 0)
                        .background(next == i + 1 ? KColor.s1 : .clear, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
                        .padding(.horizontal, next == i + 1 ? -12 : 0)
                    }
                    if s.episodes.count > 6 {
                        Button { withAnimation(KMotion.short) { expanded.toggle() } } label: {
                            Text(expanded ? "Ver menos" : "Ver los \(s.episodes.count) episodios")
                                .font(.kura.ui(14, .semibold))
                                .foregroundStyle(KColor.text2)
                                .padding(.top, 6)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func currentSeason(_ t: Title, _ watched: Set<String>) -> Int {
        for s in t.seasons {
            if nextEpisode(s, watched) != nil { return s.number }
        }
        return t.seasons.last?.number ?? 1
    }

    private func nextEpisode(_ s: Season, _ watched: Set<String>) -> Int? {
        for i in 1...max(s.episodes.count, 1) where !watched.contains("T\(s.number)E\(i)") { return i }
        return nil
    }

    private func progressCard(_ t: Title, _ s: Season, _ watched: Set<String>) -> some View {
        let n = s.episodes.count
        let done = (1...n).filter { watched.contains("T\(s.number)E\($0)") }.count
        let next = nextEpisode(s, watched)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(done == n ? "Visto · T\(s.number)" : "Viendo · T\(s.number)").monoLabel(12)
                Spacer()
                Text("\(done) de \(n)").monoLabel(12, color: KColor.text)
            }
            HStack(spacing: 4) {
                ForEach(1...n, id: \.self) { i in
                    Capsule()
                        .fill(watched.contains("T\(s.number)E\(i)") ? KColor.completed : Color.white.opacity(0.12))
                        .frame(height: 6)
                }
            }
            .animation(KMotion.short, value: done)
            if let next {
                Button { store.toggleEpisode(t.id, key: "T\(s.number)E\(next)") } label: {
                    HStack(spacing: 8) {
                        GlyphView(glyph: .check, size: 16)
                        Text("Marcar E\(next) visto").font(.kura.ui(15, .semibold)).foregroundStyle(KColor.text)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(KColor.glassBg, in: Capsule())
                    .contentShape(Capsule())
                }
                .kPress()
            } else if store.mark(t.id) == nil {
                GlassButton(title: "Completar", height: 44, fullWidth: true) {
                    store.present(.complete(titleID: t.id, focusReview: false))
                }
            }
        }
        .padding(18)
        .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
    }
}

// MARK: - 24c Álbum · 37c Álbum anunciado

private struct AlbumSections: View {
    @Environment(AppStore.self) private var store
    let title: Title

    var body: some View {
        let t = title
        let unreleased = store.isUnreleased(t)
        VStack(alignment: .leading, spacing: 30) {
            if unreleased {
                VStack(alignment: .leading, spacing: 4) {
                    SectionTitle(text: "dónde escuchar")
                    Link(destination: musicURL(t)) {
                        HStack(spacing: 14) {
                            Image(systemName: "music.note").font(.system(size: 16))
                                .foregroundStyle(KColor.text)
                                .frame(width: 40, height: 40)
                                .background(KColor.s2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            Text("Abrir en \(store.musicApp)").font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                            Spacer()
                            Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(KColor.text2)
                        }
                        .frame(minHeight: 56)
                    }
                    let newCount = t.tracks.filter(\.isNew).count
                    Text("Abre el álbum completo. Los \(newCount) tracks nuevos llegan en \(store.releaseLabel(t) ?? "").")
                        .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                }
            } else {
                Link(destination: musicURL(t)) {
                    HStack(spacing: 8) {
                        Text("Abrir en \(store.musicApp)").font(.kura.ui(16, .semibold))
                        Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(KColor.text)
                    .padding(.leading, 20).padding(.trailing, 18)
                    .frame(height: 48)
                    .background(KColor.glassBg, in: Capsule())
                }
            }

            if !t.tracks.isEmpty {
                // Every track in order. Before release, `available: false` = not out yet (partial
                // pre-order): dimmed with "pronto". After release it only means album-only / not in
                // this country, and the track draws like the rest.
                let shown = t.tracks
                let availableCount = t.tracks.filter(\.available).count
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(unreleased ? "tracks" : "canciones").font(.kura.news(24)).foregroundStyle(KColor.text)
                        Spacer()
                        if unreleased {
                            Text("\(availableCount) de \(t.trackCount ?? t.tracks.count) disponibles").monoLabel()
                        }
                    }
                    .padding(.bottom, unreleased ? 4 : 6)
                    ForEach(shown) { tr in
                        let soon = unreleased && !tr.available
                        HStack(spacing: 14) {
                            Text(unreleased ? "\(tr.number)" : String(format: "%02d", tr.number))
                                .monoLabel(unreleased ? 11 : 12)
                                .frame(width: 22, alignment: .leading)
                            Text(tr.name).font(.kura.ui(unreleased ? 16 : 15))
                                .foregroundStyle(soon ? KColor.text3 : KColor.text).lineLimit(1)
                            Spacer()
                            if soon { Text("pronto").monoLabel(10, color: KColor.text3) }
                        }
                        .frame(minHeight: 48)
                        .accessibilityElement(children: .combine)
                        .accessibilityHint(soon ? "Todavía no disponible" : "")
                    }
                    if let total = t.trackCount, total > t.tracks.count {
                        Text("Ver las \(total) en \(store.musicApp)")
                            .font(.kura.ui(14, .semibold))
                            .foregroundStyle(KColor.text2)
                            .padding(.top, 6)
                    }
                }
            } else if let total = t.trackCount {
                VStack(alignment: .leading, spacing: 6) {
                    Text("canciones").font(.kura.news(24)).foregroundStyle(KColor.text)
                    Text("\(total) canciones · la lista completa está en \(store.musicApp).")
                        .font(.kura.ui(14)).foregroundStyle(KColor.text2)
                }
            }
        }
    }

    private func musicURL(_ t: Title) -> URL {
        // The API resolves the preferred service's link (`watch[].url`); otherwise search it.
        if let u = t.watch.first?.url { return u }
        let q = [t.name, t.creator].compactMap { $0 }.joined(separator: " ").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        switch store.musicApp {
        case "Spotify": return URL(string: "https://open.spotify.com/search/\(q)")!
        case "YouTube Music": return URL(string: "https://music.youtube.com/search?q=\(q)")!
        case "Tidal": return URL(string: "https://listen.tidal.com/search?q=\(q)")!
        default: return URL(string: "https://music.apple.com/mx/search?term=\(q)")!
        }
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
