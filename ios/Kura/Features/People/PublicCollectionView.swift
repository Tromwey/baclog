import SwiftUI

/// Someone else's public collection (`GET /people/{handle}/collections/{id}`).
/// Read-only: the same tinted header and shelf as yours, with the OWNER's
/// marks on the covers and none of the owner's actions (no portada, orden,
/// renombrar, privacidad). Tap → ficha; long press → "Guardar en…", which
/// writes to YOUR library, not theirs. 404 (private or gone, never which) →
/// the same "ya no existe" shape as a person.
struct PublicCollectionView: View {
    @Environment(AppStore.self) private var store
    let handle: String
    let collectionID: String
    @State private var filter: MediaFormat? = nil

    private var key: String { AppStore.publicKey(handle: handle, id: collectionID) }

    var body: some View {
        Group {
            if let d = store.publicCollections[key] {
                content(d)
            } else if store.missingPublicCollections.contains(key) {
                GoneView(title: "esta colección no está disponible.", note: "Es privada o ya no existe.")
            } else if let e = store.loadError(.publicCollection(key)) {
                LoadErrorScreen(error: e) { Task { await store.loadPublicCollection(handle: handle, id: collectionID, force: true) } }
            } else {
                LoadingScreen()
            }
        }
        .task(id: key) { await store.loadPublicCollection(handle: handle, id: collectionID) }
    }

    private func content(_ d: CollectionDetail) -> some View {
        let all = d.collection.titleIDs.compactMap { store.title($0) }
        let formats = MediaFormat.allCases.filter { f in all.contains { $0.format == f } }
        let visible = filter.map { f in all.filter { $0.format == f } } ?? all
        let cover = d.collection.coverTitleID.flatMap { store.title($0) } ?? all.first

        return ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    CollectionHeader(
                        name: d.collection.name,
                        palette: cover?.palette,
                        lead: {
                            if let cover {
                                Button { store.push(.title(cover.id)) } label: { CoverView(title: cover, height: 240).zoomSource(ZoomID.title(cover.id)) }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Portada: \(cover.name)")
                            } else {
                                EmptyCoverSlot().accessibilityHidden(true)
                            }
                        },
                        formats: formats.map { f in (f, all.filter { $0.format == f }.count) },
                        filter: $filter,
                        byline: ("de @\(handle)", { store.push(.person(handle)) })
                    )

                    if let e = store.loadError(.publicCollection(key)) {
                        RetryStrip(error: e) { Task { await store.loadPublicCollection(handle: handle, id: collectionID, force: true) } }
                            .padding(.horizontal, 12)
                            .padding(.top, 8)
                    }

                    if all.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("todavía está vacía.").font(.kura.news(28)).foregroundStyle(KColor.text)
                            Text("@\(handle) no ha guardado nada aquí.")
                                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 28)
                        .padding(.top, 24)
                    } else {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .bottom), count: 3),
                                  alignment: .leading, spacing: 20) {
                            ForEach(visible) { t in
                                ShelfItem(title: t, collectionID: "",
                                          badgeOverride: d.states[t.id]?.mark.map { .mark($0) } ?? CoverBadge.none,
                                          longPress: { store.present(.saveTo(t.id)) })
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                    }
                }
                .padding(.bottom, 56)
            }
            .ignoresSafeArea(.container, edges: .top)

            TopChrome { EmptyView() }
        }
    }
}
