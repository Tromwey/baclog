import UIKit
import UserNotifications
import os

/// The APNs device token and whether THIS account has it on the server (`PUT /me/devices/{token}`).
/// UserDefaults on purpose: an APNs token isn't a credential (it only lets our server address this
/// install), and `LiveAPI` reads it from any thread when it has to unregister before forgetting the bearer.
///
/// Local vs. remote release notices: while `isRegistered`, the server sends the "Ya salió …" push,
/// so `ReleaseNotifier` stops scheduling the local one and the pending locals are removed (they'd
/// arrive twice). Unregistering (logout, delete account, a forgotten session) turns locals back on.
enum PushRegistration {
    private static let tokenKey = "kuraPushToken"
    private static let registeredKey = "kuraPushRegistered"

    static var token: String? { UserDefaults.standard.string(forKey: tokenKey) }
    static var isRegistered: Bool { UserDefaults.standard.bool(forKey: registeredKey) }

    static func store(token: String) {
        let d = UserDefaults.standard
        if d.string(forKey: tokenKey) != token {
            d.set(token, forKey: tokenKey)
            d.set(false, forKey: registeredKey) // a rotated token isn't on the server yet
        }
    }

    static func markRegistered() { UserDefaults.standard.set(true, forKey: registeredKey) }
    static func markUnregistered() { UserDefaults.standard.set(false, forKey: registeredKey) }

    /// APNs gateway the token belongs to: Debug builds get sandbox tokens (`aps-environment =
    /// development`), Release (TestFlight, App Store) production ones.
    static var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    static func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }
}

/// Notification permission, shared by the local release notices and remote push. Kura never fires
/// the system prompt on a cold open: first its own "¿te avisamos?" sheet (once, after the tabs come
/// up), then iOS's only if you say yes. Also when you save something that hasn't come out
/// (`ReleaseNotifier`), turn a switch back on, or tap "Activar avisos" in Ajustes.
enum NotificationPermission {
    /// What iOS says about alerts for Kura, as Ajustes shows it.
    enum Status: Equatable { case undetermined, allowed, denied }

    static func status() async -> Status {
        let s = await UNUserNotificationCenter.current().notificationSettings()
        switch s.authorizationStatus {
        case .notDetermined: return .undetermined
        case .authorized, .provisional, .ephemeral: return .allowed
        default: return .denied
        }
    }

    /// The iPhone's Ajustes page for Kura's notifications (a denial can only be undone there).
    @MainActor
    static func openSystemSettings() {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }

    /// Kura's own "¿te avisamos?" was already shown on this install (once, never nagging).
    static var didOfferPrompt: Bool {
        get { UserDefaults.standard.bool(forKey: "kuraNotifOffered") }
        set { UserDefaults.standard.set(newValue, forKey: "kuraNotifOffered") }
    }

    /// True when alerts may be shown (authorized, provisional or ephemeral).
    static func isAllowed() async -> Bool {
        let s = await UNUserNotificationCenter.current().notificationSettings()
        switch s.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return true
        default: return false
        }
    }

    /// Asks only while the answer is still "not determined"; returns whether alerts are allowed.
    @discardableResult
    static func requestIfUndetermined() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let s = await center.notificationSettings()
        guard s.authorizationStatus == .notDetermined else { return await isAllowed() }
        return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// Asks APNs for this install's token (the answer lands in `KuraAppDelegate`). Never in the mock.
    @MainActor
    static func registerForRemote() {
        guard !KuraRuntime.usesMock else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }
}

/// The app delegate's line to the store (the delegate is created by SwiftUI before `KuraApp.init`
/// finishes, so it can't be handed the store directly).
@MainActor
final class PushBridge {
    static let shared = PushBridge()
    weak var store: AppStore?
}

/// `UIApplicationDelegateAdaptor`: APNs registration and notification taps (warm and cold).
final class KuraAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    private let log = Logger(subsystem: "com.tromwey.kura", category: "push")

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Set before launch finishes so a tap that cold-starts the app is delivered to `didReceive`.
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = PushRegistration.hex(deviceToken)
        PushBridge.shared.store?.didReceivePushToken(hex)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        log.error("APNs registration failed: \(error.localizedDescription, privacy: .public)")
    }

    // In the foreground a notice still shows as a banner (and in the list).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let destination = PushDestination(userInfo: response.notification.request.content.userInfo)
        DispatchQueue.main.async {
            if let destination { PushBridge.shared.store?.openPush(destination) }
            completionHandler()
        }
    }
}
