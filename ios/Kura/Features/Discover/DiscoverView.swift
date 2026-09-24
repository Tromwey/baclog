import SwiftUI

/// Descubrir (no frame; built from the DS): glass search 48 + editorial
/// sections with strips. Typing turns it into results with "guardar".
struct DiscoverView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    @FocusState private var focused: Bool

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("descubrir")
                        .font(.kura.screenTitle)
                        .foregroundStyle(KColor.text)
                        .padding(.top, KSize.chromeTop)
                        .padding(.bottom, 18)
                        .padding(.horizontal, 20)
                        .accessibilityAddTraits(.isHeader)
                    SearchPill(placeholder: "Buscar películas, series o música", text: $query, focus: $focused)
                        .padding(.horizontal, 20)

                    if query.trimmingCharacters(in: .whitespaces).isEmpty {
                        editorial.padding(.top, 30)
                    } else {
                        results.padding(.top, 14)
                    }
                }
                .padding(.bottom, 140)
            }
            .scrollDismissesKeyboard(.interactively)
            .ignoresSafeArea(.container, edges: .top)
        }
    }

    // MARK: Editorial

    private var editorial: some View {
        let upcoming = store.catalogOrder.compactMap { store.title($0) }.filter { store.isUnreleased($0) && $0.upcomingSeason == nil }
        let people = ["chihiro", "mala", "mindofmine", "ma", "severance"].compactMap { store.title($0) }
        let ghibli = store.catalogOrder.compactMap { store.title($0) }.filter { $0.creator == "Hayao Miyazaki" }
        let music = store.catalogOrder.compactMap { store.title($0) }.filter { $0.format == .album && !store.isUnreleased($0) }

        return VStack(alignment: .leading, spacing: 34) {
            strip("lo que viene", note: "estrenos", titles: upcoming)
            strip("lo que obsesiona a tu gente", note: nil, titles: people)
            strip("ghibli, de principio a fin", note: "\(ghibli.count) películas", titles: ghibli)
            strip("para escuchar completo", note: "álbumes", titles: music)
        }
    }

    private func strip(_ title: String, note: String?, titles: [Title]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: title, trailing: note).padding(.horizontal, 20)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 12) {
                    ForEach(titles) { t in
                        let w: CGFloat = t.format == .album ? 150 : 100
                        Button { store.push(.title(t.id)) } label: {
                            VStack(alignment: .leading, spacing: 7) {
                                CoverView(title: t, width: w, badge: badge(t))
                                Text(t.name).font(.kura.newsItalic(14)).foregroundStyle(KColor.text)
                                    .lineLimit(1).frame(width: w, alignment: .leading)
                                Text(t.lowerCreator).monoLabel(10).lineLimit(1).frame(width: w, alignment: .leading)
                            }
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button("Guardar en…", systemImage: "bookmark") { store.present(.saveTo(t.id)) }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
            }
            .scrollClipDisabled()
        }
    }

    private func badge(_ t: Title) -> CoverBadge {
        if let m = store.mark(t.id) { return .mark(m) }
        if store.isUnreleased(t), let l = store.releaseLabel(t) { return .waiting(l) }
        return .none
    }

    // MARK: Results

    private var results: some View {
        let q = fold(query.trimmingCharacters(in: .whitespaces))
        let res = store.catalogOrder.compactMap { store.title($0) }
            .filter { fold($0.name).contains(q) || fold($0.creator).contains(q) }
        return VStack(alignment: .leading, spacing: 0) {
            if res.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("no encontramos «\(query)».").font(.kura.news(26)).foregroundStyle(KColor.text)
                    Text("Revisa cómo se escribe o busca por autor.").font(.kura.ui(15)).foregroundStyle(KColor.text2)
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
            }
            ForEach(res) { t in
                HStack(spacing: 14) {
                    CoverView(title: t, width: t.format == .album ? 44 : 40, height: t.format == .album ? 44 : 60, radius: KRadius.coverS)
                        .frame(width: 44, height: 60)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(t.name).font(.kura.newsItalic(18)).foregroundStyle(KColor.text).lineLimit(1)
                        Text([t.format.metaLabel, t.year.map(String.init), t.creator].compactMap { $0 }.joined(separator: " · "))
                            .monoLabel().lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    let saved = store.isSaved(t.id)
                    IconChip44(systemName: saved ? "bookmark.fill" : "bookmark", iconSize: 15,
                               label: saved ? "Guardado. Cambiar colecciones" : "Guardar") {
                        store.present(.saveTo(t.id))
                    }
                }
                .padding(.horizontal, 20)
                .frame(minHeight: 72)
                .contentShape(Rectangle())
                .onTapGesture { store.push(.title(t.id)) }
            }
        }
    }

    private func fold(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
    }
}
