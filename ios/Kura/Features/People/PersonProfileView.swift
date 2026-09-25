import SwiftUI

// MARK: - 20a Perfil público · 20d privado · 35d solicitado

struct PersonProfileView: View {
    @Environment(AppStore.self) private var store
    let personID: String

    var body: some View {
        Group {
            if let p = store.person(personID) {
                content(p)
            } else if store.missingPeople.contains(personID) {
                // Private and nonexistent are the same 404 (API.md §3): never say which.
                GoneView(title: "@\(personID) no está disponible.", note: "El perfil es privado o ya no existe.")
            } else if let e = store.loadError(.person(personID)) {
                LoadErrorScreen(error: e) { Task { await store.loadPerson(personID, force: true) } }
            } else {
                LoadingScreen(square: true)
            }
        }
        .task(id: personID) { await store.loadPerson(personID) }
    }

    private func palette(_ p: Person) -> [String]? {
        if let id = p.featuredTitleID, let t = store.title(id) { return t.palette }
        return p.hexes.count >= 2 ? p.hexes : nil
    }

    private func content(_ p: Person) -> some View {
        let following = store.isFollowing(p.id)
        let locked = p.isPrivate && !following
        return ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    header(p, following: following, locked: locked)
                    if let e = store.loadError(.person(p.id)) {
                        // What's on screen came from a list (counts 0, no collections): say it's partial.
                        RetryStrip(error: e, text: e == .offline ? nil : "No se pudo cargar todo el perfil.") {
                            Task { await store.loadPerson(p.id, force: true) }
                        }
                        .padding(.horizontal, 12)
                        .padding(.bottom, 12)
                    }
                    if locked {
                        LockedCollections(firstName: firstName(p))
                            .padding(.top, 10)
                    } else {
                        profileBody(p, following: following)
                            .padding(.top, 8)
                    }
                }
                .padding(.bottom, 150)
            }
            .ignoresSafeArea(.container, edges: .top)
        }
    }

    private func firstName(_ p: Person) -> String { p.name.split(separator: " ").first.map(String.init) ?? p.handle }

    private func header(_ p: Person, following: Bool, locked: Bool) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 8) {
                BackChip()
                Spacer()
                // Next to Opciones, like Compartir next to Ajustes on your own profile.
                // Someone else's profile we can open is public, so its link is live.
                if let link = PublicLinks.profile(p.handle) {
                    ShareLink(item: link) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 16, weight: .medium))
                            .foregroundStyle(KColor.text)
                            .frame(width: 44, height: 44)
                            .kGlass(Circle(), interactive: true)
                    }
                    .accessibilityLabel("Compartir perfil")
                }
                IconChip44(systemName: "ellipsis", iconSize: 17, label: "Opciones") { store.present(.personOptions(p.id)) }
            }
            Seal(person: p, size: 128)
            VStack(alignment: .leading, spacing: 6) {
                Text(p.name).font(.kura.profile).foregroundStyle(KColor.text).accessibilityAddTraits(.isHeader)
                Text("@\(p.handle)").font(.kura.mono(12)).foregroundStyle(KColor.text2)
                FollowCounts(followers: p.followers, following: p.followingCount,
                             onFollowers: { if !locked { store.push(.followers(p.id, showFollowing: false)) } },
                             onFollowing: { if !locked { store.push(.followers(p.id, showFollowing: true)) } })
            }
            if !locked && (p.stats.obsessed + p.stats.completed) > 0 {
                FlowLayout(spacing: 7, lineSpacing: 7) {
                    RibbonPill(glyph: .flame, value: p.stats.obsessed)
                    RibbonPill(glyph: .check, value: p.stats.completed)
                    RibbonPill(glyph: .thumb, value: p.stats.liked)
                    RibbonPill(glyph: .review, value: p.stats.reviews)
                }
            }
            HStack(spacing: 8) {
                followButton(p, following: following)
            }
        }
        .padding(.top, KSize.chromeTop)
        .padding(.horizontal, 24)
        .padding(.bottom, 34)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            if let pal = palette(p), !locked { Tint.header(pal) } else { Color.clear }
        }
    }

    @ViewBuilder private func followButton(_ p: Person, following: Bool) -> some View {
        let requested = store.requested.contains(p.id)
        let label = following ? "Siguiendo" : (requested ? "Solicitado" : "Seguir")
        let honey = !following && !requested
        Button { store.followFromProfile(p.id) } label: {
            Text(label)
                .font(.kura.ui(16, .semibold))
                .foregroundStyle(honey ? KColor.onAccent : KColor.text)
                .padding(.horizontal, 28)
                .frame(height: 48)
                .modifier(FollowSurface(honey: honey))
                .contentShape(Capsule())
                .animation(KMotion.fade, value: label)
        }
        .kPress()
        .accessibilityLabel(following ? "Dejar de seguir a @\(p.handle)" : label)
    }

    @ViewBuilder
    private func profileBody(_ p: Person, following: Bool) -> some View {
        VStack(alignment: .leading, spacing: 30) {
            let common = p.common.compactMap { store.title($0) }
            if !common.isEmpty && store.showCommon {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("En común contigo · \(common.count + 9) títulos").monoLabel(11, tracking: 0.1)
                        if let shared = p.obsessions.first(where: { store.mark($0) == .obsessed }).flatMap({ store.title($0) }) {
                            (Text("Comparten la obsesión por ").font(.kura.ui(15))
                             + Text(shared.name).font(.kura.newsItalic(17)) + Text(".").font(.kura.ui(15)))
                                .foregroundColor(KColor.text)
                        }
                    }
                    .padding(.horizontal, 20)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .bottom, spacing: 12) {
                            ForEach(common) { t in
                                Button { store.push(.title(t.id)) } label: {
                                    CoverView(title: t, height: 72, radius: KRadius.coverS).zoomSource(ZoomID.title(t.id))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
                    }
                    .scrollClipDisabled()
                }
                .padding(.vertical, 20)
                .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                .padding(.horizontal, 12)
            }

            let obs = p.obsessions.compactMap { store.title($0) }
            if !obs.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    SectionTitle(text: "le obsesiona").padding(.horizontal, 20)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .bottom, spacing: 12) {
                            ForEach(obs) { t in
                                Button { store.push(.title(t.id)) } label: { CoverView(title: t, height: 150).zoomSource(ZoomID.title(t.id)) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 12)
                    }
                    .scrollClipDisabled()
                }
            }

            if !p.collections.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("colecciones").font(.kura.section).foregroundStyle(KColor.text)
                        Spacer()
                        Text("\(p.collections.count)").font(.kura.ui(14, .medium)).foregroundStyle(KColor.text2)
                    }
                    .padding(.horizontal, 20)
                    let visible = p.collections.filter { $0.privacy == .publicAccess || following }
                    let hidden = p.collections.count - visible.count
                    VStack(spacing: 12) {
                        ForEach(visible) { pc in PersonCollectionCard(collection: pc, ownerHandle: p.handle, coverHeight: 104) }
                        if hidden > 0 {
                            FollowersOnlyCard(count: hidden, note: "Síguela para verla.").padding(.horizontal, 12)
                        }
                    }
                }
            }
        }
    }
}

/// Someone else's collection as a card (spine + covers), 104 covers on profiles.
struct PersonCollectionCard: View {
    @Environment(AppStore.self) private var store
    let collection: PersonCollection
    var ownerHandle: String = ""
    var coverHeight: CGFloat = 104

    var body: some View {
        let titles = collection.titleIDs.compactMap { store.title($0) }
        let c = KCollection(id: "p-\(collection.name)", name: collection.name, titleIDs: collection.titleIDs,
                            privacy: collection.privacy, createdAt: .distantPast)
        let cover = collection.coverTitleID.flatMap { store.title($0) } ?? titles.first
        // With a backend id the whole card opens the collection (like your own cards);
        // without one (mock people) the covers open each ficha.
        if let id = collection.remoteID, !ownerHandle.isEmpty {
            CollectionCard(collection: c, titles: titles, marks: [:], palette: cover?.palette,
                           coverHeight: coverHeight, spineSize: 11,
                           onTap: { store.push(.publicCollection(handle: ownerHandle, id: id)) })
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(collection.name), \(titles.count) títulos")
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { store.push(.publicCollection(handle: ownerHandle, id: id)) }
        } else {
            CollectionCard(collection: c, titles: titles, marks: [:], palette: cover?.palette,
                           coverHeight: coverHeight, spineSize: 11,
                           onTap: {}, onTitleTap: { store.push(.title($0.id)) }, coversOpenTitles: true)
        }
    }
}

/// K1d · "1 colección para seguidores".
struct FollowersOnlyCard: View {
    let count: Int
    let note: String
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: "lock.fill").font(.system(size: 18))
                .foregroundStyle(KColor.text)
                .frame(width: 52, height: 52)
                .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(count == 1 ? "1 colección para seguidores" : "\(count) colecciones para seguidores")
                    .font(.kura.news(20)).foregroundStyle(KColor.text)
                Text(note).font(.kura.ui(14)).foregroundStyle(KColor.text2)
            }
            Spacer(minLength: 0)
        }
        .padding(22)
        .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
    }
}

/// 20d · a private profile you don't follow: the shape of the collections, locked.
private struct LockedCollections: View {
    let firstName: String
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 0) {
                Image(systemName: "lock.fill").font(.system(size: 15))
                    .foregroundStyle(KColor.text2)
                    .frame(width: 40, height: 136)
                    .background(KColor.spine)
                HStack(alignment: .bottom, spacing: 10) {
                    ForEach([70.0, 104, 70, 104], id: \.self) { w in
                        RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous).fill(KColor.s2).frame(width: w, height: 104)
                    }
                }
                .padding(.vertical, 16)
                .padding(.horizontal, 14)
                .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
                .clipped()
            }
            .background(KColor.s1)
            .clipShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
            .padding(.horizontal, 12)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 8) {
                Text("\(firstName) tiene su perfil en privado.")
                    .font(.kura.news(24)).foregroundStyle(KColor.text)
                Text("Mientras sea privado, nadie más ve sus obsesiones ni sus colecciones.")
                    .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 24)
        }
    }
}

// MARK: - O10a Opciones de perfil

struct PersonOptionsSheet: View {
    @Environment(AppStore.self) private var store
    let personID: String

    var body: some View {
        if let p = store.person(personID) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 14) {
                    Seal(person: p, size: 44)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(p.name).font(.kura.news(20)).foregroundStyle(KColor.text)
                        Text("@\(p.handle)").monoLabel()
                    }
                }
                .padding(.bottom, 10)
                if let link = PublicLinks.profile(p.handle) {
                    ShareLink(item: link) {
                        optionRow("square.and.arrow.up", "Compartir perfil", note: nil)
                    }
                    .buttonStyle(SheetRowStyle())
                }
                Button {
                    store.dismissSheet()
                    store.toggleMute(p.id)
                } label: {
                    optionRow(store.muted.contains(p.id) ? "speaker.wave.2" : "speaker.slash",
                              store.muted.contains(p.id) ? "Volver a mostrar en el feed" : "Silenciar en el feed",
                              note: "La quita del feed sin dejar de seguirla; no se entera.")
                }
                .buttonStyle(SheetRowStyle())
                Button {
                    store.dismissSheet()
                    store.showToast(ToastModel(text: "Bloquear llega con la API real.", kind: .info))
                } label: {
                    optionRow("nosign", "Bloquear", note: "Abre su propia hoja con lo que pasa.")
                }
                .buttonStyle(SheetRowStyle())
                Button {
                    store.dismissSheet()
                    store.showToast(ToastModel(text: "Gracias. Lo revisamos.", kind: .info))
                } label: {
                    optionRow("flag", "Reportar", note: nil)
                }
                .buttonStyle(SheetRowStyle())
            }
            .padding(.horizontal, 20)
        }
    }

    private func optionRow(_ icon: String, _ title: String, note: String?) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 16))
                .foregroundStyle(KColor.text)
                .frame(width: 40, height: 40)
                .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                if let note { Text(note).font(.kura.ui(13)).foregroundStyle(KColor.text2).fixedSize(horizontal: false, vertical: true) }
            }
            Spacer(minLength: 0)
        }
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }
}

// MARK: - 20e Seguidores y siguiendo

struct FollowersView: View {
    @Environment(AppStore.self) private var store
    let personID: String
    @State var showFollowing: Bool
    @State private var query = ""

    var body: some View {
        let p = store.person(personID)
        let isMe = personID == store.me.id
        let followersCount = isMe ? max(p?.followers ?? 0, 0) : (p?.followers ?? 0)
        let followingCount = isMe ? max(p?.followingCount ?? 0, store.following.count) : (p?.followingCount ?? 0)
        let key = AppStore.peopleListKey(of: personID, following: showFollowing)
        let loaded = store.peopleLists[key]
        let q = SearchIndex.fold(query)
        let list = (loaded ?? []).map { store.person($0.id) ?? $0 }.filter { $0.id != store.me.id }
            .filter { q.isEmpty || SearchIndex.fold($0.handle).contains(q) || SearchIndex.fold($0.name).contains(q) }
        let mutual = list.filter { store.isFollowing($0.id) }
        let rest = list.filter { !store.isFollowing($0.id) }

        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    BackChip()
                    Spacer()
                    Text("@\(p?.handle ?? personID)").font(.kura.mono(12)).foregroundStyle(KColor.text2)
                }
                HStack(spacing: 4) {
                    tab("\(followersCount) seguidores", on: !showFollowing) { showFollowing = false }
                    tab("\(followingCount) siguiendo", on: showFollowing) { showFollowing = true }
                }
                .padding(5)
                .background(KColor.glassBg, in: Capsule())
                SearchPill(placeholder: "Buscar", text: $query)
                VStack(alignment: .leading, spacing: 0) {
                    if loaded == nil, let e = store.loadError(.peopleList(key)) {
                        LoadErrorBlock(error: e, titleSize: 24) {
                            Task { await store.loadPeopleList(of: personID, following: showFollowing) }
                        }
                        .padding(.top, 12)
                    } else if loaded == nil {
                        ForEach(0..<4, id: \.self) { _ in
                            HStack(spacing: 14) {
                                Skeleton(radius: 999).frame(width: 48, height: 48)
                                VStack(alignment: .leading, spacing: 8) {
                                    Skeleton(radius: 6).frame(width: 140, height: 14)
                                    Skeleton(radius: 5).frame(width: 90, height: 10)
                                }
                                Spacer()
                            }
                            .frame(minHeight: 68)
                        }
                    } else if list.isEmpty && !isMe {
                        // Only the owner sees their lists (§4); the counts are public.
                        Text("Solo @\(p?.handle ?? personID) ve su lista.").font(.kura.ui(15)).foregroundStyle(KColor.text2).padding(.top, 12)
                    } else if list.isEmpty {
                        Text(showFollowing ? "Todavía no sigues a nadie." : "Todavía nadie te sigue.")
                            .font(.kura.ui(15)).foregroundStyle(KColor.text2).padding(.top, 12)
                    }
                    if !mutual.isEmpty {
                        Text("Que también sigues").monoLabel(11, tracking: 0.1, color: KColor.text3).padding(.top, 8).padding(.bottom, 4)
                        ForEach(mutual) { row($0) }
                    }
                    if !rest.isEmpty {
                        Text("Todos").monoLabel(11, tracking: 0.1, color: KColor.text3).padding(.top, 16).padding(.bottom, 4)
                        ForEach(rest) { row($0) }
                    }
                }
            }
            .padding(.top, KSize.chromeTop)
            .padding(.horizontal, 24)
            .padding(.bottom, 150)
        }
        .ignoresSafeArea(.container, edges: .top)
        .task(id: key) { await store.loadPeopleList(of: personID, following: showFollowing) }
    }

    private func tab(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.kura.ui(14, on ? .semibold : .medium))
                .foregroundStyle(on ? KColor.text : KColor.text2)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background(on ? Color.white.opacity(0.1) : .clear, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func row(_ p: Person) -> some View {
        let f = store.isFollowing(p.id)
        let n = p.common.count
        // A followed profile that went private (`isPrivate` on the owner lists): dimmed, like the web.
        let dimmed = p.isPrivate && f
        return HStack(spacing: 14) {
            Seal(person: p, size: 48)
            VStack(alignment: .leading, spacing: 4) {
                Text(p.name).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text).lineLimit(1)
                Text("@\(p.handle) · " + (n == 0 ? "nada en común aún" : "\(n) en común")).font(.kura.mono(11)).foregroundStyle(KColor.text2).lineLimit(1)
            }
            Spacer(minLength: 8)
            Button { store.followFromProfile(p.id) } label: {
                Text(f ? "Siguiendo" : (store.requested.contains(p.id) ? "Solicitado" : "Seguir"))
                    .font(.kura.ui(14, .semibold))
                    .foregroundStyle(f ? KColor.text2 : KColor.text)
                    .padding(.horizontal, 16)
                    .frame(height: 40)
                    .background(f ? Color.clear : KColor.glassBg, in: Capsule())
            }
            .kPress()
        }
        .frame(minHeight: 68)
        .contentShape(Rectangle())
        .opacity(dimmed ? 0.5 : 1)
        .kPressable(.row(inset: -10)) { if !dimmed { store.push(.person(p.id)) } }
    }
}

// MARK: - O7 Ficha de persona (creator)

struct CreatorView: View {
    @Environment(AppStore.self) private var store
    let name: String
    @State private var filter: MediaFormat? = nil

    var body: some View {
        let c = store.creator(name)
        let works = store.catalogOrder.compactMap { store.title($0) }.filter { $0.creator == name }
        let saved = works.filter { store.isSaved($0.id) }
        let formats = MediaFormat.allCases.filter { f in works.contains { $0.format == f } }
        let shown = works.filter { filter == nil || $0.format == filter }
        let people = Array(Set(works.flatMap { store.followedMarks(for: $0.id).map(\.0) })).sorted { $0.handle < $1.handle }

        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(spacing: 10) {
                        InitialsSeal(initials: c.initials, size: 128)
                        Text(c.name.lowercased()).font(.kura.news(32)).foregroundStyle(KColor.text).padding(.top, 12)
                            .accessibilityAddTraits(.isHeader)
                        Text("\(c.role) · \(c.works) obras").monoLabel()
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 124)
                    .padding(.bottom, 28)
                    .background(works.first.map { Tint.header($0.palette) } ?? Tint.neutralHeader)

                    VStack(alignment: .leading, spacing: 28) {
                        if !saved.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                SectionTitle(text: "en tus colecciones", trailing: "\(saved.count)").padding(.horizontal, 20)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(alignment: .bottom, spacing: 12) {
                                        ForEach(saved) { t in
                                            Button { store.push(.title(t.id)) } label: {
                                                CoverView(title: t, height: 150, badge: store.mark(t.id).map { .mark($0) } ?? .none).zoomSource(ZoomID.title(t.id))
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                    .padding(.horizontal, 20)
                                    .padding(.bottom, 12)
                                }
                                .scrollClipDisabled()
                            }
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            SectionTitle(text: "obra", trailing: "\(c.works)").padding(.horizontal, 20)
                            if formats.count > 1 {
                                ChipRow(options: [(nil, "Todo")] + formats.map { (Optional($0), $0.label) }, selection: $filter)
                                    .padding(.vertical, 8)
                            }
                            ForEach(shown) { t in
                                HStack(spacing: 14) {
                                    CoverView(title: t, width: t.format == .album ? 56 : 44, height: t.format == .album ? 56 : 66, radius: KRadius.coverS).zoomSource(ZoomID.title(t.id))
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(t.name).font(.kura.newsItalic(18)).foregroundStyle(KColor.text).lineLimit(1)
                                        Text([t.format.metaLabel, t.year.map(String.init)].compactMap { $0 }.joined(separator: " · ")).monoLabel()
                                    }
                                    Spacer()
                                    SaveChip(titleID: t.id)
                                }
                                .padding(.horizontal, 20)
                                .frame(minHeight: 84)
                                .contentShape(Rectangle())
                                .kPressable(.row) { store.push(.title(t.id)) }
                            }
                            if filter == nil || filter == .film, KuraRuntime.usesMock {
                                ForEach(MockData.otherWorks[name] ?? [], id: \.0) { w in
                                    HStack(spacing: 14) {
                                        RoundedRectangle(cornerRadius: KRadius.coverS, style: .continuous).fill(KColor.s2).frame(width: 44, height: 66)
                                        VStack(alignment: .leading, spacing: 5) {
                                            Text(w.0).font(.kura.newsItalic(18)).foregroundStyle(KColor.text).lineLimit(1)
                                            Text(w.1).monoLabel()
                                        }
                                        Spacer()
                                    }
                                    .padding(.horizontal, 20)
                                    .frame(minHeight: 84)
                                }
                            }
                        }
                        if !people.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                SectionTitle(text: "gente que sigues")
                                ForEach(people) { p in
                                    HStack(spacing: 14) {
                                        Seal(person: p, size: 36)
                                        Text("@\(p.handle)").font(.kura.ui(15, .medium)).foregroundStyle(KColor.text)
                                        Spacer()
                                        HStack(spacing: 7) {
                                            GlyphView(glyph: .flame, size: 14)
                                            Text("le obsesiona").monoLabel()
                                        }
                                    }
                                    .frame(minHeight: 52)
                                    .contentShape(Rectangle())
                                    .kPressable(.row(inset: -10)) { store.push(.person(p.id)) }
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }
                    .padding(.top, 8)
                    .padding(.bottom, 56)
                }
            }
            .ignoresSafeArea(.container, edges: .top)
            // No share here: the web has no public page for a creator (only /{handle},
            // /{handle}/{collectionId} and /{handle}/item/{id}), so any link would 404.
            TopChrome { EmptyView() }
        }
    }
}

// MARK: - K1d / K1e · your profile as someone who doesn't follow you

struct ProfileAsStrangerView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        // Private = nobody else can open it: the web and the API answer the same 404 as a
        // profile that doesn't exist (no requests, no "approve who follows you").
        if store.profilePrivate { privateNotice } else { publicPreview }
    }

    private var privateNotice: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 10) {
                Text("este perfil no existe o es privado.").font(.kura.news(28)).foregroundStyle(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Así te ve cualquiera mientras tu perfil sea privado. Se cambia en Ajustes › privacidad.")
                    .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 24)
            .padding(.top, 140)
            .frame(maxWidth: .infinity, alignment: .leading)
            TopChrome { Text("vista previa").monoLabel() }
        }
        .ignoresSafeArea(.container, edges: .top)
    }

    @ViewBuilder private var publicPreview: some View {
        let me = store.me
        let publicCols = store.orderedCollections.filter { $0.privacy == .publicAccess && !$0.titleIDs.isEmpty }
        let followersOnly = store.collections.filter { $0.privacy == .followers }.count
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 10) {
                    Seal(person: me, size: 112)
                    Text(me.name).font(.kura.news(30)).foregroundStyle(KColor.text).padding(.top, 6)
                    Text("@\(me.handle)").monoLabel()
                    Text("Seguir")
                        .font(.kura.ui(15, .semibold))
                        .foregroundStyle(KColor.onAccent)
                        .padding(.horizontal, 20)
                        .frame(height: 44)
                        .background(KColor.accent, in: Capsule())
                        .padding(.top, 8)
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 14) {
                        Text("colecciones").font(.kura.section).foregroundStyle(KColor.text).padding(.horizontal, 8)
                        ForEach(publicCols) { c in
                            CollectionCard(collection: c, titles: store.titles(in: c), marks: [:], palette: store.palette(of: c),
                                           coverHeight: 110)
                                .padding(.horizontal, -12)
                        }
                        if followersOnly > 0 {
                            FollowersOnlyCard(count: followersOnly, note: "Síguela para verla.")
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 24)
                }
                .padding(.top, 124)
                .padding(.bottom, 60)
            }
            .ignoresSafeArea(.container, edges: .top)
            TopChrome {
                Text("vista previa").monoLabel()
            }
        }
    }
}

/// Seguir is the screen's honey accent (flat on every OS); Siguiendo / Solicitado sit next to
/// the share chip, so they take the same glass.
private struct FollowSurface: ViewModifier {
    let honey: Bool
    func body(content: Content) -> some View {
        if honey { content.background(KColor.accent, in: Capsule()) } else { content.kGlass(Capsule(), interactive: true) }
    }
}
