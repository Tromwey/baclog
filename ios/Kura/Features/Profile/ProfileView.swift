import SwiftUI
import PhotosUI

// MARK: - 20c Perfil propio · E2 vacío

struct ProfileView: View {
    @Environment(AppStore.self) private var store

    private var obsessions: [Title] {
        store.userTitles.filter { $0.value.mark == .obsessed }
            .sorted { $0.value.savedAt < $1.value.savedAt }
            .compactMap { store.title($0.key) }
    }

    var body: some View {
        if store.loadState == .failed {
            // The launch read failed: nothing honest to draw yet (no name, no counts).
            ZStack(alignment: .topTrailing) {
                KColor.bg.ignoresSafeArea()
                LoadErrorBlock(error: store.loadError(.library) ?? .server("")) { Task { await store.bootstrap() } }
                    .padding(.horizontal, 28)
                    .padding(.top, 140)
                IconChip44(systemName: "gearshape", iconSize: 17, weight: .medium, label: "Ajustes") { store.push(.settings) }
                    .padding(.top, KSize.chromeTop)
                    .padding(.horizontal, 20)
            }
            .ignoresSafeArea(.container, edges: .top)
        } else if store.collections.isEmpty && obsessions.isEmpty && store.loadState == .loaded {
            EmptyOwnProfile()
        } else {
            full
        }
    }

    private var headerPalette: [String]? {
        if let id = store.me.featuredTitleID, let t = store.title(id) { return t.palette }
        return obsessions.first?.palette
    }

    private var full: some View {
        let me = store.me
        return ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 8) {
                            Spacer()
                            ShareLink(item: URL(string: "https://kura.app/@\(me.handle)")!) {
                                Image(systemName: "square.and.arrow.up").font(.system(size: 16, weight: .medium))
                                    .foregroundStyle(KColor.text)
                                    .frame(width: 44, height: 44)
                                    .background(KColor.glassBg, in: Circle())
                            }
                            .accessibilityLabel("Compartir perfil")
                            IconChip44(systemName: "gearshape", iconSize: 17, weight: .medium, label: "Ajustes") {
                                store.push(.settings)
                            }
                        }
                        Button { store.push(.editProfile) } label: { Seal(person: me, size: 128) }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Editar perfil")
                        VStack(alignment: .leading, spacing: 6) {
                            Text(me.name).font(.kura.profile).foregroundStyle(KColor.text).accessibilityAddTraits(.isHeader)
                            Text("@\(me.handle)").font(.kura.mono(12)).foregroundStyle(KColor.text2)
                            FollowCounts(followers: me.followers, following: max(me.followingCount, store.following.count),
                                         onFollowers: { store.push(.followers(me.id, showFollowing: false)) },
                                         onFollowing: { store.push(.followers(me.id, showFollowing: true)) })
                        }
                        FlowLayout(spacing: 7, lineSpacing: 7) {
                            RibbonPill(glyph: .flame, value: store.count(of: .obsessed))
                            RibbonPill(glyph: .check, value: store.count(of: .completed) + store.count(of: .liked) + store.count(of: .obsessed))
                            RibbonPill(glyph: .thumb, value: store.count(of: .liked))
                            RibbonPill(glyph: .review, value: store.reviewCount)
                        }
                        if let recapLabel = store.recapButtonLabel {
                            Button { store.push(.recap) } label: {
                                HStack(spacing: 8) {
                                    Text(recapLabel).font(.kura.news(17))
                                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                                }
                                .foregroundStyle(KColor.text)
                                .padding(.horizontal, 16)
                                .frame(height: 40)
                                .background(KColor.glassBg, in: Capsule())
                            }
                            .kPress()
                        }
                    }
                    .padding(.top, KSize.chromeTop)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 34)
                    .background(headerPalette.map { Tint.header($0) } ?? Tint.neutralHeader)
                    .animation(KMotion.tint, value: headerPalette)

                    VStack(alignment: .leading, spacing: 30) {
                        if !obsessions.isEmpty {
                            VStack(alignment: .leading, spacing: 14) {
                                SectionTitle(text: "me obsesiona").padding(.horizontal, 20)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(alignment: .bottom, spacing: 12) {
                                        ForEach(obsessions) { t in
                                            Button { store.push(.title(t.id)) } label: { CoverView(title: t, height: 150) }
                                                .buttonStyle(.plain)
                                        }
                                    }
                                    .padding(.horizontal, 20)
                                    .padding(.bottom, 12)
                                }
                                .scrollClipDisabled()
                            }
                        }
                        VStack(alignment: .leading, spacing: 14) {
                            HStack(alignment: .firstTextBaseline) {
                                Text("tus colecciones").font(.kura.section).foregroundStyle(KColor.text)
                                Spacer()
                                Button("Ver las \(store.collections.count)") { store.select(.collections) }
                                    .font(.kura.ui(14, .medium))
                                    .foregroundStyle(KColor.text2)
                            }
                            .padding(.horizontal, 20)
                            VStack(spacing: 12) {
                                ForEach(store.orderedCollections.filter { !$0.titleIDs.isEmpty }.prefix(4)) { c in
                                    CollectionCard(collection: c, titles: store.titles(in: c), marks: [:],
                                                   palette: store.palette(of: c), coverHeight: 104, spineSize: 11,
                                                   waitingLabel: { store.isUnreleased($0) ? store.releaseLabel($0) : nil },
                                                   onTap: { store.select(.collections); store.push(.collection(c.id)) },
                                                   onLongPress: { store.present(.collectionQuick(c.id)) })
                                }
                            }
                        }
                    }
                    .padding(.top, 8)
                    .padding(.bottom, 150)
                }
            }
            .ignoresSafeArea(.container, edges: .top)
        }
        .task(id: store.loadState) { if store.loadState == .loaded { await store.loadRecapMonths() } }
    }
}

/// E2 · Perfil propio vacío.
private struct EmptyOwnProfile: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        let me = store.me
        ScrollView(showsIndicators: false) {
            VStack(spacing: 10) {
                HStack {
                    Spacer()
                    IconChip44(systemName: "gearshape", iconSize: 17, weight: .medium, label: "Ajustes") { store.push(.settings) }
                }
                .padding(.horizontal, 20)
                Seal(person: me, size: 112)
                Text(me.name).font(.kura.news(30)).foregroundStyle(KColor.text).padding(.top, 6)
                Text("@\(me.handle)").monoLabel()
                HStack(spacing: 18) {
                    Text("0 seguidores").monoLabel()
                    Text("0 siguiendo").monoLabel()
                }
                .padding(.top, 6)

                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("me obsesiona").font(.kura.section).foregroundStyle(KColor.text).padding(.horizontal, 20)
                        HStack(spacing: 12) {
                            Button { store.select(.discover) } label: {
                                RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous).fill(KColor.s1)
                                    .frame(width: 100, height: 150)
                                    .overlay(Image(systemName: "plus").font(.system(size: 17, weight: .semibold)).foregroundStyle(KColor.text2))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Buscar algo que te obsesione")
                            RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous).fill(KColor.s1).frame(width: 100, height: 150)
                            RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous).fill(KColor.s1).frame(width: 100, height: 150)
                        }
                        .padding(.horizontal, 20)
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("tus colecciones").font(.kura.section).foregroundStyle(KColor.text).padding(.horizontal, 8)
                        HStack(spacing: 0) {
                            SpineLabel(text: "tu primera", height: 186)
                            HStack(alignment: .bottom, spacing: 10) {
                                Button { store.present(.newCollection(addingTitleID: nil)) } label: {
                                    RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous).fill(KColor.s2)
                                        .frame(width: 100, height: 150)
                                        .overlay(Image(systemName: "plus").font(.system(size: 17, weight: .semibold)).foregroundStyle(KColor.text2))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Nueva colección")
                                RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous).fill(KColor.s2).frame(width: 100, height: 150)
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 18)
                            .padding(.horizontal, 16)
                        }
                        .background(KColor.s1)
                        .clipShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                    }
                    .padding(.horizontal, 12)
                }
                .padding(.top, 24)
            }
            .padding(.top, KSize.chromeTop)
            .padding(.horizontal, 0)
            .padding(.bottom, 110)
        }
        .ignoresSafeArea(.container, edges: .top)
    }
}

// MARK: - 20f Editar perfil

struct EditProfileView: View {
    @Environment(AppStore.self) private var store
    @State private var name = ""
    @State private var handle = ""
    @State private var featured: String?
    @State private var isPrivate = false
    @State private var showCommon = true
    @State private var loaded = false
    @State private var photo: PhotosPickerItem?

    private var candidates: [Title] {
        let ids = store.userTitles.filter { $0.value.mark == .obsessed || $0.value.mark == .liked }.map(\.key).sorted()
        return (store.onboardingPicks + ids).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
            .compactMap { store.title($0) }
    }

    var body: some View {
        let palette = featured.flatMap { store.title($0)?.palette }
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                VStack(spacing: 14) {
                    HStack {
                        IconChip44(systemName: "xmark", iconSize: 15, label: "Cancelar") { store.pop() }
                        Spacer()
                        Button(action: save) {
                            Text("Guardar").font(.kura.ui(15, .semibold)).foregroundStyle(KColor.text)
                                .padding(.horizontal, 18).frame(height: 44)
                                .background(KColor.glassBg, in: Capsule())
                        }
                        .kPress()
                    }
                    .padding(.horizontal, 4)
                    Seal(person: preview(palette), size: 104)
                        .opacity(store.avatarBusy ? 0.5 : 1)
                        .overlay { if store.avatarBusy { ProgressView().tint(KColor.text) } }
                    let photoLabel = store.avatarBusy ? "Subiendo…" : (store.me.avatarURL == nil ? "Poner foto" : "Cambiar foto")
                    HStack(spacing: 20) {
                        PhotosPicker(selection: $photo, matching: .images, photoLibrary: .shared()) {
                            Text(photoLabel)
                                .font(.kura.ui(15, .semibold))
                                .foregroundStyle(KColor.text)
                                .frame(minHeight: 44)
                        }
                        .disabled(store.avatarBusy)
                        if store.me.avatarURL != nil && !store.avatarBusy {
                            Button("Quitar foto") { Task { await store.removeAvatar() } }
                                .font(.kura.ui(15, .semibold))
                                .foregroundStyle(KColor.text2)
                                .frame(minHeight: 44)
                        }
                    }
                    .onChange(of: photo) { _, item in
                        guard let item else { return }
                        photo = nil
                        Task {
                            // Two different failures: the photo didn't arrive (iCloud / red) vs. it
                            // arrived but isn't an image we can read.
                            let data: Data?
                            do {
                                data = try await item.loadTransferable(type: Data.self)
                            } catch {
                                store.showToast(ToastModel(text: "No se pudo descargar la foto. Revisa tu red.", kind: .info))
                                return
                            }
                            guard let data, let img = UIImage(data: data) else {
                                store.showToast(ToastModel(text: "Esa imagen no se pudo leer. Prueba con otra.", kind: .info))
                                return
                            }
                            await store.uploadAvatar(img)
                        }
                    }
                }
                .padding(.top, KSize.chromeTop)
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
                .background(palette.map { Tint.header($0) } ?? Tint.neutralHeader)
                .animation(.easeInOut(duration: 0.3), value: featured)

                VStack(alignment: .leading, spacing: 24) {
                    GroupedList {
                        field("Nombre", text: $name)
                        ListDivider()
                        field("Usuario", text: $handle, prefix: "@")
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Obsesión destacada").monoLabel(11, tracking: 0.1)
                            Text("Tiñe la cabecera de tu perfil. Toca una para probar.").font(.kura.ui(13)).foregroundStyle(KColor.text2)
                        }
                        .padding(.horizontal, 8)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(alignment: .bottom, spacing: 10) {
                                ForEach(candidates) { t in
                                    let on = t.id == featured
                                    Button {
                                        featured = t.id
                                        UISelectionFeedbackGenerator().selectionChanged()
                                    } label: {
                                        CoverView(title: t, height: 96, radius: KRadius.coverS)
                                            .overlay(alignment: .topLeading) {
                                                if on {
                                                    ArtCircle(size: 22) {
                                                        Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(KColor.text)
                                                    }
                                                    .padding(6)
                                                }
                                            }
                                            .opacity(on ? 1 : 0.7)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(t.name)
                                    .accessibilityAddTraits(on ? .isSelected : [])
                                }
                            }
                            .padding(.horizontal, 8)
                            .padding(.bottom, 12)
                        }
                        .scrollClipDisabled()
                    }
                    GroupedList {
                        HStack(spacing: 14) {
                            Text("Perfil privado").font(.kura.ui(15)).foregroundStyle(KColor.text2)
                            Spacer()
                            KuraSwitch(label: "Perfil privado", isOn: $isPrivate)
                        }
                        .padding(.horizontal, 16).frame(minHeight: 56)
                        ListDivider()
                        HStack(spacing: 14) {
                            Text("Mostrar").font(.kura.ui(15)).foregroundStyle(KColor.text2).frame(width: 92, alignment: .leading)
                            Text("En común contigo").font(.kura.ui(16)).foregroundStyle(KColor.text)
                            Spacer()
                            KuraSwitch(label: "Mostrar En común contigo", isOn: $showCommon)
                        }
                        .padding(.horizontal, 16).frame(minHeight: 56)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
                .padding(.bottom, 60)
            }
        }
        .ignoresSafeArea(.container, edges: .top)
        .onAppear {
            guard !loaded else { return }
            loaded = true
            name = store.me.name
            handle = store.me.handle
            featured = store.me.featuredTitleID ?? candidates.first?.id
            isPrivate = store.profilePrivate
            showCommon = store.showCommon
        }
    }

    private func field(_ label: String, text: Binding<String>, prefix: String = "") -> some View {
        HStack(spacing: 14) {
            Text(label).font(.kura.ui(15)).foregroundStyle(KColor.text2).frame(width: 92, alignment: .leading)
            HStack(spacing: 0) {
                if !prefix.isEmpty { Text(prefix).font(.kura.ui(16)).foregroundStyle(KColor.text) }
                TextField("", text: text)
                    .font(.kura.ui(16))
                    .foregroundStyle(KColor.text)
                    .tint(KColor.text)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
    }

    /// The seal as it will look: the name being typed, the tint being tried, your photo.
    private func preview(_ palette: [String]?) -> Person {
        var p = Person(handle: handle, name: name, initials: initials(name), hexes: palette ?? store.me.hexes)
        p.avatarURL = store.me.avatarURL
        return p
    }

    private func initials(_ s: String) -> String {
        let chars = s.split(separator: " ").prefix(2).compactMap(\.first)
        return chars.isEmpty ? "k" : String(chars).lowercased()
    }

    private func save() {
        store.saveProfile(name: name, handle: handle, featured: featured, isPrivate: isPrivate, showCommon: showCommon)
        store.pop()
    }
}
