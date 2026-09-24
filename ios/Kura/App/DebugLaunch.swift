import Foundation

/// DEBUG: `-kuraScreen <name>` opens the app directly on a screen so the
/// simulator can be screenshotted without driving the UI.
///
/// splash · onboarding · signup · username · pick · people · login ·
/// collections · loading · empty · offline · newcollection · collection ·
/// list · auto · more · share · shareprivate · actions · add · title · series · album · waiting ·
/// complete · feed · discover · profile
enum DebugLaunch {
    /// `-kuraScreen <name>` or `-kuraMock` → the app runs on `MockAPI` (DEBUG only).
    static var wantsMock: Bool {
        #if DEBUG
        let d = UserDefaults.standard
        return d.string(forKey: "kuraScreen") != nil || d.bool(forKey: "kuraMock")
        #else
        return false
        #endif
    }

    @MainActor
    static func configure(_ store: AppStore) {
        #if DEBUG
        // `-kuraFailHydrate YES`: every `GET /titles?ids=` fails (live), to see the "incompleto" strips.
        // (Read directly by `LiveAPI`: `-kuraDelete401 YES` makes `DELETE /me` answer 401 with a
        // live account; `-kuraFailLogout YES` makes `POST auth/logout` fail as offline.)
        store.debugFailHydrate = UserDefaults.standard.bool(forKey: "kuraFailHydrate")
        guard let screen = UserDefaults.standard.string(forKey: "kuraScreen") else { return }
        func main(_ tab: Tab = .collections, _ routes: [Route] = [], sheet: SheetRoute? = nil) {
            store.phase = .main
            store.tab = tab
            store.paths[tab] = routes
            store.pendingSheet = sheet
        }
        switch screen {
        case "splash":
            store.phase = .splash
            store.holdSplash = true
        case "onboarding":
            store.phase = .onboarding; store.onboardingStep = .welcome
        case "signup":
            store.phase = .onboarding; store.onboardingStep = .signup
        case "username":
            store.phase = .onboarding; store.onboardingStep = .username
        case "pick":
            store.phase = .onboarding; store.onboardingStep = .pick
        case "people":
            store.phase = .onboarding; store.onboardingStep = .people
            store.onboardingPicks = ["chihiro", "ma", "severance"]
        case "login":
            store.phase = .onboarding; store.onboardingStep = .login
        case "collections":
            main()
        case "loading":
            store.keepLoading = true
            main()
        case "empty":
            store.emptyLibrary = true
            main()
        case "offline":
            store.offline = true
            main()
        case "newcollection":
            main(sheet: .newCollection(addingTitleID: nil))
        case "collection":
            main(.collections, [.collection("hermana")])
        case "shelf":
            main(.collections, [.collection("musica-2026")])
        case "list":
            main(.collections, [.collection("pendientes")])
            store.pendingListCollection = "pendientes"
        case "auto":
            main(.collections, [.automatic])
        case "more":
            main(.collections, [.collection("hermana")], sheet: .more("hermana"))
        case "share":
            main(.collections, [.collection("hermana")], sheet: .share("hermana"))
        case "shareprivate":
            main(.collections, [.collection("pendientes")], sheet: .share("pendientes"))
        case "actions":
            main(.collections, [.collection("hermana")], sheet: .titleActions(titleID: "chihiro", collectionID: "hermana"))
        case "add":
            main(.collections, [.collection("pendientes")], sheet: .addTitles("pendientes"))
        case "emptycollection":
            main(.collections, [.collection("correr")])
        case "title":
            main(.collections, [.title("chihiro")])
        case "series":
            main(.collections, [.title("severance")])
        case "album":
            main(.collections, [.title("mindofmine")])
        case "waiting":
            main(.collections, [.title("ycse")])
        case "complete":
            main(.collections, [.title("pearl")], sheet: .complete(titleID: "pearl", focusReview: false))
        case "feed":
            main(.feed)
        case "feedreview":
            main(.feed)
            store.debugFeedAnchor = "f3"
        case "feedsuggest":
            main(.feed)
            store.debugFeedAnchor = "f5"
        case "toast":
            main(.collections, [.collection("hermana")])
            store.pendingAction = { [weak store] in store?.remove("pearl", from: "hermana") }
        case "discover":
            main(.discover)
        case "profile":
            main(.profile)
        // Flujo 06 · obra (full file)
        case "nostate":
            main(.collections, [.title("garza")])
        case "slider":
            main(.collections, [.title("chihiro")], sheet: .complete(titleID: "chihiro", focusReview: false))
        case "today":
            store.now = MockData.date(2026, 10, 16, 10)
            main(.collections, [.title("ycse")])
        case "unavailable":
            main(.collections, [.title("pearl")])
        case "announced":
            main(.collections, [.title("showgirl")])
        case "aviso":
            store.phase = .main
            store.debugOverlay = .releaseNotification
        // Flujo 07 · descubrir
        case "recents":
            main(.discover)
            store.debugDiscoverQuery = ("", false)
        case "typing":
            main(.discover)
            store.debugDiscoverQuery = ("mi", false)
        case "results":
            main(.discover)
            store.debugDiscoverQuery = ("miyazaki", true)
        case "saveto":
            main(.discover, sheet: .saveTo("mononoke"))
            store.debugDiscoverQuery = ("miyazaki", true)
        case "noresults":
            main(.discover)
            store.debugDiscoverQuery = ("mononokee", true)
        case "creator":
            main(.discover, [.creator("Hayao Miyazaki")])
        // Flujo 08 · gente
        case "feedempty":
            main(.feed)
            store.debugEmptyFollowing = true
        case "notifications":
            main(.feed, [.notifications])
        case "notificationsempty":
            main(.feed, [.notifications])
            store.notifications = []
        case "person":
            main(.feed, [.person("luciarrr")])
        case "personoptions":
            main(.feed, [.person("luciarrr")], sheet: .personOptions("luciarrr"))
        case "unfollow":
            main(.feed, [.person("luciarrr")])
            store.pendingAction = { [weak store] in store?.followFromProfile("luciarrr") }
        case "followers":
            main(.feed, [.person("luciarrr"), .followers("luciarrr", showFollowing: false)])
        case "private":
            main(.feed, [.person("tomasv")])
        case "requested":
            main(.feed, [.person("tomasv")])
            store.requested = ["tomasv"]
        case "stranger":
            main(.profile, [.settings, .settingsPrivacy, .profileAsStranger])
        case "strangerprivate":
            // After the launch: bootstrap re-reads `me.isPublic` and would undo it.
            store.pendingAction = { [weak store] in store?.profilePrivate = true }
            main(.profile, [.settings, .settingsPrivacy, .profileAsStranger])
        // Flujo 09 · tu perfil
        case "editprofile":
            main(.profile, [.editProfile])
        case "profileempty":
            store.emptyLibrary = true
            main(.profile)
        // Flujo 10 · recap
        case "recap":
            main(.profile, [.recap])
        case "recapcard":
            main(.profile, [.recap, .recapShare])
        case "recaphistory":
            main(.profile, [.recap, .recapHistory])
        case "recapempty":
            store.debugEmptyRecap = true
            main(.profile, [.recap])
        // Flujo 11 · ajustes
        case "settings":
            main(.profile, [.settings])
        case "privacy":
            main(.profile, [.settings, .settingsPrivacy])
        case "musicapp":
            main(.profile, [.settings, .musicApp])
        case "deleteaccount":
            main(.profile, [.settings], sheet: .deleteAccount)
        default:
            break
        }
        #endif
    }
}
