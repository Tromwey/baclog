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
    @FocusState private var focused: Bool

    private let limit = 280

    private var stop: Int { min(2, max(0, Int(value.rounded()))) }

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
                        .scaleEffect(stop == 2 ? 1.06 : 1)
                        .animation(.spring(response: 0.28, dampingFraction: 0.55), value: stop)
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
                .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
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

                Button { save(t) } label: {
                    Text(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Guardar" : "Publicar")
                        .font(.kura.ui(16, .semibold))
                        .foregroundStyle(KColor.text)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(KColor.glassBg, in: Capsule())
                }
                .kPress()
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
        let wasSaved = store.isSaved(t.id)
        withAnimation(KMotion.spring) {
            store.setMark(t.id, choice, haptic: false)
        }
        store.publishReview(titleID: t.id, text: text, spoiler: spoiler)
        store.dismissSheet()
        if !wasSaved {
            store.showToast(ToastModel(text: "\(choice.myLabel). ¿Lo guardas en una colección?", kind: .info))
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
                        Text([t.format.metaLabel, t.year.map(String.init), t.creator.components(separatedBy: " ").last]
                            .compactMap { $0 }.joined(separator: " · ")).monoLabel().lineLimit(1)
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
                                UISelectionFeedbackGenerator().selectionChanged()
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
                                        .animation(.easeInOut(duration: 0.18), value: on)
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
