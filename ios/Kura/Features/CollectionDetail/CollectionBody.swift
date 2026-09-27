import SwiftUI

/// Everything UNDER a collection's fan and name, shared by Tus colecciones (10a, the collection in
/// the centre of the carousel) and Colección (10b) — propuesta 10, "una sola página": the line
/// (italic 16), the credits (seals + names, collaborators only — no count any more, founder
/// 2026-09-27: nobody to credit means no `Credits` row at all, not an empty one), the format
/// pills with their count — ALWAYS (one format = a label; several = they FILTER, tap again to
/// clear) — then EVERY title — three
/// columns (`Masonry`) or the list (16c), per the collection's own layout and sort — straight
/// under the meta (26), with no heading: "el orden" and its Reordenar link were dropped (founder,
/// 2026-09-27); Reordenar lives in Opciones (⋯). Holding a title opens 18c. Empty = 6b.
///
/// The only differences between the two screens live outside it: the arrival (carousel vs.
/// Volver) and where the name sits. `metaTop` is the gap above the line (10 under 10b's name,
/// 4 under 10a's name strip); `between` slots something between the credits and the titles
/// (10b's "Faltan títulos" strip).
struct CollectionBody<Between: View>: View {
    @Environment(AppStore.self) private var store
    let collection: KCollection
    var metaTop: CGFloat = 10
    @ViewBuilder var between: Between
    @State private var filter: MediaFormat? = nil

    var body: some View {
        let c = collection
        VStack(spacing: 0) {
            if c.titleIDs.isEmpty {
                between.heroRest()
                EmptyCollectionBody { store.present(.addTitles(c.id)) }.heroRest()
            } else {
                let all = store.titles(in: c)
                let formats = Self.formats(all)
                let active = filter.flatMap { f in formats.contains(f) ? f : nil }
                let visible = active.map { f in all.filter { $0.format == f } } ?? all

                VStack(spacing: 10) {
                    if let vibe = c.shownVibe { VibeLine(text: vibe) }
                    // No collaborators wired up yet, so no `Credits` row (an empty one would
                    // still eat the VStack's spacing) — it comes back once a caller has them.
                    // Always, when there are titles (founder, 2026-09-27): one format = one pill
                    // that labels the type with its count; several = pills that filter.
                    if !formats.isEmpty {
                        HStack(spacing: 6) {
                            ForEach(formats) { f in
                                let n = all.filter { $0.format == f }.count
                                if formats.count == 1 {
                                    FormatPill(format: f, count: n)
                                } else {
                                    FormatPill(format: f, count: n, selected: active == f) {
                                        withAnimation(KMotion.short) { filter = (active == f) ? nil : f }
                                    }
                                }
                            }
                        }
                        .padding(.top, 6)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24)
                .padding(.top, metaTop)
                .padding(.bottom, 26)
                // On a hero page (from the profile): the meta rises with the name from 35 %,
                // the titles from 50 %. Identity anywhere else.
                .heroLead()

                VStack(spacing: 0) {
                    between

                    if c.layout == .list {
                        TitleList(titles: visible, collectionID: c.id)
                    } else {
                        Masonry(titles: visible, onHold: { t in
                            store.present(.titleActions(titleID: t.id, collectionID: c.id))
                        })
                    }
                }
                .heroRest()
            }
        }
    }

    /// The formats in the order each first appears.
    static func formats(_ titles: [Title]) -> [MediaFormat] {
        var seen: [MediaFormat] = []
        for t in titles where !seen.contains(t.format) { seen.append(t.format) }
        return seen
    }
}

extension CollectionBody where Between == EmptyView {
    init(collection: KCollection, metaTop: CGFloat = 10) {
        self.init(collection: collection, metaTop: metaTop) { EmptyView() }
    }
}

/// The mono line under "no puedo esperar" (10a's carousel and the automatic collection's own
/// page): "5 títulos · 1 ya salió · el próximo en 14 h". "El próximo" is the first title that is still NOT
/// out — `waitingTitles` puts the ones that already came out last — and a label that isn't a
/// date ("ya salió", "sin fecha") never follows "el próximo" (critica 2026-09-27 #0: it read
/// "el próximo el ya salió").
enum WaitingMeta {
    @MainActor
    static func line(_ titles: [Title], store: AppStore) -> String {
        #if DEBUG
        _ = selfCheck
        #endif
        var parts = ["\(titles.count) \(titles.count == 1 ? "título" : "títulos")"]
        // Same line as the web's `waitMeta`: the ones already out are counted apart.
        let out = titles.filter { !store.isUnreleased($0) && $0.upcomingSeason == nil }.count
        if out > 0 { parts.append(out == 1 ? "1 ya salió" : "\(out) ya salieron") }
        let next = titles.first { store.isUnreleased($0) || $0.upcomingSeason != nil }
            .flatMap { store.releaseLabel($0) }
            .flatMap(nextLabel)
        if let next { parts.append("el próximo \(next)") }
        return parts.joined(separator: " · ")
    }

    /// "14 h" → "en 14 h" · "16 oct" → "el 16 oct" · "oct 2026" / "2027" → "en …" · "hoy" stays ·
    /// "ya salió" / "sin fecha" → nil (nothing to announce).
    static func nextLabel(_ label: String) -> String? {
        switch label {
        case "ya salió", "sin fecha": return nil
        case "hoy": return "hoy"
        default: break
        }
        if label.range(of: #"^\d+ [hd]$"#, options: .regularExpression) != nil { return "en \(label)" }
        if label.range(of: #"^\d+ \p{L}{3}( \d{4})?$"#, options: .regularExpression) != nil { return "el \(label)" }
        return "en \(label)"
    }

    #if DEBUG
    /// The guard (no unit-test target in the app): every DEBUG launch that draws the line checks
    /// the table once, so a regression trips an assertion in the simulator.
    private static let selfCheck: Void = {
        let table: [(String, String?)] = [
            ("ya salió", nil), ("sin fecha", nil), ("hoy", "hoy"), ("14 h", "en 14 h"), ("3 d", "en 3 d"),
            ("16 oct", "el 16 oct"), ("16 oct 2027", "el 16 oct 2027"), ("oct 2026", "en oct 2026"), ("2027", "en 2027"),
        ]
        for (label, want) in table {
            assert(nextLabel(label) == want, "WaitingMeta.nextLabel(\(label)) = \(String(describing: nextLabel(label))), want \(String(describing: want))")
        }
    }()
    #endif
}
