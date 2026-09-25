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
                KHaptic.impact(.medium)
                longPress()
            } onPressingChanged: { down in
                pressed = down
                if down, longPress != nil { KHaptic.prepare(.medium) }
            }
    }
}

// MARK: - Haptics

/// Kept, prepared generators: a fresh generator per tap wakes the Taptic Engine late and
/// the bump lands a frame after the change. `impact` fires and re-prepares for the next one.
@MainActor
enum KHaptic {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let selection = UISelectionFeedbackGenerator()
    private static let notification = UINotificationFeedbackGenerator()

    private static func generator(_ style: UIImpactFeedbackGenerator.FeedbackStyle) -> UIImpactFeedbackGenerator {
        style == .medium || style == .heavy || style == .rigid ? medium : light
    }

    static func prepare(_ style: UIImpactFeedbackGenerator.FeedbackStyle) { generator(style).prepare() }

    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let g = generator(style)
        g.impactOccurred()
        g.prepare()
    }

    static func select() {
        selection.selectionChanged()
        selection.prepare()
    }

    static func notify(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        notification.notificationOccurred(type)
        notification.prepare()
    }
}
