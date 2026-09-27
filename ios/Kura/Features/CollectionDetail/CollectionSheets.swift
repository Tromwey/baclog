import SwiftUI

// MARK: - 18a Opciones · 9a Mantener el abanico

/// ONE options sheet per collection, the same wherever you come from (propuesta 9: "una sola hoja
/// de Opciones por rol"). The name 24 + "N títulos", then Agregar títulos · Compartir ·
/// Fijar/Desfijar · — · [Ver como lista · Ordenar · Reordenar ·] Renombrar · Privacidad · — ·
/// Borrar colección. `full` (Opciones, the ⋯ chip in 10a/10b) carries the VIEW rows (Reordenar
/// only with 2+ titles; it left the body, founder 2026-09-27); holding a fan (9a: Tus
/// colecciones, your own profile) leaves them out — they change the view of a screen you're not on.
struct CollectionOptionsSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String
    var full = true

    var body: some View {
        if let c = store.collection(collectionID) {
            let n = c.titleIDs.count
            VStack(spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(c.name).font(.kura.news(24)).foregroundStyle(KColor.text).lineLimit(1)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    Text("\(n) \(n == 1 ? "título" : "títulos")").monoLabel()
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 10)
                SheetRow(systemImage: "plus", label: "Agregar títulos") { store.present(.addTitles(c.id)) }
                SheetRow(systemImage: "square.and.arrow.up", label: "Compartir") { store.present(.share(c.id)) }
                SheetRow(systemImage: c.pinned ? "pin.slash" : "pin", label: c.pinned ? "Desfijar" : "Fijar",
                         action: { store.dismissSheet(); store.togglePin(c.id) }) {
                    if c.pinned { Text("fijada").monoLabel(color: KColor.text3) }
                }
                SheetDivider()
                if full {
                    SheetRow(systemImage: c.layout == .list ? "square.grid.3x2" : "list.bullet",
                             label: c.layout == .list ? "Ver en columnas" : "Ver como lista") {
                        store.dismissSheet()
                        withAnimation(KMotion.short) { store.setLayout(c.id, c.layout == .list ? .covers : .list) }
                    }
                    SheetRow(systemImage: "arrow.up.arrow.down", label: "Ordenar", action: { store.present(.sort(c.id)) }) {
                        Text(c.sort.label).monoLabel(color: KColor.text3)
                    }
                    // Right after Ordenar: Ordenar picks how you LOOK at it (Manual is one of
                    // the modes), Reordenar edits that manual order — the one everyone sees.
                    if n > 1 {
                        SheetRow(systemImage: "line.3.horizontal", label: "Reordenar") { store.present(.reorder(c.id)) }
                    }
                }
                SheetRow(systemImage: "pencil", label: "Renombrar") { store.present(.rename(c.id)) }
                SheetRow(systemImage: "lock", label: "Privacidad", action: { store.present(.privacy(c.id)) }) {
                    Text(c.privacy.label).monoLabel(color: KColor.text3)
                }
                SheetDivider()
                SheetRow(systemImage: "trash", label: "Borrar colección") { store.present(.deleteCollection(c.id)) }
            }
            .padding(.horizontal, 12)
        }
    }
}

// MARK: - O3a Ordenar

/// Manual (the owner's order, set in Reordenar) first and default · Recientes · Título · Estado ·
/// Año. Per device.
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
                    } label: {
                        HStack(spacing: 14) {
                            Text(mode.label).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
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

// MARK: - O3b Reordenar

/// Every title of the collection in its manual order, each row with a grip: drag the grip (the
/// row follows the finger and the others make room), or use the ↑/↓ actions (VoiceOver: swipe up
/// or down on the row). "Guardar orden" writes the WHOLE order at once (`PUT …/order`) and puts
/// the view back on Manual; closing the sheet discards it. Twin of the web's `ReorderBody`.
struct ReorderSheet: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    let collectionID: String
    @State private var order: [String] = []
    @State private var seeded = false
    @State private var drag: (from: Int, dy: CGFloat)? = nil

    private let rowH: CGFloat = 64

    var body: some View {
        if let c = store.collection(collectionID) {
            VStack(alignment: .leading, spacing: 0) {
                SheetHeader(title: "reordenar") { store.dismissSheet() }
                    .padding(.horizontal, 20)
                Text("Arrastra desde las rayas. Así se ve la colección para todos.")
                    .font(.kura.ui(13))
                    .foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 10)
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        ForEach(Array(order.enumerated()), id: \.element) { i, id in
                            if let t = store.title(id) { row(t, i) }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
                .scrollDisabled(drag != nil)
                SolidButton(title: "Guardar orden") {
                    store.reorder(c.id, to: order)
                    store.dismissSheet()
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 34)
            }
            .onAppear {
                guard !seeded else { return }
                seeded = true
                order = c.titleIDs
            }
        }
    }

    /// Where the dragged row would land.
    private var target: Int {
        guard let drag else { return -1 }
        return max(0, min(order.count - 1, drag.from + Int((drag.dy / rowH).rounded())))
    }

    private func row(_ t: Title, _ i: Int) -> some View {
        let dragging = drag?.from == i
        var shift: CGFloat = 0
        if let drag, !dragging {
            if drag.from < i && i <= target { shift = -rowH } else if target <= i && i < drag.from { shift = rowH }
        }
        let album = t.format == .album
        return HStack(spacing: 14) {
            CoverView(title: t, width: album ? 44 : 34, height: album ? 44 : 51, radius: KRadius.coverS, shadow: false)
                .frame(width: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(t.name).font(.kura.newsItalic(17)).foregroundStyle(KColor.text).lineLimit(1)
                Text("\(i + 1) · \(t.year.map(String.init) ?? t.format.metaLabel)").monoLabel(10)
            }
            Spacer(minLength: 8)
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(KColor.text2)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0, coordinateSpace: .global)
                        .onChanged { v in
                            if drag == nil { KHaptic.impact(.light) }
                            drag = (i, v.translation.height)
                        }
                        .onEnded { _ in
                            let to = target
                            if let from = drag?.from { move(from, to) }
                            drag = nil
                        }
                )
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 4)
        .frame(height: rowH)
        .background(dragging ? KColor.s2 : Color.clear, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
        .modifier(DragLift(on: dragging))
        .offset(y: dragging ? (drag?.dy ?? 0) : shift)
        .zIndex(dragging ? 1 : 0)
        .animation(dragging || reduce ? nil : KMotion.snappy, value: shift)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(t.name). Posición \(i + 1) de \(order.count)")
        .accessibilityHint("Desliza hacia arriba o abajo para moverlo.")
        .accessibilityAdjustableAction { dir in
            switch dir {
            case .increment: if i < order.count - 1 { move(i, i + 1) }
            case .decrement: if i > 0 { move(i, i - 1) }
            @unknown default: break
            }
        }
        .accessibilityAction(named: "Subir") { if i > 0 { move(i, i - 1) } }
        .accessibilityAction(named: "Bajar") { if i < order.count - 1 { move(i, i + 1) } }
    }

    private func move(_ from: Int, _ to: Int) {
        guard from != to, order.indices.contains(from), order.indices.contains(to) else { return }
        let id = order.remove(at: from)
        order.insert(id, at: to)
        KHaptic.select()
    }
}

/// The lifted row while it's dragged (dark depth shadow, allowed).
private struct DragLift: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.kShadow(.float) } else { content }
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

// MARK: - O5 Compartir

struct ShareCollectionSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String

    var body: some View {
        if let c = store.collection(collectionID) {
            // `/{you}/{collectionId}` — nil while it would 404 (private profile, "Solo yo", unsaved id).
            let url = store.myCollectionLink(c)
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
                        if let url {
                            Text(PublicLinks.display(url)).font(.kura.mono(12)).foregroundStyle(KColor.text)
                                .lineLimit(1).truncationMode(.middle)
                        }
                    }
                    .padding(16)
                    Spacer(minLength: 0)
                }
                .background(store.palette(of: c).map { AnyShapeStyle(Tint.card($0)) } ?? AnyShapeStyle(KColor.s1))
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))

                if url == nil {
                    Text(unshareableNote(c))
                        .font(.kura.ui(14)).foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 8).padding(.top, 14).padding(.bottom, 8)
                }
                if let url { HStack(spacing: 8) {
                    shareAction("link", "Copiar link") {
                        UIPasteboard.general.string = url.absoluteString
                        store.dismissSheet()
                        store.showToast(ToastModel(text: "Link copiado", kind: .info))
                    }
                    ShareLink(item: url) {
                        roundLabel("rectangle.portrait", "Historia")
                    }
                    .buttonStyle(.plain)
                    ShareLink(item: url) {
                        roundLabel("ellipsis", "Más")
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 18) }
            }
            .padding(.horizontal, 20)
        }
    }

    /// Why there's no link (the web would answer 404, same as a collection that doesn't exist).
    private func unshareableNote(_ c: KCollection) -> String {
        if store.profilePrivate { return AppStore.privateProfileShareNote }
        if c.privacy == .onlyMe { return "Está en Solo yo. Cambia quién la ve en sus opciones para compartirla." }
        return "Todavía se está guardando. Inténtalo en un momento."
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
        }
    }
}

// MARK: - 18c Mantener presionado un título

/// 18c. `collectionID` nil = the reduced variant of 9b ("no puedo esperar", which is automatic:
/// no membership, no cover) — only Tu reacción and Reseñar, which open the reaction sheet (it
/// sends `preview` on its own for a title that hasn't come out).
struct TitleActionsSheet: View {
    @Environment(AppStore.self) private var store
    let titleID: String
    let collectionID: String?

    var body: some View {
        let c = collectionID.flatMap { store.collection($0) }
        if let t = store.title(titleID), collectionID == nil || c != nil {
            VStack(alignment: .leading, spacing: 2) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(t.name).font(.kura.newsItalic(22)).foregroundStyle(KColor.text)
                    Text([t.format.metaLabel, t.year.map(String.init), t.creatorShort]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).monoLabel()
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 10)

                if let c {
                    if store.isUnreleased(t) {
                        SheetRow(systemImage: "clock", label: "La vi en preestreno", glyph: .clock) {
                            store.present(.complete(titleID: t.id, focusReview: false))
                        }
                    } else {
                        reactionRows(t)
                    }
                    // The CHOSEN cover (not just the first in the order) can go back to automatic.
                    let isCover = c.chosenCoverTitleID == t.id
                    SheetRow(systemImage: "photo", label: isCover ? "Portada automática" : "Usar como portada",
                             action: {
                                 store.dismissSheet()
                                 store.setCover(c.id, titleID: isCover ? nil : t.id)
                             }) {
                        if isCover { Text("portada").monoLabel() }
                    }
                    SheetRow(systemImage: "arrow.right", label: "Mover a otra colección") {
                        store.present(.moveTo(titleID: t.id, fromID: c.id))
                    }
                    SheetDivider()
                    SheetRow(systemImage: "minus", label: "Quitar de la colección") {
                        store.dismissSheet()
                        store.remove(t.id, from: c.id)
                    }
                } else {
                    reactionRows(t)
                }
            }
            .padding(.horizontal, 12)
        }
    }

    @ViewBuilder private func reactionRows(_ t: Title) -> some View {
        let m = store.mark(t.id)
        SheetRow(systemImage: "checkmark", label: "Tu reacción", glyph: m?.glyph ?? .check,
                 action: { store.present(.complete(titleID: t.id, focusReview: false)) }) {
            Text(m?.myLabel ?? "Completar").monoLabel(color: KColor.text3)
        }
        SheetRow(systemImage: "text.bubble", label: store.myReview(t.id) == nil ? "Reseñar" : "Editar reseña") {
            store.present(.complete(titleID: t.id, focusReview: true))
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
                        NewCollectionRow {
                            store.present(.newCollection(addingTitleID: t.id, movingFrom: fromID))
                        }

                        ForEach(store.orderedCollections) { c in
                            let here = c.id == fromID
                            let already = !here && c.titleIDs.contains(t.id)
                            FanPickRow(name: c.name, covers: store.fan(of: c), count: c.titleIDs.count,
                                       on: here || target == c.id,
                                       note: here ? "aquí está" : already ? "ya está" : nil,
                                       disabled: here) {
                                target = c.id
                                KHaptic.select()
                            }
                        }
                    }
                }
                .frame(maxHeight: 288)

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
