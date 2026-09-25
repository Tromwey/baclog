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

    /// This install's token is NOT (or no longer) on the server for the current account: logout,
    /// account deletion, a forgotten session, and `AppStore.sessionExpired` (a 401 anywhere —
    /// e.g. an account-wide logout on another device, which also deletes every `device_token`).
    /// Turns local release notices back on (`ReleaseNotifier.schedule` stops skipping them) and
    /// forgets the last registration, so the next session always sends its `PUT` again.
    static func markUnregistered() {
        let d = UserDefaults.standard
        d.set(false, forKey: registeredKey)
        d.removeObject(forKey: lastRegistrationKey)
    }

    // MARK: Skipping the cold-start PUT

    private static let lastRegistrationKey = "kuraPushLastRegistration"
    /// A registration older than this is sent again even if nothing changed (the server may have
    /// pruned the token after an APNs `Unregistered`, which the app never hears about).
    static let maxRegistrationAge: TimeInterval = 7 * 24 * 3600

    /// `token|environment|sha256(account)` — the account is the bearer's `sub`, hashed so the
    /// user id itself never lands in UserDefaults.
    private static func fingerprint(token: String, environment: String, account: String) -> String {
        "\(token)|\(environment)|\(AppleNonce.sha256(account))"
    }

    /// True when `PUT /me/devices/{token}` already succeeded for exactly this token, gateway and
    /// account, less than `maxRegistrationAge` ago, and nothing marked it unregistered since.
    static func isCurrent(token: String, environment: String, account: String, now: Date = Date()) -> Bool {
        let d = UserDefaults.standard
        guard d.bool(forKey: registeredKey),
              let last = d.dictionary(forKey: lastRegistrationKey),
              let fp = last["fp"] as? String, let at = last["at"] as? Double else { return false }
        let age = now.timeIntervalSince1970 - at
        return fp == fingerprint(token: token, environment: environment, account: account)
            && age >= 0 && age < maxRegistrationAge
    }

    /// Called by `LiveAPI.registerDevice` after the server answered 204.
    static func recordRegistration(token: String, environment: String, account: String, now: Date = Date()) {
        UserDefaults.standard.set(["fp": fingerprint(token: token, environment: environment, account: account),
                                   "at": now.timeIntervalSince1970], forKey: lastRegistrationKey)
    }

    /// APNs gateway the token belongs to, read from how THIS binary was signed — not from
    /// Debug/Release: a Release build installed by cable is signed for development and gets
    /// SANDBOX tokens (sending those to production APNs is a BadDeviceToken, and the server prunes
    /// the token). A development/ad-hoc install carries `embedded.mobileprovision` with its
    /// `aps-environment`; TestFlight and App Store builds carry none and are production.
    static let environment: String = {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              // The profile is a CMS envelope around a plain XML plist: find the plist and parse it.
              let start = data.range(of: Data("<?xml".utf8)),
              let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex),
              let plist = try? PropertyListSerialization.propertyList(
                  from: data[start.lowerBound..<end.upperBound], format: nil) as? [String: Any],
              let entitlements = plist["Entitlements"] as? [String: Any],
              let aps = entitlements["aps-environment"] as? String
        else { return "production" }
        return aps == "development" ? "sandbox" : "production"
    }()

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
