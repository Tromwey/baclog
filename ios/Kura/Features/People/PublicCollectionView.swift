import SwiftUI

/// Someone else's public collection (`GET /people/{handle}/collections/{id}`) — Colecciones
/// formalizado · 4a, read-only: the whole page in the feed gradient of its fan, the fan at 225,
/// the owner's seal and "una colección de @handle", the name in Newsreader 36, the line in
/// italic, "12 títulos · cine, música", then the titles in columns in the owner's manual order
/// with the OWNER's marks. Tap → ficha; long press → "Guardar en…", which writes to YOUR library.
/// 404 (private or gone, never which) → the same "ya no existe" shape as a person.
struct PublicCollectionView: View {
    @Environment(AppStore.self) private var store
    let handle: String
    let collectionID: String

    private var key: String { AppStore.publicKey(handle: handle, id: collectionID) }

    var body: some View {
        ResourceScreen(value: store.publicCollections[key],
                       missing: store.missingPublicCollections.contains(key),
                       error: store.loadError(.publicCollection(key)),
                       retry: { Task { await store.loadPublicCollection(handle: handle, id: collectionID, force: true) } },
                       gone: ("esta colección no existe o es privada", "Revisa que el link esté completo."),
                       skeleton: .collection) { d in
            content(d)
        }
        .task(id: key) { await store.loadPublicCollection(handle: handle, id: collectionID) }
    }

    private func content(_ d: CollectionDetail) -> some View {
        let c = d.collection
        let all = c.titleIDs.compactMap { store.title($0) }
        // Someone else's: the server's fan is the truth (their chosen cover may not travel).
        let fanIDs = c.fanTitleIDs.isEmpty ? FanOrder.fan(c.titleIDs, cover: c.chosenCoverTitleID) : c.fanTitleIDs
        let fan = fanIDs.compactMap { store.title($0) }
        let tint = AppStore.fanHexes(fan, ordered: all)
        let kinds = CollectionDetailView.formats(all).map(\.sectionName).joined(separator: ", ")
        let owner = store.person(handle)

        return ZStack(alignment: .top) {
            Tint.feedTail(tint).ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    FanHeader(fan: fan, name: c.name, ghost: all.isEmpty) {
                        Button { store.push(.person(handle)) } label: {
                            HStack(spacing: 8) {
                                if let owner { Seal(person: owner, size: 24) }
                                (Text("una colección de ").foregroundColor(KColor.text2)
                                 + Text("@\(handle)").font(.kura.ui(13, .semibold)).foregroundColor(KColor.text))
                                    .font(.kura.ui(13))
                            }
                            .frame(minHeight: 32)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 4)
                    } below: {
                        if let vibe = c.shownVibe { VibeLine(text: vibe) }
                        Text("\(all.count) \(all.count == 1 ? "título" : "títulos")\(kinds.isEmpty ? "" : " · \(kinds)")")
                            .monoLabel(11)
                    }

                    if let e = store.loadError(.publicCollection(key)) {
                        RetryStrip(error: e) { Task { await store.loadPublicCollection(handle: handle, id: collectionID, force: true) } }
                            .padding(.horizontal, 12)
                            .padding(.bottom, 12)
                    }

                    if all.isEmpty {
                        VStack(spacing: 10) {
                            Text("todavía está vacía").font(.kura.news(28)).foregroundStyle(KColor.text)
                            Text("@\(handle) no ha guardado nada aquí.")
                                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 28)
                    } else {
                        Masonry(titles: all,
                                badge: { t in d.states[t.id]?.mark.map(MasonryBadge.mark) ?? .none },
                                onHold: { t in store.present(.saveTo(t.id)) })
                    }
                }
                .padding(.bottom, 56)
                .kDockClearance()
                .kFeedSurface(tint, span: 900)
            }
            .ignoresSafeArea(.container, edges: .top)

            TopChrome {
                if let link = PublicLinks.collection(handle, id: collectionID) {
                    ShareChip44(item: link, label: "Compartir \(c.name)")
                }
            }
        }
    }
}
