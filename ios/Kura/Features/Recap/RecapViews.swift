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

    var body: some View {
        Group {
            if store.debugEmptyRecap {
                EmptyRecapView()
            } else if let r = store.currentRecap, let top = r.top {
                content(r, top: top)
            } else if !store.recapLoading, let e = store.loadError(.recap) {
                LoadErrorScreen(error: e) { Task { await store.loadRecap() } }
            } else if store.recapMonths != nil && !store.recapLoading {
                EmptyRecapView()
            } else {
                LoadingScreen(square: true)
            }
        }
        .task { await store.loadRecap() }
    }

    private func content(_ r: RecapPayload, top: Title) -> some View {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    HStack {
                        BackChip()
                        Spacer()
                        Text("Recap · \(r.month) \(String(r.year))").monoLabel(11, tracking: 0.1)
                        Spacer()
                        Color.clear.frame(width: 44, height: 44)
                    }
                    Text(r.month).font(.kura.newsItalic(52)).foregroundStyle(KColor.text)
                        .accessibilityAddTraits(.isHeader)
                    HStack(alignment: .bottom, spacing: 16) {
                        Button { store.push(.title(top.id)) } label: { CoverView(title: top, width: 170, height: 170) }
                            .buttonStyle(.plain)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Lo más tuyo").monoLabel(11, tracking: 0.1)
                            Text(top.name).font(.kura.newsItalic(26)).foregroundStyle(KColor.text)
                            if let c = top.lowerCreator { Text(c).font(.kura.ui(14)).foregroundStyle(KColor.text2) }
                        }
                    }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], alignment: .leading, spacing: 18) {
                        ForEach(r.tiles, id: \.1) { v, l, g in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(v).font(.kura.mono(34)).foregroundStyle(KColor.text)
                                HStack(spacing: 7) {
                                    GlyphView(glyph: g, size: 13, color: g == .bookmark ? KColor.text2 : nil)
                                    Text(l).monoLabel()
                                }
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .padding(.vertical, 6)
                    VStack(alignment: .leading, spacing: 12) {
                        Text("También en tu mes").monoLabel(11, tracking: 0.1)
                        HStack(alignment: .bottom, spacing: 10) {
                            ForEach(r.also) { t in
                                Button { store.push(.title(t.id)) } label: { CoverView(title: t, height: 96, radius: KRadius.coverS) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                    HStack(spacing: 8) {
                        GlassButton(title: "Compartir tarjeta", height: 46) { store.push(.recapShare) }
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

struct EmptyRecapView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack {
                BackChip()
                Spacer()
                Text("Recap · septiembre 2026").monoLabel(11, tracking: 0.1, color: KColor.text3)
                Spacer()
                Color.clear.frame(width: 44, height: 44)
            }
            Spacer()
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: KRadius.coverS).fill(KColor.s2).frame(width: 84, height: 126)
                    RoundedRectangle(cornerRadius: KRadius.coverS).fill(KColor.s1).frame(width: 84, height: 126)
                    RoundedRectangle(cornerRadius: KRadius.coverS).fill(KColor.s1).frame(width: 84, height: 126).opacity(0.5)
                }
                Text("tu recap de septiembre todavía se está escribiendo.")
                    .font(.kura.newsItalic(44)).foregroundStyle(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text("El recap llega el 1 de octubre con lo que completes, califiques o reseñes este mes.")
                    .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Faltan \(daysLeft) días").font(.kura.mono(12)).foregroundStyle(KColor.text2)
            }
            Spacer()
            GlassButton(title: "Ir a tus colecciones", height: 46) { store.pop(); store.select(.collections) }
        }
        .padding(.top, KSize.chromeTop)
        .padding(.horizontal, 24)
        .padding(.bottom, 48)
        .ignoresSafeArea(.container, edges: .top)
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

// MARK: - O8 Meses anteriores

struct RecapHistoryView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        let current = store.currentRecap
        let months = store.recapMonths ?? []
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                HStack { BackChip(); Spacer() }
                    .padding(.horizontal, KSize.chromeSide)
                    .padding(.bottom, 14)
                Text("recap · \(current?.month ?? "") \(current.map { String($0.year) } ?? "")").monoLabel().padding(.horizontal, 20)
                Text(current?.month ?? "recap").font(.kura.news(40)).foregroundStyle(KColor.text).padding(.horizontal, 20).padding(.top, 6)
                HStack(spacing: 10) {
                    tile(String(current?.stats.completed ?? 0), "completos")
                    tile(String(current?.stats.obsessed ?? 0), "obsesiones")
                    if let h = current?.stats.hours { tile("\(h) h", "de cine") } else { tile(String(current?.stats.reviews ?? 0), "reseñas") }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                Text("meses anteriores").font(.kura.section).foregroundStyle(KColor.text)
                    .padding(.horizontal, 20).padding(.top, 40).padding(.bottom, 12)
                HStack(spacing: 0) {
                    SpineLabel(text: "tus recaps", height: 228)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(months) { m in
                                let month = m.label.split(separator: " ").first.map(String.init) ?? m.era
                                if let t = store.recaps[m.era]?.top {
                                    Button { store.pop() } label: {
                                        VStack {
                                            Text("KURA").font(.kura.mono(10)).tracking(1).foregroundStyle(KColor.text2)
                                            Spacer()
                                            CoverImage(url: t.coverURL, palette: t.palette)
                                                .frame(width: 64, height: 64)
                                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                            Spacer()
                                            Text(month).font(.kura.news(18)).foregroundStyle(KColor.text)
                                        }
                                        .padding(.vertical, 14).padding(.horizontal, 10)
                                        .frame(width: 108, height: 192)
                                        .background(recapGradient(t.palette), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                        .kShadow(.cover)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Recap de \(month)")
                                } else {
                                    Skeleton(radius: 14).frame(width: 108, height: 192)
                                        .task { await store.loadRecap(era: m.era) }
                                }
                            }
                        }
                        .padding(.vertical, 18)
                        .padding(.horizontal, 16)
                    }
                }
                .background(KColor.s1)
                .clipShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                .padding(.horizontal, 12)
            }
            .padding(.top, KSize.chromeTop)
            .padding(.bottom, 60)
        }
        .ignoresSafeArea(.container, edges: .top)
        .task { await store.loadRecap() }
    }

    private func tile(_ v: String, _ l: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(v).font(.kura.news(28)).foregroundStyle(KColor.text)
            Text(l).monoLabel()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
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
    @State private var opening = false
    @State private var webCard: WebCardURL?

    private func openWebCard() {
        guard !opening else { return }
        opening = true
        let era = store.currentRecap?.era
        let to = era.map { "/recap/tarjeta?mes=\($0)" } ?? "/recap/tarjeta"
        Task {
            defer { opening = false }
            do {
                webCard = WebCardURL(url: try await store.api.webSession(to: to))
            } catch {
                // Through `noteError`: a 401 ends the session (entrance), offline lights the strip.
                let e = store.noteError(error)
                guard e != .unauthorized, e != .cancelled else { return }
                store.showToast(ToastModel(text: "No pudimos abrir la tarjeta. Inténtalo de nuevo.", kind: .info))
            }
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            VStack(spacing: 22) {
                // Preview only: what gets exported is the web's card (no "Firmar con tu @" here —
                // the web decides the signature, so a local switch would promise what it can't change).
                RecapCard()
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
        .task { if store.currentRecap == nil { await store.loadRecap() } }
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

/// 360×640 exportable card (scaled to fit).
struct RecapCard: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        let r = store.currentRecap
        let top = r?.top
        HStack(spacing: 0) {
            SpineLabel(text: "KURA · recap \(r.map { String(format: "%02d.%d", ($0.era.split(separator: "-").last.flatMap { Int($0) } ?? 0), $0.year) } ?? "")", height: 540)
            VStack(alignment: .leading, spacing: 18) {
                Text(r?.month ?? "").font(.kura.newsItalic(50)).foregroundStyle(KColor.text)
                GeometryReader { geo in
                    let h = geo.size.height * 0.7
                    ZStack {
                        ForEach(Array((r?.fan ?? []).enumerated()), id: \.element.id) { i, t in
                            CoverView(title: t, height: h)
                                .rotationEffect(.degrees(Double(i - 1) * 8))
                                .offset(x: CGFloat(i - 1) * 54 * 0.85)
                                .zIndex(i == 1 ? 3 : 1)
                        }
                    }
                    .frame(width: geo.size.width, height: geo.size.height)
                }
                HStack(alignment: .top) {
                    ForEach((r?.tiles ?? []).prefix(3), id: \.1) { v, l, g in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(v).font(.kura.mono(26)).foregroundStyle(KColor.text)
                            HStack(spacing: 5) {
                                GlyphView(glyph: g, size: 11)
                                Text(l).font(.kura.mono(10)).tracking(0.4).textCase(.uppercase).foregroundStyle(KColor.text2)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                Text("@\(store.me.handle)").font(.kura.mono(12)).foregroundStyle(KColor.text2)
            }
            .padding(.top, 32).padding(.horizontal, 22).padding(.bottom, 28)
        }
        .frame(width: 306, height: 540)
        .background(Tint.card(top?.palette ?? []))
        .clipShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

