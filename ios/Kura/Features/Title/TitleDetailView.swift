import SwiftUI

/// 24a/24b/24c · Ficha — film, series or album. The PAGE recipe (degradado único, founder
/// 2026-09-27): the title's feed gradient over the whole page (`kFeedSurface`, span 900, it
/// continues in tone 2 — never to black), the band under the dock, tone 1 above a pull-down.
/// Cover, italic title, ribbon, actions; then sections in Newsreader 24.
struct TitleDetailView: View {
    @Environment(AppStore.self) private var store
    let titleID: String

    var body: some View {
        ResourceScreen(value: store.title(titleID),
                       missing: store.missingTitles.contains(titleID),
                       error: store.loadError(.title(titleID)),
                       retry: { Task { await store.loadTitle(titleID, force: true) } },
                       gone: ("este título ya no está disponible.", "Se quitó del catálogo.")) { t in
            detail(t)
        }
        .task(id: titleID) { await store.loadTitle(titleID) }
    }

    private func detail(_ t: Title) -> some View {
            ZStack(alignment: .top) {
                // Opened in place from a cell (`TitleHeroHost`): the page's ground and gradient come
                // in over the first 60 % (so the backdrop IS the final ground — no jump on landing),
                // the cover flies in, the rest rises from 40 %.
                Tint.feedTail(t.palette).ignoresSafeArea().heroBackdrop()
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        TitleHeader(title: t)
                        Group {
                            if let e = store.loadError(.title(t.id)) {
                                RetryStrip(error: e, text: e == .offline ? "Sin conexión. No se cargó el resto." : "No se cargó el resto.") {
                                    Task { await store.loadTitle(t.id, force: true) }
                                }
                                .padding(.horizontal, 12)
                                .padding(.top, 4)
                            }
                            TitleSections(title: t)
                                .padding(.top, 10)
                                .padding(.horizontal, 24)
                                .padding(.bottom, 56)
                                .kDockClearance()
                        }
                        .heroRest()
                    }
                    .kFeedSurface(t.palette, span: 900)
                }
                .kDebugScrollAnchor()
                .ignoresSafeArea(.container, edges: .top)

                // The dock stays on a ficha (`Route.keepsDock`): it floats over the page's own
                // bottom tone. Staged with the backdrop so a hero never flashes it at 0 %.
                if store.dockVisible(store.tab) {
                    Color.clear.kFeedDockBand(t.palette).heroBackdrop().allowsHitTesting(false)
                }

                TopChrome {
                    HStack(spacing: 8) {
                        // `/{you}/item/{id}` — only while your profile is public (otherwise it 404s).
                        if let url = store.myItemLink(t.id) {
                            ShareChip44(item: url)
                        }
                        IconChip44(systemName: "ellipsis", iconSize: 17, label: "Opciones") {
                            store.present(.titleMore(t.id))
                        }
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
    @State private var showLegend = false

    var body: some View {
        let t = title
        let unreleased = store.isUnreleased(t)
        let today = store.releaseLabel(t) == "hoy"
        let mark = store.mark(t.id)

        VStack(spacing: 12) {
            // Radius 18: where a Masonry cover (14) lands when it grows into the ficha.
            CoverView(title: t,
                      width: t.format == .album ? 240 : 200,
                      height: t.format == .album ? 240 : 300,
                      radius: KRadius.surface)
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
                .heroTarget()
            VStack(spacing: 12) {
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

                // The counts only come with the full ficha (`loadTitle`); a title opened from a cell
                // is the list's summary until then. The ribbon's row is held from the first frame (a
                // hidden one-count ribbon sets its height at any text size) and the counts fade in
                // over it, so the actions below never jump while the cover lands. A title with no
                // counts keeps the gap rather than collapsing late — collapsing would be the same jump.
                ZStack {
                    CountRibbon(items: [(.check, "0")]).hidden().accessibilityHidden(true)
                    if let c = t.counts {
                        // 🔥 vs 👍 isn't self-evident: a tap opens the legend (VoiceOver already reads
                        // every count with its name).
                        CountRibbon(items: ribbon(c))
                            .contentShape(Rectangle())
                            .onTapGesture { showLegend = true }
                            .popover(isPresented: $showLegend, arrowEdge: .top) {
                                ribbonLegend(c).presentationCompactAdaptation(.popover)
                            }
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(ribbonA11y(c))
                            .transition(.opacity)
                    }
                }
                .padding(.top, 2)
                .kAnimation(KMotion.short, value: t.counts != nil)

                // Always centered inside the page's 24 pt gutter, whatever the state: when the three
                // pills don't fit at 15 (a long reaction + "En N colecciones" on a 402 pt screen) the
                // row tightens to 14; only past that does the first pill drop to its glyph.
                ViewThatFits(in: .horizontal) {
                    actionRow(t, unreleased: unreleased, today: today, mark: mark, size: .regular)
                    actionRow(t, unreleased: unreleased, today: today, mark: mark, size: .compact)
                    actionRow(t, unreleased: unreleased, today: today, mark: mark, size: .glyph)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
                // A row of 44 pt pills: it holds up to xxxLarge, past that it would truncate.
                .kFixedChrome()

                if unreleased, let sentence = store.releaseSentence(t) {
                    Text(sentence.capitalizedFirst).monoLabel().padding(.top, 2)
                } else if t.upcomingSeason != nil, let label = store.releaseLabel(t, withSeason: true) {
                    Text(label).monoLabel().padding(.top, 2)
                }
            }
            .heroLead()
        }
        .frame(maxWidth: .infinity)
        .padding(.top, KSize.pushedTitleTop)
        .padding(.horizontal, 24)
        .padding(.bottom, 30)
    }

    private enum RowSize { case regular, compact, glyph }

    @ViewBuilder
    private func actionRow(_ t: Title, unreleased: Bool, today: Bool, mark: Mark?, size: RowSize) -> some View {
        HStack(spacing: size == .regular ? 8 : 6) {
            // Not out yet: nothing to complete — the release alert takes the first slot (the
            // same toggle as "Avísame cuando llegue" in dónde ver).
            if unreleased {
                alertButton(t, size: size)
            } else {
                completeButton(t, mark: mark, solid: today, size: size)
            }
            SaveChip(titleID: t.id, style: .pill, compact: size != .regular)
            if !unreleased && !today && t.format != .series {
                IconChip44(systemName: "bubble", iconSize: 16, weight: .regular, flat: true, label: "Reseñar") {
                    store.present(.complete(titleID: t.id, focusReview: true))
                }
            }
        }
        .fixedSize()
    }

    private func alertButton(_ t: Title, size: RowSize) -> some View {
        let on = store.alerts.contains(t.id)
        return Button { store.toggleAlert(t.id) } label: {
            HStack(spacing: 8) {
                GlyphView(glyph: on ? .check : .clock, size: 16, color: on ? KColor.text2 : KColor.waiting)
                if size != .glyph {
                    Text(on ? "Te avisamos" : "Avísame")
                        .font(.kura.ui(size == .regular ? 15 : 14, .semibold))
                        .lineLimit(1)
                        .fixedSize()
                        .contentTransition(.interpolate)
                }
            }
            .foregroundStyle(KColor.text)
            .padding(.leading, size == .glyph ? 0 : (size == .regular ? 14 : 12))
            .padding(.trailing, size == .glyph ? 0 : (size == .regular ? 16 : 14))
            .frame(minWidth: 44, minHeight: 44)
            .background(KColor.glassBg, in: Capsule())
            .contentShape(Capsule())
        }
        .kPress()
        .kAnimation(KMotion.short, value: on)
        .accessibilityLabel(on ? "Te avisamos del estreno" : "Avísame del estreno")
        .accessibilityHint(on ? "Quitar el aviso" : "")
    }

    private func completeButton(_ t: Title, mark: Mark?, solid: Bool, size: RowSize) -> some View {
        let fillSolid = solid && mark == nil
        return Button {
            store.present(.complete(titleID: t.id, focusReview: false))
        } label: {
            HStack(spacing: 8) {
                // "Completar" carries its check like the pills next to it (neutral until you react).
                if let mark {
                    GlyphView(glyph: mark.glyph, size: 16).transition(reduce ? .opacity : .scale.combined(with: .opacity))
                } else {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(fillSolid ? KColor.bg : KColor.text2)
                }
                if size != .glyph {
                    Text(mark?.myLabel ?? "Completar")
                        .font(.kura.ui(size == .regular ? 15 : 14, .semibold))
                        .lineLimit(1)
                        .fixedSize()
                        .contentTransition(.interpolate)
                }
            }
            .foregroundStyle(fillSolid ? KColor.bg : KColor.text)
            .padding(.leading, size == .glyph ? 0 : (size == .regular ? 14 : 12))
            .padding(.trailing, size == .glyph ? 0 : (size == .regular ? (solid ? 18 : 16) : 14))
            .frame(minWidth: 44, minHeight: 44)
            .background(fillSolid ? KColor.text : KColor.glassBg, in: Capsule())
            .contentShape(Capsule())
        }
        .kPress()
        .kAnimation(KMotion.spring, value: mark)
        .accessibilityLabel(mark.map { "Tu reacción: \($0.myLabel). Cambiar" } ?? "Completar")
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

    private func ribbonLegend(_ c: TitleCounts) -> some View {
        var rows: [(Glyph, String, String)] = []
        if c.obsessed != "—" { rows.append((.flame, c.obsessed, "les obsesiona")) }
        if c.liked != "—" { rows.append((.thumb, c.liked, "les gusta")) }
        if c.completed != "—" { rows.append((.check, c.completed, "completos")) }
        if let w = c.waiting { rows.append((.clock, w, "no pueden esperar")) }
        if c.saved != "—" { rows.append((.bookmark, c.saved, "guardados")) }
        return VStack(alignment: .leading, spacing: 10) {
            ForEach(rows.indices, id: \.self) { i in
                HStack(spacing: 10) {
                    GlyphView(glyph: rows[i].0, size: 14).frame(width: 18)
                    Text(rows[i].1).font(.kura.mono(12)).foregroundStyle(KColor.text)
                    Text(rows[i].2).font(.kura.ui(14)).foregroundStyle(KColor.text2)
                }
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 16)
        .fixedSize()
    }

    private func ribbonA11y(_ c: TitleCounts) -> String {
        var s: [String] = []
        // Only what the ribbon shows: a missing count ("—") is never read aloud.
        if c.obsessed != "—" { s.append("a \(c.obsessed) les obsesiona") }
        if c.liked != "—" { s.append("a \(c.liked) les gusta") }
        if c.completed != "—" { s.append("\(c.completed) completos") }
        if let w = c.waiting { s.append("\(w) no pueden esperar") }
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
                            } else if w.kind == "justwatch" {
                                // A glyph, not the word "ver": the section title already says it.
                                Image(systemName: "play.fill").font(.system(size: 14))
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
                GlassButton(title: busy ? "Cargando…" : "Más reseñas", systemImage: busy ? nil : "chevron.down", flat: true) {
                    Task { await store.loadMoreReviews(t.id) }
                }
                .disabled(busy)
                if let e = store.loadError(.moreReviews(t.id)), !busy {
                    Text(e == .offline ? "Sin conexión. Revisa tu red y vuelve a intentarlo." : "No se pudieron cargar. Vuelve a intentarlo.")
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
                        // Each pill led by its mini fan at 22 (Colecciones formalizado · 8).
                        Button { store.push(.collection(c.id)) } label: {
                            HStack(spacing: 8) {
                                FanView(covers: store.fan(of: c), lead: 22)
                                Text(c.name)
                                    .font(.kura.news(17))
                                    .foregroundStyle(KColor.text)
                                    .lineLimit(1)
                            }
                            .padding(.leading, 8)
                            .padding(.trailing, 16)
                            .frame(height: 40)
                            .background(KColor.glassBg, in: Capsule())
                        }
                        .kPress()
                        .accessibilityLabel(c.name)
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
            content.kArtGlass(in: Capsule())
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
                GlassButton(title: "Completar", height: 44, fullWidth: true, flat: true) {
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
    @Environment(\.openURL) private var openURL
    let title: Title

    var body: some View {
        let t = title
        let unreleased = store.isUnreleased(t)
        VStack(alignment: .leading, spacing: 30) {
            if unreleased {
                VStack(alignment: .leading, spacing: 4) {
                    SectionTitle(text: "dónde escuchar")
                    Button { openMusic(t) } label: {
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
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    let newCount = t.tracks.filter(\.isNew).count
                    Text("Abre el álbum completo. Los \(newCount) tracks nuevos llegan en \(store.releaseLabel(t) ?? "").")
                        .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                }
            } else {
                Button { openMusic(t) } label: {
                    HStack(spacing: 8) {
                        Text("Abrir en \(store.musicApp)").font(.kura.ui(16, .semibold))
                        Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(KColor.text)
                    .padding(.leading, 20).padding(.trailing, 18)
                    .frame(height: 48)
                    .background(KColor.glassBg, in: Capsule())
                }
                .buttonStyle(.plain)
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
                                .foregroundStyle(soon ? KColor.text2 : KColor.text).lineLimit(1)
                            Spacer()
                            // text2, not text3: the page continues in the title's tone 2 now, not in
                            // black — text3 on a pale palette's capped tone reads ~3.6:1.
                            if soon { Text("pronto").monoLabel(10, color: KColor.text2) }
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

    /// Opens the album in the music app. The API's link is our `/api/links/resolve` 302, and iOS
    /// hands a link to Spotify / Apple Music / TIDAL only when the tap itself goes to their host —
    /// through our redirect it lands on their web player. So ask for the final link and open THAT.
    private func openMusic(_ t: Title) {
        let url = musicURL(t)
        Task {
            openURL(await MusicLink.direct(for: url) ?? url)
        }
    }

    private func musicURL(_ t: Title) -> URL {
        // The API hands back `/api/links/resolve?…&service=<wire>` pinned to the preference AT FETCH
        // TIME, and the title stays cached after the user switches app in Ajustes — so re-pin
        // `service` to the CURRENT choice, or the label says Apple Music while the link opens Tidal.
        if let u = t.watch.first?.url { return repinnedService(u) }
        // Built with `URLQueryItem` (and ONE encoded path segment for Spotify): a name with `&`,
        // `#`, `+` or `/` ("AC/DC", "Love & Rockets") used to cut the query or — with a character
        // `URL(string:)` rejects — crash on the force-unwrap.
        let q = [t.name, t.creator].compactMap { $0 }.joined(separator: " ")
        func search(_ base: String, _ name: String) -> URL {
            var c = URLComponents(string: base)
            c?.queryItems = [URLQueryItem(name: name, value: q)]
            // `URLQueryItem` leaves "+" as is, and a server reads it as a space.
            let encoded = c?.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
            c?.percentEncodedQuery = encoded
            return c?.url ?? URL(string: base) ?? URL(fileURLWithPath: "/")
        }
        switch store.musicApp {
        case "Spotify":
            let home = "https://open.spotify.com/search"
            return PathSegment.encode(q).flatMap { URL(string: "\(home)/\($0)") } ?? URL(string: home) ?? URL(fileURLWithPath: "/")
        case "YouTube Music": return search("https://music.youtube.com/search", "q")
        case "Tidal": return search("https://listen.tidal.com/search", "q")
        default: return search("https://music.apple.com/mx/search", "term")
        }
    }

    private func repinnedService(_ u: URL) -> URL {
        guard var c = URLComponents(url: u, resolvingAgainstBaseURL: false),
              let items = c.queryItems, items.contains(where: { $0.name == "service" }) else { return u }
        let wire = AppStore.serviceWire(store.musicApp)
        c.queryItems = items.map { $0.name == "service" ? URLQueryItem(name: "service", value: wire) : $0 }
        return c.url ?? u
    }
}

/// `/api/links/resolve?…&format=json` → `{ url }`: the final link without the 302. Nil (an old
/// server, a timeout, anything but an https link) = the caller opens the resolve URL as before.
enum MusicLink {
    static func direct(for url: URL) async -> URL? {
        guard url.path.hasSuffix("/api/links/resolve"),
              var c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        c.queryItems = (c.queryItems ?? []).filter { $0.name != "format" } + [URLQueryItem(name: "format", value: "json")]
        guard let ask = c.url else { return nil }
        var req = URLRequest(url: ask, timeoutInterval: 4)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (data, res) = try? await URLSession.shared.data(for: req),
              (res as? HTTPURLResponse)?.statusCode == 200,
              let body = try? JSONDecoder().decode(Body.self, from: data),
              let target = URL(string: body.url), target.scheme == "https", target.host != nil else { return nil }
        return target
    }

    private struct Body: Decodable { let url: String }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
