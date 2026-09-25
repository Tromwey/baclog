import SwiftUI

// MARK: - 31a Notificaciones · 31b Sin notificaciones

struct NotificationsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        let today = store.notifications.filter { !$0.thisWeek }
        let week = store.notifications.filter { $0.thisWeek }
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            if store.notifications.isEmpty {
                VStack(alignment: .leading) {
                    Text("notificaciones").font(.kura.screenTitle).foregroundStyle(KColor.text)
                        .padding(.top, KSize.pushedTitleTop).padding(.horizontal, 24)
                    Spacer()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(spacing: 10) {
                    Text("todo en calma.").font(.kura.news(28)).foregroundStyle(KColor.text)
                    Text("Aquí llegan tus seguidores, los estrenos que esperas y tu recap.")
                        .font(.kura.ui(15)).foregroundStyle(KColor.text2).multilineTextAlignment(.center)
                }
                .padding(.horizontal, 32)
                .padding(.top, 340)
            } else {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("notificaciones").font(.kura.screenTitle).foregroundStyle(KColor.text)
                            .padding(.horizontal, 24).padding(.bottom, 6)
                            .accessibilityAddTraits(.isHeader)
                        if !today.isEmpty {
                            section("hoy")
                            ForEach(today) { row($0) }
                        }
                        if !week.isEmpty {
                            section("esta semana")
                            ForEach(week) { row($0) }
                        }
                    }
                    .padding(.top, KSize.pushedTitleTop)
                    .padding(.bottom, 56)
                }
            }
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
        .onDisappear { store.markNotificationsRead() }
    }

    private func section(_ t: String) -> some View {
        Text(t).font(.kura.sheetTitle).foregroundStyle(KColor.text)
            .padding(.horizontal, 20).padding(.top, 18).padding(.bottom, 4)
    }

    @ViewBuilder private func row(_ n: KNotification) -> some View {
        HStack(spacing: 14) {
            leading(n)
            VStack(alignment: .leading, spacing: 4) {
                message(n).font(.kura.ui(15)).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                Text(n.age).monoLabel()
            }
            Spacer(minLength: 8)
            trailing(n)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 6)
        .frame(minHeight: 72)
        .overlay(alignment: .leading) {
            if n.unread {
                Circle().fill(KColor.text).frame(width: 6, height: 6).padding(.leading, 8)
                    .accessibilityLabel("Nueva")
            }
        }
        .contentShape(Rectangle())
        .kPressable(.row) { open(n) }
        .accessibilityElement(children: .combine)
    }

    private func open(_ n: KNotification) {
        switch n.kind {
        case .followRequest(let id), .newFollower(let id): store.push(.person(id))
        case .release(let tid, _): store.push(.title(tid))
        case .recap: store.push(.recap)
        case .followers: store.push(.followers(store.me.id, showFollowing: false))
        }
    }

    @ViewBuilder private func leading(_ n: KNotification) -> some View {
        switch n.kind {
        case .followRequest(let id), .newFollower(let id):
            if let p = store.person(id) { Seal(person: p, size: 44) }
        case .release(let tid, _):
            if let t = store.title(tid) {
                CoverView(title: t, width: 44, height: 66, radius: KRadius.coverS).zoomSource(ZoomID.title(t.id))
                    .overlay(alignment: .bottomTrailing) {
                        GlyphView(glyph: .clock, size: 14)
                            .frame(width: 24, height: 24)
                            .background(KColor.bg, in: Circle())
                            .offset(x: 6, y: 6)
                    }
            }
        case .recap:
            Text("蔵")
                .font(.custom(KFontName.kanji, fixedSize: 20))
                .foregroundStyle(KColor.text)
                .frame(width: 44, height: 66)
                .background(LinearGradient(colors: [Color(hex: "#49291d"), Color(hex: "#34211a")], startPoint: .top, endPoint: .bottom),
                            in: RoundedRectangle(cornerRadius: KRadius.coverS, style: .continuous))
        case .followers(let ids, _):
            ZStack(alignment: .topLeading) {
                if let a = ids.first.flatMap({ store.person($0) }) { Seal(person: a, size: 34) }
                if let b = ids.dropFirst().first.flatMap({ store.person($0) }) {
                    Seal(person: b, size: 30)
                        .background(Circle().fill(KColor.bg).padding(-2))
                        .offset(x: 14, y: 14)
                }
            }
            .frame(width: 44, height: 44, alignment: .topLeading)
        }
    }

    private func message(_ n: KNotification) -> Text {
        func b(_ s: String) -> Text { Text(s).fontWeight(.semibold).foregroundColor(KColor.text) }
        func r(_ s: String) -> Text { Text(s).foregroundColor(KColor.text2) }
        switch n.kind {
        case .followRequest(let id): return b("@\(id)") + r(" quiere seguirte.")
        case .newFollower(let id): return b("@\(id)") + r(" empezó a seguirte.")
        case .release(let tid, let text): return b(store.title(tid)?.name ?? "") + r(" \(text)")
        case .recap(let text): return r("Tu ") + b("recap de agosto") + r(" \(text)")
        case .followers(let ids, let more):
            let names = ids.map { b("@\($0)") }
            var t = names.first ?? Text("")
            if names.count > 1 { t = t + r(", ") + names[1] }
            return t + r(" y \(more) más empezaron a seguirte.")
        }
    }

    @ViewBuilder private func trailing(_ n: KNotification) -> some View {
        switch n.kind {
        case .followRequest:
            switch store.requestStates[n.id] ?? .pending {
            case .pending:
                HStack(spacing: 6) {
                    Button { store.setRequest(n.id, .approved) } label: {
                        Text("Aprobar").font(.kura.ui(14, .semibold)).foregroundStyle(KColor.bg)
                            .padding(.horizontal, 14).frame(minHeight: 36)
                            .background(KColor.text, in: Capsule())
                    }
                    .kPress()
                    IconChip44(systemName: "xmark", size: 36, iconSize: 12, label: "Rechazar") { store.setRequest(n.id, .rejected) }
                }
            case .approved: Text("Aprobada").monoLabel()
            case .rejected: Text("Rechazada").monoLabel()
            }
        case .newFollower(let id):
            // Honey: the one "Seguir" on this screen.
            FollowButton(state: FollowState(following: store.isFollowing(id)), honey: true) { store.toggleFollow(id) }
        default:
            EmptyView()
        }
    }
}

// MARK: - E1 Feed vacío

struct FeedEmptyView: View {
    @Environment(AppStore.self) private var store

    /// Who to follow: the same "gente para seguir" the onboarding uses (`GET me/onboarding/people`),
    /// the first three. The mock keeps E1's three people.
    private var suggestions: [Person] {
        #if DEBUG
        if KuraRuntime.usesMock { return MockData.feedEmptySuggestions.compactMap { store.person($0) } }
        #endif
        return Array(store.onboardingPeople.prefix(3))
    }

    var body: some View {
        let suggestions = suggestions
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                Text("feed").font(.kura.screenTitle).foregroundStyle(KColor.text)
                    .padding(.top, KSize.titleTop).padding(.bottom, 14)
                    .accessibilityAddTraits(.isHeader)
                Text("tu gente todavía no llega.").font(.kura.news(30)).foregroundStyle(KColor.text)
                Text("Sigue a quien comparte tus obsesiones y aquí vas a ver lo que completan y les obsesiona.")
                    .font(.kura.ui(14)).foregroundStyle(KColor.text2).lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                let all = suggestions.allSatisfy { store.isFollowing($0.id) }
                if !suggestions.isEmpty {
                    Button {
                        for p in suggestions where !store.isFollowing(p.id) { store.toggleFollow(p.id) }
                    } label: {
                        Text(all ? "Siguiendo a los \(suggestions.count)" : "Seguir a los \(suggestions.count)")
                            .font(.kura.ui(16, .semibold))
                            .foregroundStyle(all ? KColor.text : KColor.onAccent)
                            .frame(maxWidth: .infinity).frame(height: 52)
                            .background(all ? KColor.glassBg : KColor.accent, in: Capsule())
                    }
                    .kPress()
                    .padding(.top, 18).padding(.bottom, 6)
                }
                ForEach(suggestions) { p in
                    HStack(spacing: 14) {
                        Seal(person: p, size: 44)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("@\(p.handle)").font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                            Text(p.why ?? "").monoLabel().lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        Button { store.toggleFollow(p.id) } label: {
                            Text(store.isFollowing(p.id) ? "Siguiendo" : "Seguir")
                                .font(.kura.ui(15, .semibold))
                                .foregroundStyle(store.isFollowing(p.id) ? KColor.text2 : KColor.text)
                                .padding(.horizontal, 18).frame(height: 44)
                                .background(store.isFollowing(p.id) ? Color.clear : KColor.glassBg, in: Capsule())
                        }
                        .kPress()
                    }
                    .frame(minHeight: 64)
                    .contentShape(Rectangle())
                    .kPressable(.row(inset: -10)) { store.push(.person(p.id)) }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 140)
        }
        .ignoresSafeArea(.container, edges: .top)
        .task { if !KuraRuntime.usesMock { await store.loadOnboardingPeople() } }
    }
}

// MARK: - 31c Aviso de estreno (DEBUG preview of the system notification)

/// The release push as it lands on the lock screen. The real one is a local
/// notification (`ReleaseNotifier`); this view only exists to screenshot it.
struct ReleaseNotificationPreview: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(stops: [.init(color: Color(hex: "#1b2433"), location: 0),
                                   .init(color: Color(hex: "#0e1119"), location: 0.6),
                                   .init(color: Color(hex: "#07080b"), location: 1)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            VStack(spacing: 2) {
                Text("viernes 16 de octubre").font(.system(size: 17, weight: .medium)).foregroundStyle(.white.opacity(0.8))
                Text("9:41").font(.system(size: 92, weight: .semibold)).tracking(-1.8).foregroundStyle(.white.opacity(0.92))
            }
            .padding(.top, 92)
            if let t = store.title("ycse") {
                HStack(spacing: 12) {
                    Image("KuraMark")
                        .resizable()
                        .frame(width: 38, height: 38)
                        .background(LinearGradient(colors: [Color(hex: "#232329"), Color(hex: "#0f0f12")], startPoint: .top, endPoint: .bottom))
                        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text("Ya salió \(t.name)").font(.system(size: 15, weight: .semibold)).lineLimit(1)
                            Spacer()
                            Text("ahora").font(.system(size: 13)).foregroundStyle(.white.opacity(0.6))
                        }
                        Text("La guardaste en no puedo esperar. Está en cines desde hoy.")
                            .font(.system(size: 15)).foregroundStyle(.white.opacity(0.85))
                    }
                    CoverView(title: t, width: 38, height: 57, radius: KRadius.coverS, shadow: false)
                }
                .foregroundStyle(.white)
                .padding(14)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .padding(.horizontal, 12)
                .padding(.top, 470)
            }
        }
    }
}
