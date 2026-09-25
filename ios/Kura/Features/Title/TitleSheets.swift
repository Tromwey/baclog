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
    /// saves `verdict = null`, so a NEW or edited review can't go out with it. An unchanged review
    /// you already had stays as it is (only the mark changes).
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
                        withAnimation(KMotion.spring) { store.setMark(titleID, nil) }
                        store.dismissSheet()
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
            KHaptic.notify(.warning)
            return
        }
        let done = { store.dismissSheet() }
        // No review (or an unchanged one under Completo): fire-and-forget, as before (the store
        // reverts/retries on its own, and once the server confirms it suggests "Guardar en…" for
        // a title in no collection — the mark stands either way).
        guard !review.isEmpty, choice != .completed else {
            withAnimation(KMotion.spring) { store.setMark(t.id, choice, haptic: false, preview: preview) }
            // Emptying an existing review and saving deletes it (with its own Deshacer);
            // saving only the mark would leave the old text published.
            if review.isEmpty, store.myReview(t.id) != nil { store.deleteReview(titleID: t.id) }
            done()
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
                        withAnimation(KMotion.short) { saveError = failure.toast }
                    } else {
                        store.showToast(ToastModel(text: failure == .offline ? "Sin conexión. Tu reseña no se guardó." : "Tu reseña no se guardó.", kind: .info))
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

                Text("Guardar en").monoLabel(11, tracking: 0.1).padding(.horizontal, 8).padding(.bottom, 4)
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
                        Button {
                            store.present(.newCollection(addingTitleID: t.id))
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: "plus").font(.system(size: 16, weight: .semibold))
                                    .frame(width: 40, height: 40)
                                    .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: KRadius.coverS, style: .continuous))
                                Text("Nueva colección").font(.kura.ui(16, .medium))
                                Spacer()
                            }
                            .foregroundStyle(KColor.text)
                            .padding(.horizontal, 8)
                            .frame(minHeight: 56)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        ForEach(store.orderedCollections) { c in
                            let on = selected.contains(c.id)
                            Button {
                                if on { selected.remove(c.id) } else { selected.insert(c.id) }
                                KHaptic.select()
                            } label: {
                                HStack(spacing: 14) {
                                    CollectionThumb(collection: c)
                                    Text(c.name).font(.kura.news(19)).foregroundStyle(KColor.text).lineLimit(1)
                                    Spacer()
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(on ? KColor.text : .clear)
                                        .frame(width: 26, height: 26)
                                        .background(on ? KColor.glassSelected : KColor.glassBg, in: Circle())
                                        .animation(KMotion.fade, value: on)
                                }
                                .padding(.horizontal, 8)
                                .frame(minHeight: 56)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    }
                }
                .frame(maxHeight: 340)

                let n = selected.count
                let before = Set(store.collectionsContaining(t.id).map(\.id))
                Button {
                    store.setMembership(t.id, collections: selected)
                    store.dismissSheet()
                } label: {
                    Text(n == 0 ? (before.isEmpty ? "Elige una colección" : "Quitar de tus colecciones")
                         : (n == 1 ? "Guardar en 1 colección" : "Guardar en \(n) colecciones"))
                        .font(.kura.ui(16, .semibold))
                        .foregroundStyle(n == 0 && before.isEmpty ? KColor.text2 : KColor.text)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(KColor.glassBg, in: Capsule())
                }
                .kPress()
                .disabled(n == 0 && before.isEmpty)
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
                // `/{you}/item/{id}` — only while your profile is public (otherwise it 404s).
                if let url = store.myItemLink(t.id) {
                    SheetShareRow(label: "Compartir", item: url)
                } else if store.profilePrivate {
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
