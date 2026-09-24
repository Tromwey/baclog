import SwiftUI

// MARK: - 18a Más

struct MoreSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String

    var body: some View {
        if let c = store.collection(collectionID) {
            VStack(spacing: 2) {
                SheetRow(systemImage: "plus", label: "Agregar títulos") { store.present(.addTitles(c.id)) }
                SheetRow(systemImage: c.pinned ? "pin.slash" : "pin", label: c.pinned ? "Desfijar" : "Fijar") {
                    store.dismissSheet(); store.togglePin(c.id)
                }
                SheetRow(systemImage: "square.and.arrow.up", label: "Compartir") { store.present(.share(c.id)) }
                Color.clear.frame(height: 8)
                SheetRow(systemImage: c.layout == .list ? "square.grid.2x2" : "list.bullet",
                         label: c.layout == .list ? "Ver como portadas" : "Ver como lista") {
                    store.dismissSheet()
                    withAnimation(KMotion.short) { store.setLayout(c.id, c.layout == .list ? .covers : .list) }
                }
                SheetRow(systemImage: "arrow.up.arrow.down", label: "Ordenar", action: { store.present(.sort(c.id)) }) {
                    Text(c.sort.label).monoLabel()
                }
                SheetRow(systemImage: "photo", label: "Cambiar portada", action: {
                    store.dismissSheet(); store.push(.changeCover(c.id))
                }) {
                    if let t = store.coverTitle(of: c) {
                        CoverView(title: t, width: 32, height: 32, radius: KRadius.coverS, shadow: false)
                    }
                }
                SheetRow(systemImage: "pencil", label: "Renombrar") { store.present(.rename(c.id)) }
                SheetRow(systemImage: "lock", label: "Privacidad", action: { store.present(.privacy(c.id)) }) {
                    Text(c.privacy.label).monoLabel()
                }
                Color.clear.frame(height: 8)
                SheetRow(systemImage: "trash", label: "Borrar colección") { store.present(.deleteCollection(c.id)) }
            }
            .padding(.horizontal, 12)
        }
    }
}

// MARK: - O3a Ordenar

struct SortSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String

    var body: some View {
        if let c = store.collection(collectionID) {
            VStack(alignment: .leading, spacing: 6) {
                SheetHeader(title: "ordenar")
                ForEach(SortMode.allCases) { mode in
                    Button {
                        store.setSort(c.id, mode)
                        store.dismissSheet()
                        if mode == .manual { store.push(.reorder(c.id)) }
                    } label: {
                        HStack(spacing: 14) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(mode.label).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                                if let note = mode.note {
                                    Text(note).font(.kura.ui(13)).foregroundStyle(KColor.text2)
                                }
                            }
                            Spacer()
                            RadioMark(on: c.sort == mode)
                        }
                        .padding(.horizontal, 4)
                        .frame(minHeight: 56)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(c.sort == mode ? .isSelected : [])
                }
            }
            .padding(.horizontal, 20)
        }
    }
}

// MARK: - O3b Modo ordenar

struct ReorderView: View {
    @Environment(AppStore.self) private var store
    let collectionID: String

    var body: some View {
        if let c = store.collection(collectionID) {
            VStack(spacing: 0) {
                HStack {
                    Text("ordenar · \(c.name)")
                        .font(.kura.news(22))
                        .foregroundStyle(KColor.text)
                        .lineLimit(1)
                    Spacer()
                    Button { store.pop() } label: {
                        Text("Listo")
                            .font(.kura.ui(15, .semibold))
                            .foregroundStyle(KColor.bg)
                            .padding(.vertical, 10)
                            .padding(.horizontal, 16)
                            .background(KColor.text, in: Capsule())
                    }
                    .kPress()
                }
                .padding(.horizontal, 20)
                .padding(.top, KSize.chromeTop)
                .padding(.bottom, 18)

                List {
                    ForEach(c.titleIDs, id: \.self) { id in
                        if let t = store.title(id) {
                            HStack(spacing: 14) {
                                CoverView(title: t, width: 44, height: 66, radius: KRadius.coverS)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(t.name).font(.kura.newsItalic(18)).foregroundStyle(KColor.text).lineLimit(1)
                                    if let c = t.lowerCreator { Text(c).font(.kura.ui(14)).foregroundStyle(KColor.text2) }
                                }
                                Spacer(minLength: 0)
                            }
                            .frame(minHeight: 84)
                            .listRowBackground(KColor.bg)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 12))
                        }
                    }
                    .onMove { from, to in store.reorder(c.id, from: from, to: to) }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .environment(\.editMode, .constant(.active))
            }
            .background(KColor.bg)
            .ignoresSafeArea(.container, edges: .top)
        }
    }
}

// MARK: - O2b Renombrar

struct RenameSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String
    @State private var name = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SheetHeader(title: "renombrar") { store.dismissSheet() }
            VStack(alignment: .leading, spacing: 14) {
                GlassField(placeholder: "nombre", text: $name, serif: true, clearable: true, focus: $focused)
                    .submitLabel(.done)
                    .onSubmit(save)
                Text("Los links que ya compartiste siguen funcionando.")
                    .font(.kura.ui(13))
                    .foregroundStyle(KColor.text2)
                    .padding(.horizontal, 4)
                SolidButton(title: "Guardar", enabled: !name.trimmingCharacters(in: .whitespaces).isEmpty, action: save)
            }
            .padding(.top, 6)
        }
        .padding(.horizontal, 20)
        .onAppear {
            name = store.collection(collectionID)?.name ?? ""
            focused = true
        }
    }

    private func save() {
        store.rename(collectionID, to: name)
        store.dismissSheet()
    }
}

// MARK: - K1a Quién ve la colección

struct PrivacySheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String

    var body: some View {
        if let c = store.collection(collectionID) {
            VStack(alignment: .leading, spacing: 6) {
                SheetHeader(title: "quién ve \(c.name)")
                ForEach(Privacy.options) { p in
                    PrivacyOptionRow(privacy: p, selected: c.privacy == p) {
                        store.setPrivacy(c.id, p)
                        store.dismissSheet()
                    }
                }
            }
            .padding(.horizontal, 20)
        }
    }
}

// MARK: - 18b Cambiar portada

struct ChangeCoverView: View {
    @Environment(AppStore.self) private var store
    let collectionID: String
    @State private var chosen: String?

    var body: some View {
        if let c = store.collection(collectionID) {
            let titles = store.titles(in: c)
            let current = chosen.flatMap { store.title($0) } ?? store.coverTitle(of: c)
            ZStack(alignment: .top) {
                KColor.bg.ignoresSafeArea()
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        VStack(spacing: 12) {
                            if let current {
                                CoverView(title: current, height: 240)
                                    .animation(KMotion.spring, value: current.id)
                            }
                            Text(c.name).font(.kura.news(24)).foregroundStyle(KColor.text).padding(.top, 8)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 124)
                        .padding(.bottom, 28)
                        .background(Tint.header(current?.palette ?? []).animation(.easeInOut(duration: 0.3), value: current?.id))

                        VStack(alignment: .leading, spacing: 14) {
                            Text("Elige la portada. Su color tiñe la cabecera y la card en tus colecciones.")
                                .font(.kura.ui(14))
                                .foregroundStyle(KColor.text2)
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .bottom), count: 3),
                                      spacing: 16) {
                                ForEach(titles) { t in
                                    let on = t.id == current?.id
                                    Button {
                                        withAnimation(KMotion.tint) { chosen = t.id }
                                        UISelectionFeedbackGenerator().selectionChanged()
                                    } label: {
                                        CoverView(title: t, radius: KRadius.coverS, badge: on ? .chosen : .none, fluid: true)
                                            .opacity(on ? 1 : 0.55)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Usar \(t.name) como portada")
                                    .accessibilityAddTraits(on ? .isSelected : [])
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 22)
                        .padding(.bottom, 48)
                    }
                }
                .ignoresSafeArea(.container, edges: .top)

                HStack {
                    IconChip44(systemName: "xmark", iconSize: 15, label: "Cancelar") { store.pop() }
                    Spacer()
                    Button {
                        if let chosen, chosen != c.coverTitleID { store.setCover(c.id, titleID: chosen) }
                        store.pop()
                    } label: {
                        Text("Listo")
                            .font(.kura.ui(15, .semibold))
                            .foregroundStyle(KColor.text)
                            .padding(.horizontal, 18)
                            .frame(height: 44)
                            .background(KColor.glassBg, in: Capsule())
                    }
                    .kPress()
                }
                .padding(.horizontal, KSize.chromeSide)
                .padding(.top, KSize.chromeTop)
                .ignoresSafeArea(.container, edges: .top)
            }
        }
    }
}

// MARK: - O5 Compartir

struct ShareCollectionSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String

    var body: some View {
        if let c = store.collection(collectionID) {
            let link = "kura.app/c/\(c.slug)"
            let url = URL(string: "https://\(link)")!
            VStack(alignment: .leading, spacing: 6) {
                SheetHeader(title: "compartir")
                HStack(spacing: 0) {
                    SpineLabel(text: c.name, height: 150)
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            ForEach(store.titles(in: c).prefix(3)) { t in
                                CoverView(title: t, width: 72, height: 72, radius: 10)
                            }
                        }
                        Text("de @\(store.me.handle) · \(c.titleIDs.count) \(c.titleIDs.count == 1 ? "título" : "títulos")")
                            .font(.kura.ui(13))
                            .foregroundStyle(KColor.text2)
                        Text(link).font(.kura.mono(12)).foregroundStyle(KColor.text)
                    }
                    .padding(16)
                    Spacer(minLength: 0)
                }
                .background(store.palette(of: c).map { AnyShapeStyle(Tint.card($0)) } ?? AnyShapeStyle(KColor.s1))
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))

                HStack(spacing: 8) {
                    shareAction("link", "Copiar link") {
                        UIPasteboard.general.string = url.absoluteString
                        store.dismissSheet()
                        store.showToast(ToastModel(text: "Link copiado", kind: .info))
                    }
                    ShareLink(item: url, message: Text("\(c.name) en kura")) {
                        roundLabel("rectangle.portrait", "Historia")
                    }
                    .buttonStyle(.plain)
                    ShareLink(item: url) {
                        roundLabel("ellipsis", "Más")
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 18)
            }
            .padding(.horizontal, 20)
        }
    }

    private func shareAction(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { roundLabel(icon, label) }.buttonStyle(.plain)
    }

    private func roundLabel(_ icon: String, _ label: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(KColor.text)
                .frame(width: 60, height: 60)
                .background(KColor.glassBg, in: Circle())
            Text(label).font(.kura.ui(13, .medium)).foregroundStyle(KColor.text)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - 35a Borrar colección (the one destructive confirmation)

struct DeleteCollectionSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String

    var body: some View {
        if let c = store.collection(collectionID) {
            let n = c.titleIDs.count
            VStack(alignment: .leading, spacing: 6) {
                Text("¿borrar \(c.name)?")
                    .font(.kura.news(26))
                    .foregroundStyle(KColor.text)
                    .padding(.horizontal, 8)
                Text(n == 0
                     ? "Está vacía. Solo se borra esta colección. No se puede deshacer."
                     : "\(n == 1 ? "El título conserva su estado" : "Los \(n) títulos conservan su estado") y siguen en tus otras colecciones. Solo se borra esta. No se puede deshacer.")
                    .font(.kura.ui(15))
                    .lineSpacing(4)
                    .foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 8)
                    .padding(.top, 4)
                    .padding(.bottom, 14)
                SolidButton(title: "Borrar colección") {
                    store.dismissSheet()
                    store.deleteCollection(c.id)
                }
                Button { store.dismissSheet() } label: {
                    Text("Cancelar")
                        .font(.kura.ui(16, .medium))
                        .foregroundStyle(KColor.text)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .accessibilityAddTraits(.isModal)
        }
    }
}

// MARK: - 18c Mantener presionado un título

struct TitleActionsSheet: View {
    @Environment(AppStore.self) private var store
    let titleID: String
    let collectionID: String

    var body: some View {
        if let t = store.title(titleID), let c = store.collection(collectionID) {
            VStack(alignment: .leading, spacing: 2) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(t.name).font(.kura.newsItalic(22)).foregroundStyle(KColor.text)
                    Text([t.format.metaLabel, t.year.map(String.init), t.creatorShort]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).monoLabel()
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 10)

                if store.isUnreleased(t) {
                    SheetRow(systemImage: "clock", label: "La vi en preestreno", glyph: .clock) {
                        store.present(.complete(titleID: t.id, focusReview: false))
                    }
                } else {
                    let m = store.mark(t.id)
                    SheetRow(systemImage: "checkmark", label: "Tu reacción", glyph: m?.glyph ?? .check,
                             action: { store.present(.complete(titleID: t.id, focusReview: false)) }) {
                        Text(m?.myLabel ?? "Completar").monoLabel()
                    }
                    SheetRow(systemImage: "text.bubble", label: store.myReview(t.id) == nil ? "Reseñar" : "Editar reseña") {
                        store.present(.complete(titleID: t.id, focusReview: true))
                    }
                }
                if c.coverTitleID != t.id {
                    SheetRow(systemImage: "photo", label: "Usar como portada") {
                        store.dismissSheet()
                        store.setCover(c.id, titleID: t.id)
                    }
                }
                SheetRow(systemImage: "arrow.right", label: "Mover a otra colección") {
                    store.present(.moveTo(titleID: t.id, fromID: c.id))
                }
                Color.clear.frame(height: 8)
                SheetRow(systemImage: "minus", label: "Quitar de la colección") {
                    store.dismissSheet()
                    store.remove(t.id, from: c.id)
                }
            }
            .padding(.horizontal, 12)
        }
    }
}

// MARK: - O4a Mover a

struct MoveToSheet: View {
    @Environment(AppStore.self) private var store
    let titleID: String
    let fromID: String
    @State private var target: String?

    var body: some View {
        if let t = store.title(titleID) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 14) {
                    CoverView(title: t, width: 44, height: t.format == .album ? 44 : 66, radius: KRadius.coverS)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(t.name).font(.kura.newsItalic(20)).foregroundStyle(KColor.text).lineLimit(1)
                        Text([t.format.metaLabel, t.year.map(String.init)].compactMap { $0 }.joined(separator: " · ")).monoLabel()
                    }
                }
                .padding(.bottom, 12)

                Text("mover a").monoLabel().padding(.bottom, 4)

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        Button {
                            store.present(.newCollection(addingTitleID: t.id, movingFrom: fromID))
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: "plus").font(.system(size: 16, weight: .semibold))
                                    .frame(width: 40, height: 40)
                                    .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: KRadius.coverS, style: .continuous))
                                Text("Nueva colección").font(.kura.ui(16, .medium))
                                Spacer()
                            }
                            .foregroundStyle(KColor.text)
                            .frame(minHeight: 56)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        ForEach(store.orderedCollections) { c in
                            let here = c.id == fromID
                            let already = !here && c.titleIDs.contains(t.id)
                            Button {
                                guard !here else { return }
                                target = c.id
                                UISelectionFeedbackGenerator().selectionChanged()
                            } label: {
                                HStack(spacing: 14) {
                                    CollectionThumb(collection: c)
                                    Text(c.name).font(.kura.news(19)).foregroundStyle(KColor.text).lineLimit(1)
                                    Spacer()
                                    if here { Text("aquí está").monoLabel(10) }
                                    else if already { Text("ya está").monoLabel(10) }
                                    RadioMark(on: here || target == c.id)
                                }
                                .frame(minHeight: 56)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .opacity(here ? 0.45 : 1)
                        }
                    }
                }
                .frame(maxHeight: 300)

                SolidButton(title: "Mover", enabled: target != nil) {
                    guard let target else { return }
                    store.dismissSheet()
                    store.move(t.id, from: fromID, to: target)
                }
                .padding(.top, 10)
            }
            .padding(.horizontal, 20)
        }
    }
}

/// 40 pt thumbnail for a collection row (its cover, or an empty s2 tile).
struct CollectionThumb: View {
    @Environment(AppStore.self) private var store
    let collection: KCollection
    var body: some View {
        Group {
            if let t = store.coverTitle(of: collection) {
                CoverImage(url: t.coverURL, palette: t.palette)
            } else {
                KColor.s1
            }
        }
        .frame(width: 40, height: 40)
        .clipShape(RoundedRectangle(cornerRadius: KRadius.coverS, style: .continuous))
    }
}
