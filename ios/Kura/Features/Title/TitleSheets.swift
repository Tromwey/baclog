import SwiftUI

// MARK: - 26a Completar — slider "Listo. ¿Cómo te dejó?"

struct CompleteSheet: View {
    @Environment(AppStore.self) private var store
    let titleID: String
    let focusReview: Bool

    @State private var value: CGFloat = 0
    @State private var text = ""
    @State private var spoiler = false
    @State private var loaded = false
    @State private var saving = false
    @State private var saveError: String?
    @FocusState private var focused: Bool

    private let limit = 280

    private var stop: Int { min(2, max(0, Int(value.rounded()))) }

    /// The server unlocks reviews only with a reaction (`obsessed || verdict != null`): "Completo"
    /// saves `verdict = null`, so a NEW or edited review can't go out with it — and the review you
    /// already had is DELETED with the reaction (server, same transaction): that asks first
    /// (`ReviewLossSheet`).
    private static let reactionNeeded = "Para reseñar, elige Me gusta o Me obsesiona."

    private var trimmedReview: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var reviewChanged: Bool {
        guard let r = store.myReview(titleID) else { return !trimmedReview.isEmpty }
        return trimmedReview != r.text || spoiler != r.spoiler
    }

    /// Completo + a review to publish: nothing is sent, the sheet says why.
    private var reviewBlocked: Bool {
        ReactionSlider.stops[stop].mark == .completed && !trimmedReview.isEmpty && reviewChanged
    }

    var body: some View {
        if let t = store.title(titleID) {
            let s = ReactionSlider.stops[stop]
            VStack(alignment: .leading, spacing: 4) {
                Text("Listo. ¿Cómo te dejó?")
                    .font(.kura.news(28))
                    .foregroundStyle(KColor.text)
                    .padding(.horizontal, 10)
                    .padding(.top, 4)
                    .padding(.bottom, 16)
                    .accessibilityAddTraits(.isHeader)

                VStack(spacing: 12) {
                    Text(s.label)
                        .font(.kura.news(28))
                        .foregroundStyle(KColor.text)
                        .kScale(stop == 2 ? 1.06 : 1)
                        .kAnimation(KMotion.snappy, value: stop)
                        .contentTransition(.opacity)
                        .frame(height: 44)
                    ReactionSlider(value: $value)
                }
                .padding(.horizontal, 4)
                .padding(.top, 6)

                ZStack(alignment: .topLeading) {
                    TextEditor(text: $text)
                        .font(.kura.ui(15))
                        .foregroundStyle(KColor.text)
                        .scrollContentBackground(.hidden)
                        .tint(KColor.text)
                        .focused($focused)
                        .frame(minHeight: 72, maxHeight: 110)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 6)
                        .onChange(of: text) { _, new in
                            if new.count > limit { text = String(new.prefix(limit)) }
                        }
                    if text.isEmpty {
                        Text("Escribe tu reseña (opcional)")
                            .font(.kura.ui(15))
                            .foregroundStyle(KColor.text2)
                            .padding(.horizontal, 16)
                            .padding(.top, 14)
                            .allowsHitTesting(false)
                    }
                }
                .frame(minHeight: 96)
                .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
                .padding(.horizontal, 4)
                .padding(.top, 14)
                if !text.isEmpty {
                    Text("\(text.count)/\(limit)").font(.kura.mono(11)).foregroundStyle(KColor.text3)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.trailing, 8)
                }

                HStack(spacing: 14) {
                    Text("Contiene spoilers").font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                    Spacer()
                    KuraSwitch(label: "Contiene spoilers", isOn: $spoiler)
                }
                .padding(.horizontal, 8)
                .frame(minHeight: 52)
                .padding(.top, 6)

                if reviewBlocked {
                    Text(Self.reactionNeeded)
                        .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 8).padding(.top, 8)
                        .transition(.opacity)
                } else if let saveError {
                    Text(saveError)
                        .font(.kura.ui(13)).foregroundStyle(KColor.text)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 8).padding(.top, 8)
                        .transition(.opacity)
                }

                Button { save(t) } label: {
                    Group {
                        if saving { ProgressView().tint(KColor.text) }
                        else { Text(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Guardar" : "Publicar") }
                    }
                    .font(.kura.ui(16, .semibold))
                    .foregroundStyle(KColor.text)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(KColor.glassBg, in: Capsule())
                }
                .kPress()
                .disabled(saving)
                .padding(.horizontal, 4)
                .padding(.top, 14)

                if store.mark(titleID) != nil {
                    Button {
                        // Without a reaction the server deletes your review: ask first.
                        askBeforeLosingReview(nil) {
                            withAnimation(KMotion.spring) { store.setMark(titleID, nil) }
                            store.dismissSheet()
                        }
                    } label: {
                        Text("Quitar completado")
                            .font(.kura.ui(15, .medium))
                            .foregroundStyle(KColor.text2)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 12)
            .onAppear {
                guard !loaded else { return }
                loaded = true
                switch store.mark(titleID) {
                case .liked: value = 1
                case .obsessed: value = 2
                default: value = 0
                }
                if let r = store.myReview(titleID) {
                    text = r.text
                    spoiler = r.spoiler
                }
                if focusReview { focused = true }
            }
            // The ficha says whether you have a review (and brings its text) when the library
            // state alone doesn't: the question before a mark that deletes it depends on that.
            .task { await store.loadTitle(titleID) }
            .onChange(of: store.myReview(titleID)?.id) { old, _ in
                // It arrived after the sheet opened and nothing was typed: show it, so saving an
                // empty field doesn't delete a review you never saw.
                guard old == nil, !saving, text.isEmpty, let r = store.myReview(titleID) else { return }
                text = r.text
                spoiler = r.spoiler
            }
        }
    }

    /// "tu reseña se borra con la reacción." needs to KNOW whether you have a review. Usually it
    /// does (`GET /me/titles` carries `reviewId`; the sheet also reads the ficha as it opens). If
    /// neither has answered yet, a mark that would delete one waits for the ficha (the button
    /// spins) instead of going out unasked. Only a read that FAILED lets the mark through without
    /// the question: there is nothing to ask about, and offline the mark won't land either.
    private func askBeforeLosingReview(_ mark: Mark?, send: @escaping @MainActor () -> Void) {
        let decide: @MainActor () -> Void = {
            if ReviewHold<Review>.needsConfirmation(hasReview: store.hasOwnReview(titleID), mark: mark?.rawValue) {
                store.present(.reviewLoss(titleID: titleID, mark: mark))
            } else {
                send()
            }
        }
        guard ReviewHold<Review>.leavesNoReaction(mark?.rawValue), !store.ownReviewKnown(titleID) else { decide(); return }
        saving = true
        Task {
            await store.ensureOwnReviewKnown(titleID)
            saving = false
            // Closed meanwhile: nothing was sent, nothing to ask.
            guard case .complete(let id, _)? = store.sheet, id == titleID else { return }
            decide()
        }
    }

    private func save(_ t: Title) {
        let choice = ReactionSlider.stops[stop].mark
        // "La vi en preestreno": the server needs `preview: true` before the release (409 not_released otherwise).
        // Release day counts too: the app decides by Mexico City calendar day, the server by the
        // stored instant — an album keeps iTunes' hour (07/08/12Z), so for a few hours of "hoy" the
        // server still says upcoming. `preview` only lifts that gate; it isn't stored.
        let preview = store.isUnreleased(t) || store.isReleaseDay(t)
        let review = trimmedReview
        // Completo can't carry a new review (409 `reaction_required`): send nothing, the note says why.
        if reviewBlocked {
            KHaptic.play(.warning)
            return
        }
        let done = { store.dismissSheet() }
        // No review (or an unchanged one under Completo): fire-and-forget, as before (the store
        // reverts/retries on its own, and once the server confirms it suggests "Guardar en…" for
        // a title in no collection — the mark stands either way).
        guard !review.isEmpty, choice != .completed else {
            // "Completo" leaves the title without a reaction, and the review goes with it (no
            // undo on the server): the confirmation sheet takes over and sends the mark itself.
            askBeforeLosingReview(choice) {
                withAnimation(KMotion.spring) { store.setMark(t.id, choice, haptic: false, preview: preview) }
                // Emptying an existing review and saving deletes it (with its own Deshacer);
                // saving only the mark would leave the old text published.
                if review.isEmpty, store.myReview(t.id) != nil { store.deleteReview(titleID: t.id) }
                done()
            }
            return
        }
        // With a review: the server needs the reaction first (`409 reaction_required`), so the
        // review goes out only once the mark is confirmed; if the mark fails the text stays here.
        // The mark is ALWAYS confirmed first, even if it already matches locally: the local one may
        // be optimistic and not yet on the server, and the PUT is idempotent.
        saving = true
        store.sheetLocked = true
        saveError = nil
        Task {
            let failure = await store.setMarkConfirmed(t.id, choice, preview: preview)
            saving = false
            store.sheetLocked = false
            if let failure {
                // The sheet may be gone anyway (the session ended, another sheet took its place):
                // then the error goes to a toast instead of vanishing with it.
                let stillOpen: Bool
                if case .complete(let id, _)? = store.sheet, id == t.id { stillOpen = true } else { stillOpen = false }
                switch failure {
                case .cancelled, .unauthorized: break
                case .notFound where ExternalRef.parse(localID: t.id) != nil: break // the store opened "guardar en"
                case .notFound:
                    // The catalog doesn't know this id anymore.
                    if stillOpen {
                        withAnimation(KMotion.short) { saveError = AppStore.unknownTitleNote }
                    } else {
                        store.showToast(ToastModel(text: AppStore.unknownTitleNote, kind: .info))
                    }
                default:
                    if stillOpen {
                        withAnimation(KMotion.short) { saveError = failure.inlineText }
                    } else {
                        store.showToast(ToastModel(text: failure == .offline ? "Sin conexión. No se pudo guardar tu reseña." : "No se pudo guardar tu reseña", kind: .info))
                    }
                }
                return
            }
            store.publishReview(titleID: t.id, text: review, spoiler: spoiler)
            done()
            store.suggestSaving(t.id)
        }
    }
}

// MARK: - La reseña se borra con la reacción

/// Asked before a mark that leaves the title without a reaction ("Completo", "Quitar completado")
/// when you have a review of it: the server deletes the review in the same write and there is no
/// undo. Same copy on web and Android. No destructive role (Kura has no red).
struct ReviewLossSheet: View {
    @Environment(AppStore.self) private var store
    let titleID: String
    let mark: Mark?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("tu reseña se borra con la reacción")
                .font(.kura.news(26))
                .foregroundStyle(KColor.text)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .padding(.horizontal, 8)
            Text("Si quitas la reacción, tu reseña se borra y no se puede recuperar.")
                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 8)
                .padding(.top, 4).padding(.bottom, 16)
            SolidButton(title: "Quitar y borrar reseña") { confirm() }
            Button { store.dismissSheet() } label: {
                Text("Conservar")
                    .font(.kura.ui(16, .medium))
                    .foregroundStyle(KColor.text)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
    }

    private func confirm() {
        // Same release rule as `CompleteSheet.save` (`preview` only lifts the server's gate).
        let preview = mark != nil && (store.title(titleID).map { store.isUnreleased($0) || store.isReleaseDay($0) } ?? false)
        withAnimation(KMotion.spring) { store.setMark(titleID, mark, haptic: mark != nil, preview: preview) }
        store.dismissSheet()
    }
}

// MARK: - 19h Guardar en colección

struct SaveToSheet: View {
    @Environment(AppStore.self) private var store
    let titleID: String
    @State private var selected: Set<String> = []
    @State private var loaded = false

    var body: some View {
        if let t = store.title(titleID) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 14) {
                    CoverView(title: t, width: 44, height: t.format == .album ? 44 : 66, radius: KRadius.coverS)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(t.name).font(.kura.newsItalic(20)).foregroundStyle(KColor.text).lineLimit(1)
                        Text([t.format.metaLabel, t.year.map(String.init), t.creatorShort]
                            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).monoLabel().lineLimit(1)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 12)

                if store.isUnreleased(t) || t.upcomingSeason != nil {
                    HStack(spacing: 8) {
                        GlyphView(glyph: .clock, size: 13)
                        Text("También entra a no puedo esperar, arriba de todo.")
                            .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                    }
                    .padding(.horizontal, 8)
                    .padding(.bottom, 4)
                }

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        NewCollectionRow { store.present(.newCollection(addingTitleID: t.id)) }

                        // Colecciones formalizado · 7a: mini fan, name, count and whether it's there.
                        let already = Set(store.collectionsContaining(t.id).map(\.id))
                        ForEach(store.orderedCollections) { c in
                            let on = selected.contains(c.id)
                            FanPickRow(name: c.name, covers: store.fan(of: c), count: c.titleIDs.count, on: on,
                                       note: already.contains(c.id) ? "ya está" : nil) {
                                if on { selected.remove(c.id) } else { selected.insert(c.id) }
                                KHaptic.play(.selection)
                            }
                        }
                    }
                }
                .frame(maxHeight: 340)

                // The button says the CHANGE, not the state: nothing new → "Listo"; one collection
                // added/removed → its name; the sheets' one primary (`SolidButton`).
                let before = Set(store.collectionsContaining(t.id).map(\.id))
                let added = selected.subtracting(before)
                let removed = before.subtracting(selected)
                SolidButton(title: saveLabel(added: added, removed: removed, before: before),
                            enabled: !(selected.isEmpty && before.isEmpty)) {
                    store.setMembership(t.id, collections: selected)
                    store.dismissSheet()
                }
                .padding(.top, 10)
            }
            .padding(.horizontal, 12)
            .onAppear {
                guard !loaded else { return }
                loaded = true
                if store.collections.isEmpty {
                    store.present(.newCollection(addingTitleID: titleID))
                    return
                }
                let current = Set(store.collectionsContaining(titleID).map(\.id))
                if current.isEmpty, let last = store.lastUsedCollectionID, store.collection(last) != nil {
                    selected = [last]
                } else {
                    selected = current
                }
            }
        }
    }
}

extension SaveToSheet {
    fileprivate func saveLabel(added: Set<String>, removed: Set<String>, before: Set<String>) -> String {
        func name(_ id: String?) -> String? { id.flatMap { store.collection($0)?.name } }
        switch (added.count, removed.count) {
        case (0, 0): return before.isEmpty ? "Elige una colección" : "Listo"
        case (1, 0): return name(added.first).map { "Guardar en \($0)" } ?? "Guardar en 1 colección"
        case (let n, 0): return "Guardar en \(n) colecciones"
        case (0, 1): return name(removed.first).map { "Quitar de \($0)" } ?? "Quitar de 1 colección"
        case (0, let n): return "Quitar de \(n) colecciones"
        default: return "Guardar cambios"
        }
    }
}

// MARK: - Opciones de la ficha

struct TitleMoreSheet: View {
    @Environment(AppStore.self) private var store
    let titleID: String

    var body: some View {
        if let t = store.title(titleID) {
            VStack(alignment: .leading, spacing: 2) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(t.name).font(.kura.newsItalic(22)).foregroundStyle(KColor.text)
                    Text([t.format.metaLabel, t.year.map(String.init)].compactMap { $0 }.joined(separator: " · ")).monoLabel()
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 10)

                SheetRow(systemImage: "bookmark", label: "Guardar en…") { store.present(.saveTo(t.id)) }
                if store.isUnreleased(t) {
                    SheetRow(systemImage: "clock", label: "La vi en preestreno", glyph: .clock) {
                        store.present(.complete(titleID: t.id, focusReview: false))
                    }
                } else {
                    SheetRow(systemImage: "checkmark", label: store.mark(t.id) == nil ? "Completar" : "Cambiar tu reacción",
                             glyph: store.mark(t.id)?.glyph ?? .check) {
                        store.present(.complete(titleID: t.id, focusReview: false))
                    }
                    SheetRow(systemImage: "text.bubble", label: store.myReview(t.id) == nil ? "Reseñar" : "Editar reseña") {
                        store.present(.complete(titleID: t.id, focusReview: true))
                    }
                }
                // Compartir lives in the top chrome, next to ⋯; here only the note on why it's missing.
                if store.myItemLink(t.id) == nil && store.profilePrivate {
                    // Same note as the collection's share sheet: the link would 404.
                    Text(AppStore.privateProfileShareNote)
                        .font(.kura.ui(14)).foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 10).padding(.top, 10).padding(.bottom, 4)
                }
            }
            .padding(.horizontal, 12)
        }
    }
}
