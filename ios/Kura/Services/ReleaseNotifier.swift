import Foundation
import UserNotifications

/// 31c · "Ya salió …" — a local notification on release day at 9:00 for titles saved before
/// release (the "no puedo esperar" rule).
///
/// Saving an unreleased title is also THE moment Kura asks for notification permission (never on a
/// cold open). Once granted, the app registers for remote push too; while this install's token is
/// on the server (`PushRegistration.isRegistered`) the backend sends the release push and nothing
/// local is scheduled — otherwise the same notice would arrive twice. `cancelAll()` clears the locals
/// already pending when that registration lands.
enum ReleaseNotifier {
    private static let prefix = "release-"

    static func schedule(_ t: Title) {
        guard case .day(let d)? = t.release, d > Date() else { return }
        Task {
            guard await NotificationPermission.requestIfUndetermined() else { return }
            await NotificationPermission.registerForRemote()
            guard !PushRegistration.isRegistered else { return }
            let content = UNMutableNotificationContent()
            content.title = "Ya salió \(t.name)"
            content.body = "La guardaste en no puedo esperar. " + {
                switch t.format {
                case .album: return "Ya puedes escucharla."
                case .series: return "Ya puedes verla."
                case .film: return "Está en cines desde hoy."
                }
            }()
            // Same payload as the remote push: a tap opens the ficha.
            content.userInfo = ["kura": ["type": "release", "titleId": t.id]]
            var comps = MockData.calendar.dateComponents([.year, .month, .day], from: d)
            comps.hour = 9
            let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
            try? await UNUserNotificationCenter.current()
                .add(UNNotificationRequest(identifier: prefix + t.id, content: content, trigger: trigger))
        }
    }

    static func cancel(_ titleID: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [prefix + titleID])
    }

    /// Every pending local release notice (the server's push replaces them).
    static func cancelAll() {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let ids = requests.map(\.identifier).filter { $0.hasPrefix(prefix) }
            if !ids.isEmpty { center.removePendingNotificationRequests(withIdentifiers: ids) }
        }
    }
}
