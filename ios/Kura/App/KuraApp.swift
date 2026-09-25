import SwiftUI
import UIKit

@main
struct KuraApp: App {
    /// APNs registration and notification taps (`Services/Push.swift`).
    @UIApplicationDelegateAdaptor(KuraAppDelegate.self) private var appDelegate
    @State private var store: AppStore

    init() {
        // FIRST, before any `Session` reads the Keychain: a bearer left behind by a deleted
        // install is wiped on a fresh install (upgrades keep theirs — rule in `InstallMarker`).
        InstallMarker.reconcile()
        // Cover bytes come over URLSession.shared (`CoverImageStore` decodes them to the drawn
        // size and keeps the bitmaps in its own NSCache), so give the shared URL cache room for
        // the raw bytes: returning to a screen should not refetch.
        URLCache.shared = URLCache(memoryCapacity: 64 * 1024 * 1024, diskCapacity: 256 * 1024 * 1024)
        FontCheck.run()
        // `LiveAPI` by default; `MockAPI` for the `-kuraScreen` captures and `-kuraMock` (DEBUG
        // only: Release doesn't compile the mock in).
        let api: KuraAPI
        var now = Date()
        #if DEBUG
        let mock = DebugLaunch.wantsMock
        KuraRuntime.usesMock = mock
        #else
        let mock = false
        #endif
        if mock {
            #if DEBUG
            // `-kuraFailWrites YES`: every mock write fails (the Reintentar paths).
            api = MockAPI(failWrites: UserDefaults.standard.bool(forKey: "kuraFailWrites"))
            now = MockData.now
            #else
            fatalError("unreachable: no mock in Release")
            #endif
        } else {
            let client = APIClient()
            var origin = URLComponents(url: client.base, resolvingAgainstBaseURL: false)
            origin?.path = ""
            origin?.query = nil
            KuraRuntime.apiOrigin = origin?.url
            let session = client.session
            KuraRuntime.bearer = { session.token }
            api = LiveAPI(client: client)
        }
        let store = AppStore(api: api, now: now)
        DebugLaunch.configure(store)
        PushBridge.shared.store = store
        _store = State(initialValue: store)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .preferredColorScheme(.dark)
                .tint(KColor.text)
        }
    }
}

// Keep the edge-swipe back gesture even though the nav bar is hidden (custom chrome).
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}
