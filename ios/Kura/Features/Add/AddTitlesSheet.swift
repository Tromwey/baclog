import SwiftUI

/// 27a / 27b · Agregar — tall s1 sheet. Suggestions "para esta colección"
/// until you type; then results with the match highlighted. + becomes ✓.
struct AddTitlesSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String
    @State private var query = ""
    @State private var format: MediaFormat? = nil
    @FocusState private var focused: Bool

    var body: some View {
        if let c = store.collection(collectionID) {
            VStack(spacing: 0) {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Agregar a").monoLabel()
                        Text(c.name).font(.kura.news(28)).foregroundStyle(KColor.text).lineLimit(1)
                    }
                    Spacer()
                    Button { store.dismissSheet() } label: {
                        Text("Listo")
                            .font(.kura.ui(16, .semibold))
                            .foregroundStyle(KColor.text)
                            .padding(.horizontal, 18)
                            .frame(minHeight: 44)
                            .background(KColor.glassBg, in: Capsule())
                    }
                    .kPress()
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 14)

                SearchPill(placeholder: "Buscar títulos", text: $query, fill: Color.white.opacity(0.08), focus: $focused)
                    .padding(.horizontal, 20)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        chip(nil, "Todo")
                        ForEach(MediaFormat.allCases) { f in chip(f, f.label) }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 6)
                }

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        if query.trimmingCharacters(in: .whitespaces).isEmpty {
                            HStack(alignment: .firstTextBaseline) {
                                Text("para esta colección").font(.kura.news(22)).foregroundStyle(KColor.text)
                                Spacer()
                                Text("por lo que ya tiene").monoLabel()
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 10)
                            .padding(.bottom, 6)
                            ForEach(suggestions(c)) { t in row(t, c) }
                        } else {
                            let res = results
                            if store.searchLoading && res.isEmpty {
                                ForEach(0..<5, id: \.self) { _ in
                                    HStack(spacing: 14) {
                                        Skeleton(radius: KRadius.coverS).frame(width: 40, height: 60)
                                        VStack(alignment: .leading, spacing: 10) {
                                            Skeleton(radius: 6).frame(width: 180, height: 16)
                                            Skeleton(radius: 5).frame(width: 120, height: 10)
                                        }
                                        Spacer()
                                    }
                                    .padding(.horizontal, 20)
                                    .frame(minHeight: 72)
                                }
                            } else if res.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("no encontramos «\(query)».").font(.kura.news(22)).foregroundStyle(KColor.text)
                                    Text("Revisa cómo se escribe o busca por autor.").font(.kura.ui(14)).foregroundStyle(KColor.text2)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(20)
                            }
                            ForEach(res) { t in row(t, c) }
                        }
                    }
                    .padding(.top, 6)
                    .padding(.bottom, 40)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .task(id: "\(query)|\(format?.rawValue ?? "")") {
                let q = query.trimmingCharacters(in: .whitespaces)
                guard !q.isEmpty else { store.clearSearch(); return }
                try? await Task.sleep(for: .milliseconds(KuraRuntime.usesMock ? 0 : 350))
                guard !Task.isCancelled else { return }
                await store.runSearch(q, kind: format)
            }
            .onDisappear { store.clearSearch() }
        }
    }

    private func chip(_ f: MediaFormat?, _ label: String) -> some View {
        let on = format == f
        return Button {
            format = f
            UISelectionFeedbackGenerator().selectionChanged()
        } label: {
            Text(label)
                .monoLabel(11, color: on ? KColor.text : KColor.text2)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(on ? KColor.dockActive : KColor.glassBg, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// `GET /search` results (the store keeps the last answer); filtered by the chip.
    private var results: [Title] {
        store.searchResults.map { store.title($0.id) ?? $0.title }.filter { format == nil || $0.format == format }
    }

    /// Same creators / formats as what the collection already has, not yet in it.
    private func suggestions(_ c: KCollection) -> [Title] {
        let inside = store.titles(in: c)
        let creators = Set(inside.compactMap(\.creator))
        let formats = Set(inside.map(\.format))
        let pool = store.catalogOrder.compactMap { store.title($0) }
            .filter { format == nil || $0.format == format }
        let scored = pool.map { t -> (Title, Int) in
            var s = 0
            if let cr = t.creator, creators.contains(cr) { s += 2 }
            if formats.contains(t.format) { s += 1 }
            if c.titleIDs.contains(t.id) { s -= 1 }
            return (t, s)
        }
        return scored.sorted { $0.1 > $1.1 }.prefix(8).map(\.0)
    }

    private func fold(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
    }

    private func row(_ t: Title, _ c: KCollection) -> some View {
        let added = c.titleIDs.contains(t.id)
        return HStack(spacing: 14) {
            CoverView(title: t, width: t.format == .album ? 44 : 40, height: t.format == .album ? 44 : 60, radius: KRadius.coverS)
                .frame(width: 44, height: 60)
            VStack(alignment: .leading, spacing: 4) {
                highlighted(t.name)
                    .lineLimit(1)
                Text(meta(t)).monoLabel().lineLimit(1)
            }
            Spacer(minLength: 8)
            Button {
                if added {
                    store.removeSilently(t.id, from: c.id)
                } else {
                    store.add(t.id, to: c.id)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            } label: {
                Image(systemName: added ? "checkmark" : "plus")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(added ? KColor.bg : KColor.text)
                    .frame(width: 44, height: 44)
                    .background(added ? KColor.text : KColor.glassBg, in: Circle())
                    .scaleEffect(added ? 1 : 0.94)
                    .animation(.spring(response: 0.26, dampingFraction: 0.55), value: added)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(added ? "Quitar \(t.name)" : "Agregar \(t.name)")
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 72)
    }

    private func meta(_ t: Title) -> String {
        var parts = [t.format.metaLabel]
        if let y = t.year { parts.append(String(y)) }
        if let cr = t.creator { parts.append(cr) }
        return parts.joined(separator: " · ")
    }

    /// Match highlighted: the rest in text2, the match in text (Medium Italic).
    private func highlighted(_ name: String) -> Text {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty,
              let r = name.range(of: q, options: [.caseInsensitive, .diacriticInsensitive]) else {
            return Text(name).font(.kura.newsItalic(18)).foregroundColor(KColor.text)
        }
        return Text(name[..<r.lowerBound]).font(.kura.newsItalic(18)).foregroundColor(KColor.text2)
            + Text(name[r]).font(.kura.newsMediumItalic(18)).foregroundColor(KColor.text)
            + Text(name[r.upperBound...]).font(.kura.newsItalic(18)).foregroundColor(KColor.text2)
    }
}
