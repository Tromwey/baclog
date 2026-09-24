import Foundation
import UserNotifications

/// 31c · "Ya salió …" — a local notification on release day at 9:00 for
/// titles saved before release (the "no puedo esperar" rule). The backend
/// will own this once push exists; until then it's scheduled on device.
enum ReleaseNotifier {
    static func schedule(_ t: Title) {
        guard case .day(let d)? = t.release, d > Date() else { return }
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = "Ya salió \(t.name)"
            content.body = "La guardaste en no puedo esperar. " + {
                switch t.format {
                case .album: return "Ya puedes escucharla."
                case .series: return "Ya puedes verla."
                case .film: return "Está en cines desde hoy."
                }
            }()
            var comps = MockData.calendar.dateComponents([.year, .month, .day], from: d)
            comps.hour = 9
            let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
            center.add(UNNotificationRequest(identifier: "release-\(t.id)", content: content, trigger: trigger))
        }
    }

    static func cancel(_ titleID: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["release-\(titleID)"])
    }
}
