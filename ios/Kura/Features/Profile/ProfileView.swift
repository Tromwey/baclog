import SwiftUI

/// Perfil propio (no frame; built from the DS): header tinted by your three
/// obsessions, seal 128, name 40, ribbon of counts by state, your collections.
struct ProfileView: View {
    @Environment(AppStore.self) private var store

    private var obsessions: [Title] {
        let marked = store.userTitles.filter { $0.value.mark == .obsessed }.map(\.key)
        let picks = store.onboardingPicks
        let ids = (picks.isEmpty ? [] : picks) + marked.sorted()
        var seen = Set<String>()
        return ids.filter { seen.insert($0).inserted }.compactMap { store.title($0) }.prefix(3).map { $0 }
    }

    var body: some View {
        let me = store.me
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(spacing: 12) {
                        Seal(person: me, size: 128)
                        Text(me.name).font(.kura.profile).foregroundStyle(KColor.text)
                            .padding(.top, 6)
                            .accessibilityAddTraits(.isHeader)
                        Text("@\(me.handle)").font(.kura.ui(15)).foregroundStyle(KColor.text2)
                        Text("\(store.following.count) siguiendo · 128 seguidores").monoLabel()
                        CountRibbon(items: [
                            (.flame, "\(store.count(of: .obsessed))"),
                            (.thumb, "\(store.count(of: .liked))"),
                            (.check, "\(store.count(of: .completed) + store.count(of: .liked) + store.count(of: .obsessed))"),
                            (.clock, "\(store.waitingTitles.count)"),
                            (.bookmark, "\(store.savedCount)")
                        ])
                        .padding(.top, 4)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 124)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 30)
                    .background(obsessions.isEmpty ? Tint.neutralHeader : Tint.header3(obsessions.map(\.palette)))

                    if !obsessions.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionTitle(text: "tus obsesiones")
                                .padding(.horizontal, 24)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(alignment: .bottom, spacing: 10) {
                                    ForEach(obsessions) { t in
                                        Button { store.push(.title(t.id)) } label: {
                                            CoverView(title: t, height: 150, badge: .mark(.obsessed))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .padding(.horizontal, 24)
                                .padding(.bottom, 12)
                            }
                            .scrollClipDisabled()
                        }
                        .padding(.top, 10)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        SectionTitle(text: "tus colecciones", trailing: "\(store.collections.count)")
                            .padding(.horizontal, 24)
                        VStack(spacing: 12) {
                            ForEach(store.orderedCollections) { c in
                                CollectionCard(collection: c,
                                               titles: store.titles(in: c),
                                               marks: [:],
                                               palette: store.palette(of: c),
                                               coverHeight: KSize.cardCoverCompact,
                                               waitingLabel: { store.isUnreleased($0) ? store.releaseLabel($0) : nil },
                                               onTap: { store.push(.collection(c.id)) },
                                               onLongPress: { store.present(.collectionQuick(c.id)) })
                                    .overlay(alignment: .topTrailing) {
                                        if c.privacy != .publicAccess {
                                            Image(systemName: c.privacy.symbol)
                                                .font(.system(size: 11, weight: .semibold))
                                                .foregroundStyle(KColor.text)
                                                .frame(width: 26, height: 26)
                                                .background(KColor.glassArt, in: Circle())
                                                .padding(.top, 10)
                                                .padding(.trailing, 22)
                                                .accessibilityLabel(c.privacy.label)
                                        }
                                    }
                            }
                        }
                    }
                    .padding(.top, 30)

                    let mine = store.reviews.filter { $0.authorID == me.id }
                    if !mine.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionTitle(text: "tus reseñas")
                            ForEach(mine) { r in
                                VStack(alignment: .leading, spacing: 8) {
                                    if let t = store.title(r.titleID) {
                                        Button { store.push(.title(t.id)) } label: {
                                            Text(t.name).font(.kura.newsItalic(19)).foregroundStyle(KColor.text)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                    ReviewCard(review: r, lineLimit: 4)
                                }
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.top, 30)
                    }
                }
                .padding(.bottom, 140)
            }
            .ignoresSafeArea(.container, edges: .top)

            HStack {
                Spacer()
                IconChip44(systemName: "ellipsis", iconSize: 17, label: "Opciones y ajustes") {
                    store.present(.settings)
                }
            }
            .padding(.horizontal, KSize.chromeSide)
            .padding(.top, KSize.chromeTop)
            .ignoresSafeArea(.container, edges: .top)
        }
    }
}

// MARK: - Ajustes (from Opciones)

struct SettingsSheet: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        @Bindable var store = store
        VStack(alignment: .leading, spacing: 2) {
            SheetHeader(title: "ajustes")
                .padding(.horizontal, 10)
            SheetRow(systemImage: "person.crop.circle", label: "Editar perfil") {
                store.dismissSheet()
                store.showToast(ToastModel(text: "Editar perfil llega con la API real.", kind: .info))
            }
            SheetRow(systemImage: "music.note", label: "Abrir música en", action: {}) {
                Text("Apple Music").monoLabel()
            }
            SheetRow(systemImage: "globe", label: "Tu perfil", action: {}) {
                Text("Público").monoLabel()
            }
            HStack(spacing: 14) {
                Image(systemName: "wifi.slash").font(.system(size: 17)).frame(width: 24)
                Text("Simular sin conexión").font(.kura.ui(16, .medium))
                Spacer()
                Toggle("Simular sin conexión", isOn: $store.offline).labelsHidden().tint(KColor.text3)
            }
            .foregroundStyle(KColor.text)
            .padding(.horizontal, 10)
            .frame(minHeight: 54)
            Color.clear.frame(height: 8)
            SheetRow(systemImage: "rectangle.portrait.and.arrow.right", label: "Cerrar sesión") {
                store.signOut()
            }
        }
        .padding(.horizontal, 12)
    }
}
