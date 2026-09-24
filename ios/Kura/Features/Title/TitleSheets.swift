import SwiftUI

// MARK: - 26a Completar — "¿qué te pareció?"

struct CompleteSheet: View {
    @Environment(AppStore.self) private var store
    let titleID: String
    let focusReview: Bool

    @State private var choice: Mark?
    @State private var text = ""
    @State private var spoiler = false
    @State private var loaded = false
    @FocusState private var focused: Bool

    private let limit = 280

    var body: some View {
        if let t = store.title(titleID) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    CoverView(title: t, width: 44, height: t.format == .album ? 44 : 66, radius: KRadius.coverS)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("¿qué te pareció?").font(.kura.news(26)).foregroundStyle(KColor.text)
                            .accessibilityAddTraits(.isHeader)
                        Text(t.name).font(.kura.newsItalic(16)).foregroundStyle(KColor.text2).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    IconChip44(systemName: "xmark", size: 36, iconSize: 13, label: "Cerrar") { store.dismissSheet() }
                }

                HStack(spacing: 8) {
                    option(.liked, "Me gusta")
                    option(.obsessed, "Me obsesiona")
                    option(.completed, "Solo completo")
                }

                ZStack(alignment: .topLeading) {
                    TextEditor(text: $text)
                        .font(.kura.ui(15))
                        .foregroundStyle(KColor.text)
                        .scrollContentBackground(.hidden)
                        .tint(KColor.text)
                        .focused($focused)
                        .frame(height: 96)
                        .clipped()
                        .padding(.horizontal, 12)
                        .padding(.top, 8)
                        .padding(.bottom, 8)
                        .onChange(of: text) { _, new in
                            if new.count > limit { text = String(new.prefix(limit)) }
                        }
                    if text.isEmpty {
                        Text("Escribe una reseña (opcional)")
                            .font(.kura.ui(15))
                            .foregroundStyle(KColor.text3)
                            .padding(.horizontal, 17)
                            .padding(.top, 16)
                            .allowsHitTesting(false)
                    }
                }
                .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: KRadius.field, style: .continuous))
                .overlay(alignment: .bottomTrailing) {
                    Text("\(text.count)/\(limit)")
                        .font(.kura.mono(11))
                        .foregroundStyle(text.count >= limit ? KColor.text : KColor.text3)
                        .offset(y: 18)
                        .padding(.trailing, 6)
                }

                HStack {
                    Text("Contiene spoilers").font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                    Spacer()
                    Toggle("Contiene spoilers", isOn: $spoiler)
                        .labelsHidden()
                        .tint(KColor.text3)
                }
                .padding(.horizontal, 4)
                .frame(minHeight: 44)

                SolidButton(title: text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Guardar" : "Publicar",
                            enabled: choice != nil) {
                    save(t)
                }
            }
            .padding(.horizontal, 20)
            .onAppear {
                guard !loaded else { return }
                loaded = true
                choice = store.mark(titleID)
                if let r = store.myReview(titleID) {
                    text = r.text
                    spoiler = r.spoiler
                }
                if focusReview { focused = true }
            }
        }
    }

    private func option(_ m: Mark, _ label: String) -> some View {
        let on = choice == m
        return Button {
            withAnimation(KMotion.spring) { choice = m }
            switch m {
            case .obsessed: UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case .liked: UIImpactFeedbackGenerator(style: .light).impactOccurred()
            case .completed: UISelectionFeedbackGenerator().selectionChanged()
            }
        } label: {
            VStack(spacing: 8) {
                GlyphView(glyph: m.glyph, size: 22)
                    .scaleEffect(on ? 1.12 : 1)
                Text(label).font(.kura.ui(14, .semibold)).foregroundStyle(on ? KColor.text : KColor.text2)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 84)
            .background(on ? Color.white.opacity(0.16) : KColor.glassBg,
                        in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func save(_ t: Title) {
        guard let choice else { return }
        let wasSaved = store.isSaved(t.id)
        withAnimation(KMotion.spring) {
            store.setMark(t.id, choice, haptic: false)
        }
        store.publishReview(titleID: t.id, text: text, spoiler: spoiler)
        store.dismissSheet()
        if !wasSaved {
            // Completing something you never saved: it still needs a home.
            store.showToast(ToastModel(text: "\(choice.myLabel). ¿Lo guardas en una colección?", kind: .info))
        }
    }
}

// MARK: - Guardar en

struct SaveToSheet: View {
    @Environment(AppStore.self) private var store
    let titleID: String
    @State private var selected: Set<String> = []
    @State private var loaded = false

    var body: some View {
        if let t = store.title(titleID) {
            VStack(alignment: .leading, spacing: 6) {
                SheetHeader(title: "guardar en") { store.dismissSheet() }
                if store.isUnreleased(t) || t.upcomingSeason != nil {
                    HStack(spacing: 8) {
                        GlyphView(glyph: .clock, size: 13)
                        Text("También entra a no puedo esperar, arriba de todo.")
                            .font(.kura.ui(13)).foregroundStyle(KColor.text2)
                    }
                    .padding(.bottom, 6)
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
                            .frame(minHeight: 56)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        ForEach(store.orderedCollections) { c in
                            let on = selected.contains(c.id)
                            Button {
                                if on { selected.remove(c.id) } else { selected.insert(c.id) }
                                UISelectionFeedbackGenerator().selectionChanged()
                            } label: {
                                HStack(spacing: 14) {
                                    CollectionThumb(collection: c)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(c.name).font(.kura.news(19)).foregroundStyle(KColor.text).lineLimit(1)
                                        Text("\(c.titleIDs.count) títulos").monoLabel(10)
                                    }
                                    Spacer()
                                    RadioMark(on: on)
                                }
                                .frame(minHeight: 56)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    }
                }
                .frame(maxHeight: 320)
                SolidButton(title: "Guardar") {
                    store.setMembership(t.id, collections: selected)
                    store.dismissSheet()
                }
                .padding(.top, 10)
            }
            .padding(.horizontal, 20)
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
            let url = URL(string: "https://kura.app/t/\(t.id)")!
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
                ShareLink(item: url, message: Text("\(t.name) en kura")) {
                    HStack(spacing: 14) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 17)).frame(width: 24)
                        Text("Compartir").font(.kura.ui(16, .medium))
                        Spacer()
                    }
                    .foregroundStyle(KColor.text)
                    .padding(.horizontal, 10)
                    .frame(minHeight: 54)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SheetRowStyle())
            }
            .padding(.horizontal, 12)
        }
    }
}
