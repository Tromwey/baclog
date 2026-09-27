import SwiftUI

/// Everything UNDER a collection's fan and name, shared by Tus colecciones (10a, the collection in
/// the centre of the carousel) and Colección (10b) — propuesta 10, "una sola página": the line
/// (italic 16), the credits (seal 26 + "solo tú · N títulos"), the format pills with their count
/// that FILTER (only with more than one format; tap again to clear), then "el orden" (or the
/// sort's heading) + Reordenar and EVERY title — three columns (`Masonry`) or the list (16c), per
/// the collection's own layout and sort. Holding a title opens 18c. An empty collection draws 6b.
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
                    Credits(count: c.titleIDs.count)
                    if formats.count > 1 {
                        HStack(spacing: 6) {
                            ForEach(formats) { f in
                                FormatPill(format: f, count: all.filter { $0.format == f }.count, selected: active == f) {
                                    withAnimation(KMotion.short) { filter = (active == f) ? nil : f }
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

                    HStack(alignment: .firstTextBaseline) {
                        Text(c.sort.heading).font(.kura.news(22)).foregroundStyle(KColor.text)
                            .accessibilityAddTraits(.isHeader)
                        Spacer()
                        if c.titleIDs.count > 1 {
                            Button { store.present(.reorder(c.id)) } label: {
                                Text("Reordenar").monoLabel(11).frame(minHeight: 44).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 14)

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
