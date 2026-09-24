import SwiftUI
import UIKit

@main
struct KuraApp: App {
    @State private var store: AppStore

    init() {
        // Covers come over the network via AsyncImage (URLSession.shared), so
        // give the shared cache room: returning to a screen should not refetch.
        URLCache.shared = URLCache(memoryCapacity: 64 * 1024 * 1024, diskCapacity: 256 * 1024 * 1024)
        FontCheck.run()
        let store = AppStore(api: MockAPI())
        DebugLaunch.configure(store)
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
