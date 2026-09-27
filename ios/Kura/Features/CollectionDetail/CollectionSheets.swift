import SwiftUI

// MARK: - 18a Opciones · 9a Mantener el abanico

/// ONE options sheet per collection, the same wherever you come from (propuesta 9: "una sola hoja
/// de Opciones por rol"). The name 24 + "N títulos", then Agregar títulos · Compartir ·
/// Fijar/Desfijar · — · [Ver como lista · Ordenar · Editar el orden ·] Editar (nombre y frase) · Quién la ve
/// · — · Borrar colección. `full` (Opciones, the ⋯ chip in 10a/10b) carries the VIEW rows (Editar el
/// orden only with 2+ titles; it left the body, founder 2026-09-27); holding a fan (9a: Tus
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
                        // The store flips what the collection has NOW — never the `c` this row
                        // captured when the sheet last rendered (a stale copy = one step behind).
                        withAnimation(KMotion.short) { store.toggleLayout(c.id) }
                    }
                    SheetRow(systemImage: "arrow.up.arrow.down", label: "Ordenar", action: { store.present(.sort(c.id)) }) {
                        Text(c.sort.label).monoLabel(color: KColor.text3)
                    }
                    // Right after Ordenar: Ordenar picks how YOU look at it (Manual is one of the
                    // modes); this edits that manual order — the one everyone sees. Two verbs
                    // that read apart, with the difference said on the row (critica 2026-09-27 #8;
                    // it was "Ordenar" / "Reordenar").
                    if n > 1 {
                        SheetRow(systemImage: "line.3.horizontal", label: "Editar el orden",
                                 action: { store.present(.reorder(c.id)) }) {
                            Text("el que ven todos").monoLabel(color: KColor.text3)
                        }
                    }
                }
                SheetRow(systemImage: "pencil", label: "Editar") { store.present(.rename(c.id)) }
                // The one visibility vocabulary (`Privacy.label`: Solo yo · Con el link · En tu
                // perfil), asked the way Nueva colección asks it.
                SheetRow(systemImage: c.privacy.symbol, label: "Quién la ve", action: { store.present(.privacy(c.id)) }) {
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

/// "Editar el orden". Every title of the collection in its manual order, each row with a grip: drag the grip (the
/// row follows the finger and the others make room), or use the ↑/↓ actions (VoiceOver: swipe up
/// or down on the row). "Guardar orden" writes the WHOLE order at once (`PUT …/order`) and puts
/// the view back on Manual; closing the sheet discards it. Twin of the web's `ReorderBody`.
/// A compact sheet that hugs its rows (critica 2026-09-27 #28: full height, 5 titles left half of
/// it empty); the list scrolls past ~7 rows. Row meta = format · creator like the list — no
/// position (the order IS the position) and no year (founder: no year in a collection).
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
                SheetHeader(title: "editar el orden") { store.dismissSheet() }
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
                    .padding(.bottom, 4)
                }
                .frame(height: min(CGFloat(order.count) * rowH + 4, rowH * 7.5))
                .scrollDisabled(drag != nil)
                SolidButton(title: "Guardar orden") {
                    store.reorder(c.id, to: order)
                    store.dismissSheet()
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)
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
                Text([t.format.metaLabel, t.creator].compactMap { $0 }.filter { !$0.isEmpty }
                    .joined(separator: " · ")).monoLabel(10).lineLimit(1)
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
                            if drag == nil { KHaptic.play(.tap) }
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
        KHaptic.play(.selection)
    }
}

/// The lifted row while it's dragged (dark depth shadow, allowed).
private struct DragLift: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.kShadow(.float) } else { content }
    }
}

// MARK: - O2b Editar (nombre + frase)

/// The frame's O2b "renombrar" plus the collection's frase — the italic line under the name in
/// 10a/10b, the profile's vitrina, the public page and the OG card (`vibe` on the wire). The name
/// is required (1–60, lowercased like at creation); the frase is optional (≤ 80) and saving it
/// empty clears it. Both limits are the server's (`backlogNameSchema` / `backlogVibeSchema`).
struct EditCollectionSheet: View {
    @Environment(AppStore.self) private var store
    let collectionID: String
    @State private var name = ""
    @State private var vibe = ""
    @FocusState private var nameFocused: Bool
    @FocusState private var vibeFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SheetHeader(title: "editar") { store.dismissSheet() }
            VStack(alignment: .leading, spacing: 14) {
                // A mono label over each field, so once they're filled it still says which is
                // which; the frase wraps up to 3 lines with its count (critica 2026-09-27 #7).
                VStack(alignment: .leading, spacing: 6) {
                    Text("nombre").monoLabel(11).padding(.horizontal, 4).accessibilityHidden(true)
                    GlassField(placeholder: "ponle nombre", text: $name, serif: true, clearable: true,
                               focus: $nameFocused)
                        .submitLabel(.next)
                        .onSubmit { vibeFocused = true }
                        .accessibilityLabel("Nombre de la colección")
                        .onChange(of: name) { _, v in
                            if v.count > AppStore.collectionNameLimit { name = String(v.prefix(AppStore.collectionNameLimit)) }
                        }
                }
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("frase · opcional").monoLabel(11)
                        Spacer(minLength: 0)
                        Text("\(vibe.count)/\(AppStore.collectionVibeLimit)").monoLabel(11, color: KColor.text3)
                    }
                    .padding(.horizontal, 4)
                    .accessibilityHidden(true)
                    TextField("", text: $vibe, prompt: Text("una frase para esta colección").foregroundStyle(KColor.text3),
                              axis: .vertical)
                        .lineLimit(1...3)
                        .font(.kura.ui(16))
                        .foregroundStyle(KColor.text)
                        .tint(KColor.text)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .focused($vibeFocused)
                        .submitLabel(.done)
                        .onSubmit(save)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 15)
                        .frame(minHeight: 52)
                        .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: KRadius.field, style: .continuous))
                        .accessibilityLabel("Frase de la colección, opcional")
                        .onChange(of: vibe) { _, v in
                            // A vertical field takes Return as a newline: it means "done" here.
                            if v.contains("\n") { vibe = v.replacingOccurrences(of: "\n", with: ""); save(); return }
                            if v.count > AppStore.collectionVibeLimit { vibe = String(v.prefix(AppStore.collectionVibeLimit)) }
                        }
                }
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
            let c = store.collection(collectionID)
            name = c?.name ?? ""
            vibe = c?.vibe ?? ""
            nameFocused = true
        }
    }

    private func save() {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        store.editCollection(collectionID, name: name, vibe: vibe)
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
    /// "Solo yo" with no link: the who-sees-it choices open right here, and picking one that has
    /// a link shows the three share buttons in place (critica 2026-09-27 #4 — the note used to
    /// send you out to Opciones).
    @State private var choosing = false

    var body: some View {
        if let c = store.collection(collectionID) {
            // `/{you}/{collectionId}` — nil while it would 404 (private profile, "Solo yo", unsaved id).
            let url = store.myCollectionLink(c)
            VStack(alignment: .leading, spacing: 6) {
                SheetHeader(title: "compartir")
                SharePreviewCard(name: c.name, fan: store.fan(of: c), handle: store.me.handle,
                                 count: c.titleIDs.count, url: url, palette: store.palette(of: c))

                if url == nil {
                    Text(unshareableNote(c))
                        .font(.kura.ui(14)).foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 8).padding(.top, 14).padding(.bottom, 8)
                    if c.privacy == .onlyMe && !store.profilePrivate {
                        if choosing {
                            VStack(spacing: 0) {
                                ForEach(Privacy.options) { p in
                                    PrivacyOptionRow(privacy: p, selected: c.privacy == p) {
                                        withAnimation(KMotion.short) {
                                            store.setPrivacy(c.id, p)
                                            choosing = false
                                        }
                                    }
                                }
                            }
                        } else {
                            GlassButton(title: "Cambiar quién la ve", systemImage: c.privacy.symbol, flat: true) {
                                withAnimation(KMotion.short) { choosing = true }
                            }
                            .padding(.horizontal, 4)
                            .padding(.top, 4)
                        }
                    }
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
        if c.privacy == .onlyMe { return "Está en \(Privacy.onlyMe.label): nadie más la puede abrir. Cambia quién la ve para compartirla." }
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

/// What the link shows, in the fan's language (not the retired spine): the collection's mini fan
/// at 99 (the profile grid's size; one or two titles draw only those), the name in Newsreader, "de
/// @handle · N títulos" and the URL in mono, on the collection's tinted surface. No border.
///
/// This count is the "Guardar en"/"Mover a" family (it justifies which link you're sending) — the
/// one dropped (founder, 2026-09-27) is only the credits line above 10a/10b's format pills.
struct SharePreviewCard: View {
    let name: String
    let fan: [Title]
    let handle: String
    let count: Int
    let url: URL?
    let palette: [String]?

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            FanView(covers: fan, lead: 99, ghost: fan.isEmpty)
            VStack(alignment: .leading, spacing: 6) {
                Text(name)
                    .font(.kura.news(22))
                    .foregroundStyle(KColor.text)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text("de @\(handle) · \(count) \(count == 1 ? "título" : "títulos")")
                    .font(.kura.ui(13))
                    .foregroundStyle(KColor.text2)
                    .lineLimit(1)
                if let url {
                    Text(PublicLinks.display(url))
                        .font(.kura.mono(12))
                        .foregroundStyle(KColor.text)
                        // Cut at the HEAD ("…/mariel.ok/hermana"): the middle cut split the handle
                        // (critica 2026-09-27 #29).
                        .lineLimit(1).truncationMode(.head)
                        .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, 10).padding(.trailing, 16).padding(.vertical, 16)
        .background(palette.map { AnyShapeStyle(Tint.card($0)) } ?? AnyShapeStyle(KColor.s1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityElement(children: .combine)
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
                } else if store.isUnreleased(t) {
                    // Not out yet: nothing to complete or review — the release alert instead (the
                    // ficha's pill), and the preview mark like the in-collection branch above.
                    let on = store.alerts.contains(t.id)
                    SheetRow(systemImage: "clock", label: on ? "Te avisamos del estreno" : "Avísame del estreno",
                             glyph: on ? .check : .clock,
                             action: { store.toggleAlert(t.id) }) {
                        if let when = store.releaseLabel(t) { Text(when).monoLabel(color: KColor.text3) }
                    }
                    SheetRow(systemImage: "clock", label: "La vi en preestreno", iconColor: KColor.text2) {
                        store.present(.complete(titleID: t.id, focusReview: false))
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
        // Neutral (text-2) until there IS a reaction: a salvia check read as "ya completado".
        SheetRow(systemImage: "checkmark", label: "Tu reacción", iconColor: KColor.text2, glyph: m?.glyph,
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
                            // One choice: the radio dot. The collection it's in says "ya está", the
                            // same words as Guardar en (critica 2026-09-27 #33) — the one it leaves
                            // from is also dimmed and can't be picked.
                            FanPickRow(name: c.name, covers: store.fan(of: c), count: c.titleIDs.count,
                                       on: target == c.id,
                                       note: here || already ? "ya está" : nil,
                                       disabled: here, single: true) {
                                target = c.id
                                KHaptic.play(.selection)
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
