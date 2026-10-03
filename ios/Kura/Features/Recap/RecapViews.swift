import SafariServices
import SwiftUI

/// The four stat tiles of a recap, in frame order.
extension RecapPayload {
    var tiles: [(String, String, Glyph)] {
        [(String(stats.completed), "Completos", .check), (String(stats.obsessed), "Obsesiones", .flame),
         (String(stats.reviews), "Reseñas", .review), (String(stats.saved), "Guardados", .bookmark)]
    }
    /// The three covers fanned on the card: the top one in the middle.
    var fan: [Title] {
        let others = also.filter { $0.id != top?.id }
        var list = Array(others.prefix(2))
        if let top { list.insert(top, at: min(1, list.count)) }
        return list
    }
}

// MARK: - 08 Recap · 09 Recap vacío

struct RecapView: View {
    @Environment(AppStore.self) private var store
    /// The month (`YYYY-MM`); nil = the newest.
    var era: String? = nil

    var body: some View {
        Group {
            if store.debugEmptyRecap {
                EmptyRecapView()
            } else if let r = store.recap(era), let top = r.top {
                content(r, top: top)
            } else if !store.recapLoading, let e = store.loadError(.recap) {
                LoadErrorScreen(error: e) { Task { await store.loadRecap() } }
            } else if store.recapMonths != nil && !store.recapLoading {
                EmptyRecapView()
            } else {
                LoadingScreen(square: true)
            }
        }
        .task(id: era) { await store.loadRecap(era: era) }
    }

    private func content(_ r: RecapPayload, top: Title) -> some View {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    BackChip()
                    // The month with its short year ("agosto ’26"); the mono "Recap · agosto 2026"
                    // above it said the month twice (founder, 2026-09-27).
                    RecapMonthTitle(month: r.month, year: r.year, size: 52)
                    HStack(alignment: .bottom, spacing: 16) {
                        Button { store.push(.title(top.id)) } label: { CoverView(title: top, width: 170, height: 170).zoomSource(ZoomID.title(top.id)) }
                            .buttonStyle(.plain)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Lo más tuyo").monoLabel(11, tracking: 0.1)
                            Text(top.name).font(.kura.newsItalic(26)).foregroundStyle(KColor.text)
                            if let c = top.lowerCreator { Text(c).font(.kura.ui(14)).foregroundStyle(KColor.text2) }
                        }
                    }
                    RecapStatsGrid(recap: r)
                    VStack(alignment: .leading, spacing: 12) {
                        Text("También en tu mes").monoLabel(11, tracking: 0.1)
                        // A strip that SCROLLS, bled to the screen's edges. It was a bare HStack:
                        // with enough titles (five albums = 5 × 96 + 4 × 10 = 520 pt) it asked for
                        // more than the screen, the page's VStack took that width, and the whole
                        // recap came out wider than the screen and centred — cut on both sides.
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(alignment: .bottom, spacing: 10) {
                                ForEach(r.also) { t in
                                    Button { store.push(.title(t.id)) } label: { CoverView(title: t, height: 96, radius: KRadius.coverS).zoomSource(ZoomID.title(t.id)) }
                                        .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 24)
                            .padding(.vertical, 20) // room for the covers' shadow (a scroll view clips)
                        }
                        .padding(.horizontal, -24)
                        .padding(.vertical, -20)
                    }
                    HStack(spacing: 8) {
                        GlassButton(title: "Compartir tarjeta", height: 46, flat: true) { store.push(.recapShare(era: r.era)) }
                        Button("Meses anteriores") { store.push(.recapHistory) }
                            .font(.kura.ui(15, .semibold))
                            .foregroundStyle(KColor.text2)
                            .padding(.horizontal, 16)
                            .frame(height: 46)
                    }
                    .padding(.top, 4)
                }
                .padding(.top, KSize.chromeTop)
                .padding(.horizontal, 24)
                .padding(.bottom, 48)
            }
            .background(Tint.card(top.palette).ignoresSafeArea())
            .ignoresSafeArea(.container, edges: .top)
    }
}

/// The month's four numbers (completos · obsesiones · reseñas · guardados) in a 2×2 — ONE set of
/// metrics for the recap and for "este mes" in Meses anteriores (critique 2026-09-27: the two
/// screens counted different things). Twin of the web's `recap/recap-stats.tsx`.
struct RecapStatsGrid: View {
    let recap: RecapPayload
    var size: CGFloat = 34

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], alignment: .leading, spacing: 18) {
            ForEach(recap.tiles, id: \.1) { v, l, g in
                VStack(alignment: .leading, spacing: 4) {
                    Text(v).font(.kura.mono(size)).foregroundStyle(KColor.text)
                    HStack(spacing: 7) {
                        GlyphView(glyph: g, size: 13, color: g == .bookmark ? KColor.text2 : nil)
                        Text(l).monoLabel()
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.vertical, 6)
    }
}

struct EmptyRecapView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            BackChip()
            Spacer()
            VStack(alignment: .leading, spacing: 16) {
                // The ghost fan (dashed front, no "+"): a month still being filled. Three flat grey
                // blocks in a row read as a loading skeleton.
                FanView(covers: [], lead: 150, ghost: true, plus: false)
                    .padding(.bottom, 6)
                // Roman: italic is for works, and this is a sentence.
                Text("tu recap de \(monthName(0)) todavía se está escribiendo")
                    .font(.kura.news(44)).foregroundStyle(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                // Same words as the web (and as the recap's own tiles: guardados · completos · reseñas).
                Text("El recap llega el 1 de \(monthName(1)) con lo que guardes, completes o reseñes este mes.")
                    .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(daysLeft == 1 ? "Falta 1 día" : "Faltan \(daysLeft) días").font(.kura.mono(12)).foregroundStyle(KColor.text2)
            }
            Spacer()
            GlassButton(title: "Ir a tus colecciones", height: 46, flat: true) { store.pop(); store.select(.collections) }
        }
        .padding(.top, KSize.chromeTop)
        .padding(.horizontal, 24)
        .padding(.bottom, 48)
        .ignoresSafeArea(.container, edges: .top)
    }

    /// The month `offset` months from now in Kura's calendar (es-MX, lowercase): "septiembre".
    private func monthName(_ offset: Int) -> String {
        let cal = store.cal
        let date = cal.date(byAdding: .month, value: offset, to: store.now) ?? store.now
        let symbols = cal.standaloneMonthSymbols
        return symbols[(cal.component(.month, from: date) - 1) % symbols.count].lowercased(with: cal.locale)
    }

    private var daysLeft: Int {
        let cal = store.cal
        var comps = cal.dateComponents([.year, .month], from: store.now)
        comps.month = (comps.month ?? 1) + 1
        comps.day = 1
        let end = cal.date(from: comps) ?? store.now
        return max(0, cal.dateComponents([.day], from: cal.startOfDay(for: store.now), to: end).day ?? 0) + 1
    }
}

/// "agosto ’26": the month in Newsreader ROMAN (italic is for works, never a screen's title — the
/// recap drew it italic and Meses anteriores roman) with its two-digit year a size down in `text2`,
/// on one line (it shrinks a little before it would wrap, e.g. "septiembre" on a 375 pt screen).
struct RecapMonthTitle: View {
    let month: String
    let year: Int
    let size: CGFloat

    private func face(_ s: CGFloat) -> Font { .kura.news(s) }

    var body: some View {
        (Text(month).font(face(size)).foregroundColor(KColor.text)
         + Text(" \u{2019}\(String(format: "%02d", year % 100))").font(face(size * 0.56)).foregroundColor(KColor.text2))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .accessibilityLabel("\(month) \(String(year))")
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - O8 Meses anteriores

/// The screen says what it is (critique 2026-09-27, same as the web's `recap/meses/page.tsx`): the
/// h1 is "meses anteriores" (Newsreader roman 40); then the newest month as a labelled block —
/// "este mes" when it is the month in progress, else "tu último mes" — with the SAME four numbers
/// as the recap (`RecapStatsGrid`), opening its recap; then every OLDER month as a miniature
/// (108×192, tinted by its "lo más tuyo", cover + month + short year). No rotated "tus recaps"
/// spine and no "KURA" on each miniature: those belong to the exportable card.
/// ("agosto ’26" as the big title is the RECAP's — founder — not this screen's.)
struct RecapHistoryView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        let current = store.currentRecap
        let months = store.recapMonths ?? []
        let older = Array(months.dropFirst())
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                HStack { BackChip(); Spacer() }
                    .padding(.horizontal, KSize.chromeSide)
                    .padding(.bottom, 14)
                Text("meses anteriores").font(.kura.news(40)).foregroundStyle(KColor.text)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.horizontal, 20)
                if let current {
                    Button { store.openRecapMonth(current.era) } label: {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("\(isInProgress(current.era) ? "este mes" : "tu último mes") · \(current.month) \u{2019}\(String(format: "%02d", current.year % 100))")
                                .monoLabel(11, tracking: 0.1)
                            RecapStatsGrid(recap: current, size: 30)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
                        .contentShape(RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .kPress()
                    .padding(.horizontal, 20)
                    .padding(.top, 22)
                }
                Group {
                    if older.isEmpty {
                        Text("Este es tu primer mes. Los anteriores se guardan aquí.")
                            .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                            .padding(.horizontal, 20)
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(older) { m in miniature(m) }
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 18) // room for the covers' shadow (a scroll view clips)
                        }
                        .padding(.vertical, -18)
                    }
                }
                .padding(.top, 32)
            }
            .padding(.top, KSize.chromeTop)
            .padding(.bottom, 60)
        }
        .ignoresSafeArea(.container, edges: .top)
        .task { await store.loadRecap() }
    }

    @ViewBuilder
    private func miniature(_ m: RecapMonth) -> some View {
        let month = m.label.split(separator: " ").first.map(String.init) ?? m.era
        let yy = m.era.split(separator: "-").first.map { "\u{2019}" + String($0.suffix(2)) } ?? ""
        if let t = store.recaps[m.era]?.top {
            // Opens THAT month (it used to pop back to the newest, whichever you tapped).
            Button { store.openRecapMonth(m.era) } label: {
                VStack(spacing: 12) {
                    Spacer(minLength: 0)
                    CoverImage(url: t.coverURL, palette: t.palette)
                        .frame(width: 64, height: 64)
                        .clipShape(RoundedRectangle(cornerRadius: KRadius.coverS, style: .continuous))
                    VStack(spacing: 4) {
                        Text(month).font(.kura.news(18)).foregroundStyle(KColor.text)
                        Text(yy).font(.kura.mono(10)).tracking(0.8).foregroundStyle(KColor.text2)
                    }
                }
                .padding(.vertical, 14).padding(.horizontal, 10)
                .frame(width: 108, height: 192)
                .background(recapGradient(t.palette), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .kShadow(.cover)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Recap de \(m.label)")
        } else {
            Skeleton(radius: 14).frame(width: 108, height: 192)
                .task { await store.loadRecap(era: m.era) }
        }
    }

    private func isInProgress(_ era: String) -> Bool {
        let c = store.cal.dateComponents([.year, .month], from: store.now)
        return era == String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
    }
}

func recapGradient(_ palette: [String]) -> LinearGradient {
    let (top, bottom) = Tint.ends(palette)
    return LinearGradient(stops: [.init(color: top.color, location: 0), .init(color: bottom.color, location: 0.7),
                                  .init(color: KColor.bg, location: 1)], startPoint: .top, endPoint: .bottom)
}

// MARK: - Tarjeta recap · C2 firmada

struct RecapShareView: View {
    @Environment(AppStore.self) private var store
    /// The month the card is for; nil = the newest.
    var era: String? = nil
    @State private var opening = false
    @State private var webCard: WebCardURL?

    private func openWebCard() {
        guard !opening else { return }
        opening = true
        let era = store.recap(self.era)?.era
        let to = era.map { "/recap/tarjeta?mes=\($0)" } ?? "/recap/tarjeta"
        Task {
            defer { opening = false }
            do {
                let url = try await store.api.webSession(to: to)
                // The handoff URL carries a signed-in session: open it only on our own origin
                // (scheme + host + port of the API). The mock serves a fixed get-kura.app URL.
                guard KuraRuntime.usesMock || AvatarStore.isAPIOrigin(url) else {
                    store.showToast(ToastModel(text: "No pudimos abrir la tarjeta. Vuelve a intentarlo.", kind: .info))
                    return
                }
                webCard = WebCardURL(url: url)
            } catch {
                // Through `noteError`: a 401 ends the session (entrance), offline lights the strip.
                let e = store.noteError(error)
                guard e != .unauthorized, e != .cancelled else { return }
                store.showToast(ToastModel(text: "No pudimos abrir la tarjeta. Vuelve a intentarlo.", kind: .info))
            }
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            VStack(spacing: 22) {
                // Preview only: what gets exported is the web's card (no "Firmar con tu @" here —
                // the web decides the signature, so a local switch would promise what it can't change).
                RecapCard(era: era)
                // The exportable card lives on the web (`/recap/tarjeta`, the card exporter):
                // `POST auth/web-session` gives a one-shot signed-in URL, opened in-app.
                Button { openWebCard() } label: {
                    Group {
                        if opening { ProgressView().tint(KColor.bg) } else { Text("Compartir") }
                    }
                    .font(.kura.ui(16, .semibold)).foregroundStyle(KColor.bg)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(KColor.text, in: Capsule())
                }
                .disabled(opening)
                .padding(.horizontal, 24)
            }
            .padding(.top, 118)
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
        // Opened straight (deep link / `-kuraScreen recapcard`) the recap isn't loaded yet.
        .task { if store.recap(era) == nil { await store.loadRecap(era: era) } }
        .fullScreenCover(item: $webCard) { card in
            SafariView(url: card.url).ignoresSafeArea()
        }
    }
}

/// The one-shot handoff URL (single use, 60 s) — identifiable only to drive the cover.
struct WebCardURL: Identifiable {
    let id = UUID()
    let url: URL
}

/// `SFSafariViewController`: own cookie jar (not Safari's), so the handoff's session cookie
/// stays inside the app.
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let vc = SFSafariViewController(url: url)
        vc.dismissButtonStyle = .close
        return vc
    }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

/// 9:16 preview of the exportable card — a faithful MINIATURE of the web's
/// `/recap/tarjeta` export (`src/modules/cards/render/recap.ts`, the source of
/// truth for this design; twin it by eye, not the old lomo layout): "RECAP" in
/// mono up top (no date — the title already says it) · the month title
/// (`RecapMonthTitle`, centred) · the month's fan ("lo más tuyo" in front,
/// `FanView`'s own short-fan rule for 1–2 titles) · the non-zero numbers, 1–3
/// in a row or 4 in a 2×2, singular at 1 · a dashed foot with "N TÍTULOS" ·
/// @handle, and the 蔵 kura lockup. What actually gets SHARED is the web's
/// card (`RecapShareView.openWebCard`) — this view is only the in-app look of
/// it, so it carries no "Firmar con tu @" switch (the web decides that).
struct RecapCard: View {
    @Environment(AppStore.self) private var store
    var era: String? = nil

    private static let width: CGFloat = 306
    private static let height: CGFloat = (width * 16 / 9).rounded()

    private struct Stat { let v: Int; let one: String; let many: String; let glyph: Glyph; let color: Color }

    /// The month's numbers in the card's order (twin of the web's `recapStats`), non-zero only.
    private func stats(_ r: RecapPayload) -> [Stat] {
        [Stat(v: r.stats.completed, one: "COMPLETO", many: "COMPLETOS", glyph: .check, color: KColor.completed),
         Stat(v: r.stats.obsessed, one: "OBSESIÓN", many: "OBSESIONES", glyph: .flame, color: KColor.obsessed),
         Stat(v: r.stats.reviews, one: "RESEÑA", many: "RESEÑAS", glyph: .review, color: KColor.text),
         Stat(v: r.stats.saved, one: "GUARDADO", many: "GUARDADOS", glyph: .bookmark, color: KColor.text2)]
            .filter { $0.v > 0 }
    }

    var body: some View {
        let r = store.recap(era)
        Group {
            if let r, let top = r.top {
                content(r, top: top)
            } else {
                KColor.bg
                    .overlay { ProgressView().tint(KColor.text2) }
            }
        }
        .frame(width: Self.width, height: Self.height)
        .clipShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func content(_ r: RecapPayload, top: Title) -> some View {
        let cardStats = stats(r)
        let cols = cardStats.isEmpty ? 1 : (cardStats.count <= 3 ? cardStats.count : 2)
        let n = 1 + r.also.count
        return VStack(spacing: 0) {
            Text("RECAP").monoLabel(9, tracking: 0.7)
                .padding(.top, 22)
            Spacer(minLength: 10)
            VStack(spacing: 20) {
                RecapMonthTitle(month: r.month, year: r.year, size: 38)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                FanView(covers: r.fan, lead: 124)
                if !cardStats.isEmpty {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 14), count: cols), alignment: .leading, spacing: 16) {
                        ForEach(cardStats, id: \.many) { s in
                            VStack(alignment: .leading, spacing: 5) {
                                Text("\(s.v)").font(.kura.mono(22)).foregroundStyle(KColor.text)
                                HStack(spacing: 5) {
                                    GlyphView(glyph: s.glyph, size: 11, color: s.color)
                                    Text(s.v == 1 ? s.one : s.many).monoLabel(8, tracking: 0.6)
                                        .lineLimit(1).minimumScaleFactor(0.8)
                                }
                            }
                        }
                    }
                    .frame(maxWidth: 220)
                }
            }
            Spacer(minLength: 10)
            VStack(spacing: 12) {
                DashedRule(width: Self.width - 44)
                HStack {
                    Text("\(n) \(n == 1 ? "TÍTULO" : "TÍTULOS")").monoLabel(9, tracking: 0.7)
                    Spacer()
                    Text("@\(store.me.handle)").monoLabel(9, tracking: 0.7).lineLimit(1)
                }
                Wordmark(variant: .c, color: KColor.text)
            }
            .padding(.bottom, 22)
        }
        .padding(.horizontal, 22)
        .background(background(top))
    }

    @ViewBuilder
    private func background(_ top: Title) -> some View {
        if !top.palette.isEmpty {
            Tint.card(top.palette)
        } else {
            KColor.bg
        }
    }
}

/// The card's foot rule (`cardFoot` on the web): a hairline dash — a content
/// divider between the stats and the "N TÍTULOS · @handle" row, exempt from
/// the no-borders rule same as the web canvas's dashed stroke.
private struct DashedRule: View {
    let width: CGFloat
    var body: some View {
        Path { p in
            p.move(to: CGPoint(x: 0, y: 0))
            p.addLine(to: CGPoint(x: width, y: 0))
        }
        .stroke(Color.white.opacity(0.18), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
        .frame(width: width, height: 1)
    }
}

