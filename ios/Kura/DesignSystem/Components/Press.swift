import SwiftUI
import UIKit

// MARK: - Press feedback for tappable views that aren't Buttons

/// How a pressed non-Button reads: covers and cards dim + shrink (like `KPressStyle`);
/// full-width rows get the sheet-row fill instead (a shrinking row looks broken).
/// `inset`: how far the fill sits inside the row's bounds (negative = bleeds past them,
/// for rows whose side padding lives on their container).
enum KPressFeel {
    case scale
    case row(inset: CGFloat)
    static let row = KPressFeel.row(inset: 8)

    var isScale: Bool { if case .scale = self { return true }; return false }
    var rowInset: CGFloat? { if case .row(let i) = self { return i }; return nil }
}

extension View {
    /// Tap (and optional long press) with touch-down feedback, for views that can't be a
    /// `Button` (they hold other buttons, or need a long press). Press-in is instant,
    /// release springs back. Scrolling still wins: the press gesture fails once the finger
    /// travels, exactly like the plain `onLongPressGesture` it replaces.
    func kPressable(_ feel: KPressFeel = .scale,
                    longPress: (() -> Void)? = nil,
                    action: @escaping () -> Void) -> some View {
        modifier(KPressable(feel: feel, action: action, longPress: longPress))
    }

    /// Grows the hit area to at least 44 pt without moving anything: the content shape
    /// is padded out, then the layout padding is taken back.
    func kHitArea(horizontal: CGFloat = 0, vertical: CGFloat = 0) -> some View {
        padding(.horizontal, horizontal)
            .padding(.vertical, vertical)
            .contentShape(Rectangle())
            .padding(.horizontal, -horizontal)
            .padding(.vertical, -vertical)
    }
}

private struct KPressable: ViewModifier {
    let feel: KPressFeel
    let action: () -> Void
    let longPress: (() -> Void)?
    @State private var pressed = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    func body(content: Content) -> some View {
        content
            .background {
                if let inset = feel.rowInset {
                    RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous)
                        .fill(Color.white.opacity(pressed ? 0.06 : 0))
                        .padding(.horizontal, inset)
                }
            }
            .opacity(feel.isScale && pressed ? 0.72 : 1)
            .scaleEffect(feel.isScale && pressed && !reduce ? 0.97 : 1)
            .animation(pressed ? nil : KMotion.release, value: pressed)
            .onTapGesture(perform: action)
            // A long press that never fires (no `longPress`) still reports touch-down.
            .onLongPressGesture(minimumDuration: longPress == nil ? 3600 : 0.4) {
                guard let longPress else { return }
                KHaptic.play(.firm)
                longPress()
            } onPressingChanged: { down in
                pressed = down
                if down, longPress != nil { KHaptic.prepare(.firm) }
            }
    }
}

// MARK: - Haptics

/// The app's ONE haptic entry point and its whole vocabulary (founder, 2026-09-27: "estandarízalos y
/// gobiérnalos en settings"). Nothing else in `ios/Kura` touches a `UIFeedbackGenerator` or
/// `.sensoryFeedback` — `scripts/check-haptics.sh` fails the check if something does. Pick by what
/// the moment MEANS, never by how strong it should feel; same event = same haptic everywhere:
///
/// - `selection`: the chosen thing changed (chips, pickers, carousel crossing a card, a reorder
///   step, a multi-select row, an episode tick). The finest tick iOS has.
/// - `tap`: a light, instant commit the user just made (follow, add / save to a collection, pin,
///   an alert on, a reaction stop, the reorder handle lifting). Also the switch-on confirmation.
/// - `firm`: a weighty commit (Me obsesiona, a long press firing).
/// - `hit(intensity)`: a physical collision whose strength follows the gesture (the feed's card
///   hitting the top, `FeedHits`). Rigid: a hard edge, not a soft bump.
/// - `pull(intensity)`: the opposite gesture settling (scrolling back up, the card above is dragged
///   down into its place under the header by the one below, `FeedHits`). Soft: a cushioned arrival,
///   never a second `hit` — the two directions of the same stack must not feel alike.
/// - `success`: an async action that finished on the server after the user confirmed it (report,
///   block / unblock, link / unlink / merge an account, close a session).
/// - `warning`: the action was refused on purpose (the 4th onboarding pick, a review Completo can't carry).
/// - `error`: a write failed (every `.retry` toast, fired centrally in `AppStore.showToast`).
///
/// One central check: `play` does nothing when Ajustes › Vibraciones is off (`isEnabled`, a device
/// pref in `UserDefaults`, default ON, kept across sign-out). iOS's own "Vibración del sistema"
/// switch is honored by UIKit underneath. Generators are kept and prepared (a fresh one per tap wakes
/// the Taptic Engine late and the bump lands a frame after the change), and the same event within
/// 40 ms is one haptic: no bursts from a fling across the carousel or a double-fired callback.
@MainActor
enum KHaptic {
    enum Event: Equatable {
        case selection, tap, firm, success, warning, error
        case hit(intensity: CGFloat)
        case pull(intensity: CGFloat)

        /// A reaction mark: Me obsesiona is weighty, Completo / Me gusta are light; clearing is silent.
        static func reaction(_ mark: Mark?) -> Event? {
            switch mark {
            case .obsessed: return .firm
            case .liked, .completed: return .tap
            case nil: return nil
            }
        }

        fileprivate var kind: Int {
            switch self {
            case .selection: return 0
            case .tap: return 1
            case .firm: return 2
            case .success: return 3
            case .warning: return 4
            case .error: return 5
            case .hit: return 6
            case .pull: return 7
            }
        }
    }

    /// Ajustes › Vibraciones (`@AppStorage` reads the same key). Absent = ON.
    static let enabledKey = "kura.haptics"
    /// `bool(forKey:)`, not `as? Bool`: a launch argument (`-kura.haptics NO`) arrives as a string.
    static var isEnabled: Bool {
        let d = UserDefaults.standard
        return d.object(forKey: enabledKey) == nil || d.bool(forKey: enabledKey)
    }

    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private static let soft = UIImpactFeedbackGenerator(style: .soft)
    private static let selector = UISelectionFeedbackGenerator()
    private static let notification = UINotificationFeedbackGenerator()

    private static let burst: CFTimeInterval = 0.04
    private static var last: (kind: Int, t: CFTimeInterval) = (-1, 0)

    /// Wakes the engine ahead of a haptic that's about to be likely (a press went down, a scroll
    /// phase began), so it lands on the frame.
    static func prepare(_ e: Event) {
        guard isEnabled else { return }
        switch e {
        case .selection: selector.prepare()
        case .tap: light.prepare()
        case .firm: medium.prepare()
        case .hit: rigid.prepare()
        case .pull: soft.prepare()
        case .success, .warning, .error: notification.prepare()
        }
    }

    /// Plays one event (the only way the app vibrates). No-op when Vibraciones is off.
    static func play(_ e: Event?) {
        guard let e else { return }
        guard isEnabled else {
            #if DEBUG
            KBodyLog.hit("HAPTIC muted \(e)")
            #endif
            return
        }
        let now = CACurrentMediaTime()
        if last.kind == e.kind, now - last.t < burst { return }
        last = (e.kind, now)
        switch e {
        case .selection: selector.selectionChanged(); selector.prepare()
        case .tap: light.impactOccurred(); light.prepare()
        case .firm: medium.impactOccurred(); medium.prepare()
        case .hit(let intensity): rigid.impactOccurred(intensity: min(max(intensity, 0), 1)); rigid.prepare()
        case .pull(let intensity): soft.impactOccurred(intensity: min(max(intensity, 0), 1)); soft.prepare()
        case .success: notification.notificationOccurred(.success); notification.prepare()
        case .warning: notification.notificationOccurred(.warning); notification.prepare()
        case .error: notification.notificationOccurred(.error); notification.prepare()
        }
        #if DEBUG
        KBodyLog.hit("HAPTIC fired \(e)")
        #endif
    }
}
