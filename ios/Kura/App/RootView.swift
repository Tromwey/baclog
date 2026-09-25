import SwiftUI
import UIKit

/// RootRouter: splash → onboarding (first time) → main tabs. Sheets and toasts
/// are hosted here, above everything (including the dock).
struct RootView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            KColor.bg.ignoresSafeArea()
                .background(WindowBackground())

            Group {
                switch store.phase {
                case .splash:
                    SplashView()
                        .transition(.opacity)
                case .onboarding:
                    OnboardingFlow()
                        .transition(.opacity)
                case .main:
                    MainTabs()
                        .transition(.opacity)
                }
            }
            // A sheet is modal: VoiceOver never wanders into what's behind it.
            .accessibilityHidden(store.sheet != nil)

            SheetHost()
            ToastHost(dockVisible: store.phase == .main && store.path(store.tab).isEmpty && !(store.dockHidden && store.tab == .discover))
            #if DEBUG
            if store.debugOverlay == .releaseNotification {
                ReleaseNotificationPreview()
            }
            #endif
        }
        .animation(KMotion.fade, value: store.phase)
        // Coming back from the iPhone's Ajustes (where a "no" to notifications is undone).
        .onChange(of: scenePhase) { _, p in
            if p == .active, store.phase == .main { Task { await store.refreshNotificationStatus() } }
        }
        // Dynamic Type scales the Kura faces (Typography.swift) all the way into the
        // accessibility sizes. Only fixed-geometry chrome caps itself at xxxLarge
        // (`kFixedChrome()`: dock, top chips, covers, collection cards, feed cards).
    }
}

/// Paints the UIWindow itself in `bg` (#0b0b0d, same as `LaunchBackground`), so
/// nothing between the launch screen and the first SwiftUI frame — or behind a
/// keyboard / sheet / rotation snapshot — can show the system background.
private struct WindowBackground: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.isUserInteractionEnabled = false
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ v: UIView, context: Context) {
        DispatchQueue.main.async {
            guard let w = v.window, w.backgroundColor != KColor.bgUI else { return }
            w.backgroundColor = KColor.bgUI
        }
    }
}

/// Four tabs, each with its own NavigationStack (switching is instant, 0 ms,
/// and keeps each tab's place). The dock only shows at a tab's root.
///
/// iOS 26+: the dock IS the system tab bar (`TabView`), so its selection is Apple's own
/// Liquid Glass droplet — an imitation never feels right. Before 26: Kura's `Dock`.
struct MainTabs: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        Group {
            if #available(iOS 26.0, *) {
                SystemTabs()
            } else {
                KuraDockTabs()
            }
        }
        .task { await store.startIfNeeded() }
    }
}

@available(iOS 26.0, *)
private struct SystemTabs: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        // The setter also runs when the active tab is tapped again → `select` pops to root.
        TabView(selection: Binding(get: { store.tab }, set: { store.select($0) })) {
            ForEach(Tab.allCases) { tab in
                SwiftUI.Tab(value: tab) {
                    TabStack(tab: tab)
                        .toolbar(tabBarHidden(tab) ? .hidden : .visible, for: .tabBar)
                } label: {
                    Label { Text(tab.label) } icon: { Image(uiImage: DockIcon.image(tab)) }
                }
            }
        }
        .tint(KColor.text)
    }

    /// Same rule as the dock: only at a tab's root, and not while Descubrir is searching.
    private func tabBarHidden(_ tab: Tab) -> Bool {
        !store.path(tab).isEmpty || (store.dockHidden && tab == .discover)
    }
}

private struct KuraDockTabs: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack(alignment: .bottom) {
            ForEach(Tab.allCases) { tab in
                TabStack(tab: tab)
                    .opacity(store.tab == tab ? 1 : 0)
                    .allowsHitTesting(store.tab == tab)
                    .accessibilityHidden(store.tab != tab)
            }
            if store.path(store.tab).isEmpty && !(store.dockHidden && store.tab == .discover) {
                Dock()
                    .ignoresSafeArea(.keyboard)
                    .transition(.opacity)
            }
        }
        .animation(KMotion.fade, value: store.path(store.tab).isEmpty)
    }
}

private struct TabStack: View {
    @Environment(AppStore.self) private var store
    @Namespace private var coverNS
    let tab: Tab

    var body: some View {
        NavigationStack(path: Binding(get: { store.path(tab) }, set: { store.paths[tab] = $0 })) {
            root
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: Route.self) { route in
                    RouteView(route: route)
                        .toolbar(.hidden, for: .navigationBar)
                        .environment(\.coverNamespace, coverNS)
                }
        }
        .environment(\.coverNamespace, coverNS)
    }

    @ViewBuilder private var root: some View {
        switch tab {
        case .collections: CollectionsView()
        case .discover: DiscoverView()
        case .feed: FeedView()
        case .profile: ProfileView()
        }
    }
}

struct RouteView: View {
    let route: Route
    var body: some View {
        Group {
            switch route {
            case .collection(let id): CollectionDetailView(collectionID: id).zoomDestination(ZoomID.collection(id))
            case .title(let id): TitleDetailView(titleID: id).zoomDestination(ZoomID.title(id))
            case .reorder(let id): ReorderView(collectionID: id)
            case .changeCover(let id): ChangeCoverView(collectionID: id)
            case .automatic: WaitingCollectionView()
            case .person(let id): PersonProfileView(personID: id)
            case .publicCollection(let handle, let id): PublicCollectionView(handle: handle, collectionID: id)
            case .followers(let id, let f): FollowersView(personID: id, showFollowing: f)
            case .creator(let name): CreatorView(name: name)
            case .notifications: NotificationsView()
            case .recap: RecapView()
            case .recapHistory: RecapHistoryView()
            case .recapShare: RecapShareView()
            case .settings: SettingsView()
            case .settingsPrivacy: PrivacySettingsView()
            case .musicApp: MusicAppView()
            case .editProfile: EditProfileView()
            case .profileAsStranger: ProfileAsStrangerView()
            case .blockedAccounts: BlockedAccountsView()
            case .sessions: SessionsView()
            case .mergeAccount: MergeAccountView()
            case .mergeCode: MergeCodeView()
            case .mergeConfirm: MergeConfirmView()
            }
        }
        .background(KColor.bg.ignoresSafeArea())
    }
}

/// Every sheet body, by route.
struct SheetContent: View {
    let route: SheetRoute

    var body: some View {
        switch route {
        case .newCollection(let adding, let from): NewCollectionSheet(addingTitleID: adding, movingFrom: from)
        case .collectionQuick(let id): CollectionQuickSheet(collectionID: id)
        case .more(let id): MoreSheet(collectionID: id)
        case .sort(let id): SortSheet(collectionID: id)
        case .rename(let id): RenameSheet(collectionID: id)
        case .privacy(let id): PrivacySheet(collectionID: id)
        case .share(let id): ShareCollectionSheet(collectionID: id)
        case .deleteCollection(let id): DeleteCollectionSheet(collectionID: id)
        case .titleActions(let t, let c): TitleActionsSheet(titleID: t, collectionID: c)
        case .moveTo(let t, let from): MoveToSheet(titleID: t, fromID: from)
        case .complete(let t, let focus): CompleteSheet(titleID: t, focusReview: focus)
        case .saveTo(let t): SaveToSheet(titleID: t)
        case .titleMore(let t): TitleMoreSheet(titleID: t)
        case .personOptions(let p): PersonOptionsSheet(personID: p)
        case .report(let target): ReportSheet(target: target)
        case .block(let handle): BlockSheet(handle: handle)
        case .deleteAccount: DeleteAccountSheet()
        case .addTitles(let c): AddTitlesSheet(collectionID: c)
        case .revokeSession(let s): RevokeSessionSheet(session: s)
        case .unlinkIdentity(let p): UnlinkIdentitySheet(provider: p)
        case .notificationsAsk: NotificationsAskSheet()
        }
    }
}
