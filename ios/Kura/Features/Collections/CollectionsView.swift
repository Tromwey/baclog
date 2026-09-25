import SwiftUI

/// 11 · Tus colecciones (with 15b/15c loading, 15a empty, 35c offline).
struct CollectionsView: View {
    @Environment(AppStore.self) private var store
    @State private var filter: MediaFormat? = nil

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            switch (store.loadState, store.collections.isEmpty) {
            case (.loading, _):
                CollectionsSkeleton()
            case (.failed, _):
                failed
            case (.loaded, true):
                NoCollectionsView()
            case (.loaded, false):
                content
            }
        }
    }

    private var header: some View {
        TabTitleBar(title: "tus colecciones") {
            IconChip44(systemName: "plus", size: 40, iconSize: 15, weight: .bold, label: "Nueva colección") {
                store.present(.newCollection(addingTitleID: nil))
            }
        }
        .padding(.bottom, 18)
    }

    /// The launch read failed (offline, server down): say so and offer Reintentar —
    /// never a skeleton that doesn't end. Reconnecting retries on its own too.
    private var failed: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                header
                LoadErrorBlock(error: store.loadError(.library) ?? .server("")) {
                    Task { await store.bootstrap() }
                }
                .padding(.horizontal, 28)
                .padding(.top, 40)
            }
            .padding(.bottom, 140)
        }
        .ignoresSafeArea(.container, edges: .top)
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                header
                if store.offline {
                    OfflineStrip().padding(.horizontal, 12).padding(.bottom, 16)
                } else if store.libraryIncomplete, let e = store.loadError(.library) {
                    // The collections arrived but some of their titles didn't (`GET /titles?ids=`).
                    RetryStrip(error: e, text: "Faltan títulos en tus colecciones.") {
                        Task { await store.retryLibraryTitles() }
                    }
                    .padding(.horizontal, 12).padding(.bottom, 16)
                }
                MonoSegmented(options: [(nil, "Todas"), (.film, "Cine"), (.series, "Series"), (.album, "Música")],
                              selection: $filter)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 22)

                if let filter {
                    filtered(filter)
                } else {
                    cards
                }
            }
            .padding(.bottom, 140)
        }
        .ignoresSafeArea(.container, edges: .top)
    }

    // All: automatic card + one card per collection (pinned 150, compact 120).
    private var cards: some View {
        LazyVStack(spacing: 12) {
            let waiting = store.waitingTitles
            if !waiting.isEmpty {
                WaitingCard(titles: waiting,
                            label: { store.releaseLabel($0) ?? "" },
                            onTap: { store.push(.automatic) },
                            onTitleTap: { store.push(.title($0.id)) })
            }
            ForEach(store.orderedCollections) { c in
                CollectionCard(collection: c,
                               titles: store.titles(in: c),
                               marks: marks(for: c),
                               palette: store.palette(of: c),
                               coverHeight: c.pinned ? KSize.cardCoverPinned : KSize.cardCoverCompact,
                               waitingLabel: { t in store.isUnreleased(t) ? store.releaseLabel(t) : nil },
                               onTap: { store.push(.collection(c.id)) },
                               onTitleTap: { _ in store.push(.collection(c.id)) },
                               onLongPress: { store.present(.collectionQuick(c.id)) })
                    .zoomSource(ZoomID.collection(c.id))
            }
        }
    }

    // A format filter: the "listas" layout — name 28 + a strip of that format only.
    private func filtered(_ f: MediaFormat) -> some View {
        let rows = store.orderedCollections.compactMap { c -> (KCollection, [Title])? in
            let ts = store.titles(in: c, format: f)
            return ts.isEmpty ? nil : (c, ts)
        }
        return LazyVStack(spacing: 32) {
            if rows.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("nada de \(f.sectionName) todavía.")
                        .font(.kura.news(28)).foregroundStyle(KColor.text)
                    Text("Cuando guardes \(f.sectionName) en una colección, aparece aquí.")
                        .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 20)
            }
            ForEach(rows, id: \.0.id) { c, ts in
                VStack(alignment: .leading, spacing: 12) {
                    Button { store.push(.collection(c.id)) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(c.name).font(.kura.news(28)).foregroundStyle(KColor.text)
                            Spacer()
                            Text("\(ts.count) \(ts.count == 1 ? "título" : "títulos")").monoLabel(11, color: KColor.text3)
                        }
                        .padding(.horizontal, 20)
                    }
                    .buttonStyle(.plain)
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(alignment: .bottom, spacing: 10) {
                            ForEach(ts) { t in
                                Button { store.push(.title(t.id)) } label: {
                                    CoverView(title: t, height: 150, badge: badge(t)).zoomSource(ZoomID.title(t.id))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)
                    }
                    .scrollClipDisabled()
                }
            }
        }
    }

    private func badge(_ t: Title) -> CoverBadge {
        if let m = store.mark(t.id) { return .mark(m) }
        if store.isUnreleased(t), let l = store.releaseLabel(t) { return .waiting(l) }
        return .none
    }

    private func marks(for c: KCollection) -> [String: Mark] {
        var d: [String: Mark] = [:]
        for id in c.titleIDs { if let m = store.mark(id) { d[id] = m } }
        return d
    }
}

// MARK: - 15b Cargando

struct CollectionsSkeleton: View {
    var body: some View {
        VStack(spacing: 0) {
            TabTitleBar(title: "tus colecciones") {
                Image(systemName: "plus").font(.system(size: 15, weight: .bold)).foregroundStyle(KColor.text)
                    .frame(width: 40, height: 40)
                    .kGlass(Circle())
            }
            .padding(.bottom, 18)

            VStack(spacing: 12) {
                skeletonCard(spine: 96, covers: [100, 150, 100], h: 150, pad: 20)
                skeletonCard(spine: 64, covers: [80, 120, 80, 120], h: 120, pad: 16)
                skeletonCard(spine: 80, covers: [120, 80, 120, 80], h: 120, pad: 16)
                skeletonCard(spine: 56, covers: [80, 80, 120, 80], h: 120, pad: 16)
            }
            .padding(.horizontal, 12)
            Spacer()
        }
        .ignoresSafeArea(.container, edges: .top)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando colecciones")
    }

    private func skeletonCard(spine: CGFloat, covers: [CGFloat], h: CGFloat, pad: CGFloat) -> some View {
        HStack(spacing: 0) {
            ZStack {
                KColor.spine
                Skeleton(radius: 999).frame(width: 8, height: spine)
            }
            .frame(width: 40)
            HStack(alignment: .bottom, spacing: 10) {
                ForEach(Array(covers.enumerated()), id: \.offset) { _, w in
                    Skeleton().frame(width: w, height: h)
                }
            }
            .padding(.vertical, pad)
            .padding(.horizontal, 14)
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            .clipped()
        }
        .frame(height: h + pad * 2)
        .background(KColor.s1)
        .clipShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
    }
}

// MARK: - 15a Sin colecciones

struct NoCollectionsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        VStack(spacing: 0) {
            TabTitleBar(title: "tus colecciones") {
                IconChip44(systemName: "plus", size: 40, iconSize: 15, weight: .bold, label: "Nueva colección") {
                    store.present(.newCollection(addingTitleID: nil))
                }
            }
            .padding(.bottom, 18)

            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 24) {
                // "tu primera": the exact shape of what is coming.
                HStack(spacing: 0) {
                    SpineLabel(text: "tu primera", height: 190, color: KColor.text3)
                    HStack(alignment: .bottom, spacing: 10) {
                        Button { store.present(.newCollection(addingTitleID: nil)) } label: {
                            RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous)
                                .fill(KColor.glassBg)
                                .frame(width: 100, height: 150)
                                .overlay(Image(systemName: "plus").font(.system(size: 17, weight: .semibold)).foregroundStyle(KColor.text))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Nueva colección")
                        RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous).fill(KColor.s2).frame(width: 100, height: 150)
                        RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous).fill(KColor.s2).frame(width: 100, height: 150).opacity(0.5)
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 20)
                    .padding(.horizontal, 14)
                }
                .background(KColor.s1)
                .clipShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                .padding(.horizontal, 12)

                VStack(alignment: .leading, spacing: 12) {
                    Text("aquí va lo que más vale.")
                        .font(.kura.emptyPhrase)
                        .foregroundStyle(KColor.text)
                    Text("Empieza por lo que no puedes dejar de recomendar. Una colección puede mezclar cine, series y música.")
                        .font(.kura.ui(15))
                        .lineSpacing(4)
                        .foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 28)
                GlassButton(title: "Nueva colección", systemImage: "plus") {
                    store.present(.newCollection(addingTitleID: nil))
                }
                .padding(.horizontal, 28)
            }
            Spacer(minLength: 0)
            Color.clear.frame(height: 120)
        }
        .ignoresSafeArea(.container, edges: .top)
    }
}

// MARK: - O2a Nueva colección

struct NewCollectionSheet: View {
    @Environment(AppStore.self) private var store
    let addingTitleID: String?
    var movingFrom: String? = nil
    @State private var name = ""
    @State private var privacy: Privacy = .followers
    @State private var privacySeeded = false
    @State private var choosingPrivacy = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SheetHeader(title: "nueva colección") { store.dismissSheet() }
            VStack(spacing: 14) {
                GlassField(placeholder: "ponle nombre", text: $name, serif: true, focus: $focused)
                    .submitLabel(.done)
                    .onSubmit(create)
                if choosingPrivacy {
                    VStack(spacing: 0) {
                        ForEach(Privacy.options) { p in
                            PrivacyOptionRow(privacy: p, selected: p == privacy) {
                                privacy = p
                                withAnimation(KMotion.short) { choosingPrivacy = false }
                            }
                        }
                    }
                } else {
                    Button {
                        focused = false
                        withAnimation(KMotion.short) { choosingPrivacy = true }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "person.2.fill").font(.system(size: 15))
                            Text("Quién la ve").font(.kura.ui(16, .medium))
                            Spacer()
                            Text(privacy.label).font(.kura.ui(15)).foregroundStyle(KColor.text2)
                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(KColor.text2)
                        }
                        .foregroundStyle(KColor.text)
                        .padding(.horizontal, 4)
                        .frame(minHeight: 56)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                SolidButton(title: "Crear", enabled: !name.trimmingCharacters(in: .whitespaces).isEmpty, action: create)
            }
            .padding(.top, 6)
        }
        .padding(.horizontal, 20)
        .onAppear {
            focused = true
            if !privacySeeded { privacySeeded = true; privacy = store.defaultPrivacy }
        }
    }

    private func create() {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let id = store.createCollection(name: name, privacy: privacy, adding: addingTitleID)
        store.dismissSheet()
        if let from = movingFrom, let tid = addingTitleID, let c = store.collection(id) {
            store.removeSilently(tid, from: from)
            store.showToast(ToastModel(text: "Movido a \(c.name)", kind: .info))
        } else if addingTitleID == nil {
            store.push(.collection(id))
        } else if let c = store.collection(id) {
            store.showToast(ToastModel(text: "Guardado en \(c.name)", kind: .info))
        }
    }
}

struct PrivacyOptionRow: View {
    let privacy: Privacy
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: privacy.symbol)
                    .font(.system(size: 16))
                    .foregroundStyle(KColor.text)
                    .frame(width: 40, height: 40)
                    .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(privacy.label).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                    Text(privacy.note).font(.kura.ui(13)).foregroundStyle(KColor.text2)
                }
                Spacer()
                RadioMark(on: selected)
            }
            .padding(.horizontal, 4)
            .frame(minHeight: 68)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Mantener presionado una card

struct CollectionQuickSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String

    var body: some View {
        if let c = store.collection(collectionID) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(c.name).font(.kura.news(24)).foregroundStyle(KColor.text)
                    Spacer()
                    Text("\(c.titleIDs.count) títulos · \(c.privacy.label)").monoLabel()
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 8)
                SheetRow(systemImage: c.pinned ? "pin.slash" : "pin", label: c.pinned ? "Desfijar" : "Fijar") {
                    store.dismissSheet(); store.togglePin(c.id)
                }
                SheetRow(systemImage: "plus", label: "Agregar títulos") {
                    store.present(.addTitles(c.id))
                }
                SheetRow(systemImage: "square.and.arrow.up", label: "Compartir") {
                    store.present(.share(c.id))
                }
                SheetRow(systemImage: "pencil", label: "Renombrar") {
                    store.present(.rename(c.id))
                }
            }
            .padding(.horizontal, 12)
        }
    }
}
