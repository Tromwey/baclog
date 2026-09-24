import Foundation

/// DEBUG: `-kuraScreen <name>` opens the app directly on a screen so the
/// simulator can be screenshotted without driving the UI.
///
/// splash · onboarding · signup · username · pick · people · login ·
/// collections · loading · empty · offline · newcollection · collection ·
/// list · auto · more · actions · add · title · series · album · waiting ·
/// complete · feed · discover · profile
enum DebugLaunch {
    @MainActor
    static func configure(_ store: AppStore) {
        #if DEBUG
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
        default:
            break
        }
        #endif
    }
}
