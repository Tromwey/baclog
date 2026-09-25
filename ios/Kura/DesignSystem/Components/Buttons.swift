import SwiftUI

/// Press feedback without borders or glows: a slight dim + scale. Press-in is instant
/// (the finger is the animation); release springs back. Reduce Motion keeps only the dim.
struct KPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        KPressBody(configuration: configuration)
    }

    private struct KPressBody: View {
        let configuration: Configuration
        @Environment(\.accessibilityReduceMotion) private var reduce
        var body: some View {
            configuration.label
                .opacity(configuration.isPressed ? 0.72 : 1)
                .scaleEffect(configuration.isPressed && !reduce ? 0.97 : 1)
                .animation(configuration.isPressed ? nil : KMotion.release, value: configuration.isPressed)
        }
    }
}

extension View {
    func kPress() -> some View { buttonStyle(KPressStyle()) }
}

/// Glass pill button — `rgba(255,255,255,.075)`, Hanken 600.
struct GlassButton: View {
    let title: String
    var systemImage: String? = nil
    var glyph: Glyph? = nil
    var height: CGFloat = 44
    var fontSize: CGFloat = 15
    var fullWidth = false
    var fill: Color = KColor.glassBg
    var trailingSystemImage: String? = nil
    let action: () -> Void
    /// Icons grow with the label next to them (Dynamic Type).
    @ScaledMetric(relativeTo: .subheadline) private var k: CGFloat = 1

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let glyph { GlyphView(glyph: glyph, size: 16) }
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 15 * k, weight: .semibold))
                }
                Text(title).font(.kura.ui(fontSize, .semibold)).lineLimit(1)
                if let trailingSystemImage {
                    Image(systemName: trailingSystemImage).font(.system(size: 13 * k, weight: .semibold))
                }
            }
            .foregroundStyle(KColor.text)
            .padding(.leading, (glyph != nil || systemImage != nil) ? 14 : 16)
            .padding(.trailing, 16)
            .frame(height: height)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .modifier(ChromeFill(fill: fill, shape: Capsule()))
            .contentShape(Capsule())
        }
        .modifier(ChromePress(glass: fill == KColor.glassBg))
    }
}

/// Solid button — text color fill, bg text. The one primary action.
struct SolidButton: View {
    let title: String
    var systemImage: String? = nil
    var height: CGFloat = 52
    var enabled = true
    let action: () -> Void
    @ScaledMetric(relativeTo: .callout) private var iconSize: CGFloat = 17

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage { Image(systemName: systemImage).font(.system(size: iconSize, weight: .semibold)) }
                Text(title).font(.kura.ui(16, .semibold))
            }
            .foregroundStyle(enabled ? KColor.bg : KColor.text2)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(enabled ? KColor.text : KColor.s2, in: Capsule())
            .contentShape(Capsule())
            .animation(KMotion.fade, value: enabled)
        }
        .kPress()
        .disabled(!enabled)
    }
}

/// Where a follow stands, from the viewer's side. `requested` is the private-profile
/// request (a no-op against the live API today, kept on screen on purpose).
enum FollowState: Equatable {
    case follow, following, requested

    init(following: Bool, requested: Bool = false) {
        self = following ? .following : (requested ? .requested : .follow)
    }

    var label: String {
        switch self {
        case .follow: return "Seguir"
        case .following: return "Siguiendo"
        case .requested: return "Solicitado"
        }
    }
}

/// The one Seguir button. Honey (the screen's one accent) only on `Seguir` and only
/// where the caller spends it; Siguiendo / Solicitado go quiet per size.
struct FollowButton: View {
    enum Size {
        /// 36 pt pill in a list row (Descubrir, Avisos, onboarding). Siguiendo loses its fill.
        case row
        /// 40 pt pill in Seguidores / Siguiendo. Siguiendo loses its fill.
        case list
        /// The feed's suggestion card: 16 pt label. Siguiendo keeps a flat glass fill.
        case card
        /// A profile's hero, 48 pt. Siguiendo / Solicitado sit next to the share chip, so they
        /// take the chrome's glass (Liquid Glass on iOS 26).
        case hero
    }

    let state: FollowState
    var size: Size = .row
    /// Seguir in honey (otherwise glass).
    var honey = false
    /// For VoiceOver: "Dejar de seguir a @handle".
    var handle: String? = nil
    /// false = a picture of the button (the "así te ven" preview): no action, hidden from VoiceOver.
    var interactive = true
    var action: () -> Void = {}

    var body: some View {
        if interactive {
            Button(action: action) { face }
                .kPress()
                .accessibilityLabel(accessibilityText)
        } else {
            face.accessibilityHidden(true)
        }
    }

    private var accessibilityText: String {
        guard state == .following else { return state.label }
        return handle.map { "Dejar de seguir a @\($0)" } ?? "Dejar de seguir"
    }

    private var metrics: (font: CGFloat, hPad: CGFloat, hit: CGFloat) {
        switch size {
        case .row: return (14, 14, 4)
        case .list: return (14, 16, 2)
        case .card: return (16, 24, 0)
        case .hero: return (16, 28, 0)
        }
    }

    private var fill: FollowFill.Kind {
        if state == .follow && honey { return .honey }
        switch size {
        case .row, .list: return state == .following ? .none : .flatGlass
        case .card: return .flatGlass
        case .hero: return .chromeGlass
        }
    }

    private var foreground: Color {
        switch fill {
        case .honey: return KColor.onAccent
        case .none: return KColor.text2
        case .flatGlass, .chromeGlass: return KColor.text
        }
    }

    @ViewBuilder private var face: some View {
        let m = metrics
        let label = Text(state.label)
            .font(.kura.ui(m.font, .semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, m.hPad)
        Group {
            switch size {
            case .row: label.frame(minHeight: 36)
            case .list: label.frame(height: 40)
            case .card: label.padding(.vertical, 14)
            case .hero: label.frame(height: 48)
            }
        }
        .modifier(FollowFill(kind: fill))
        .contentShape(Capsule())
        .kHitArea(vertical: m.hit)
        .animation(KMotion.fade, value: state)
    }
}

private struct FollowFill: ViewModifier {
    enum Kind { case honey, flatGlass, chromeGlass, none }
    let kind: Kind
    func body(content: Content) -> some View {
        switch kind {
        case .honey: content.background(KColor.accent, in: Capsule())
        case .flatGlass: content.background(KColor.glassBg, in: Capsule())
        case .chromeGlass: content.kGlass(Capsule(), interactive: true)
        case .none: content.background(Color.clear, in: Capsule())
        }
    }
}

/// 44 pt round share chip (your profile, someone else's): the system share sheet with the
/// public link. `link == nil` (a private profile would 404) → `unavailable` says why, or
/// the chip isn't drawn.
struct ShareChip: View {
    let link: URL?
    var label = "Compartir perfil"
    var unavailable: (() -> Void)? = nil

    var body: some View {
        if let link {
            ShareLink(item: link) { face }
                .accessibilityLabel(label)
        } else if let unavailable {
            Button(action: unavailable) { face }
                .buttonStyle(.plain)
                .accessibilityLabel(label)
        }
    }

    private var face: some View {
        Image(systemName: "square.and.arrow.up").font(.system(size: 16, weight: .medium))
            .foregroundStyle(KColor.text)
            .frame(width: 44, height: 44)
            .kGlass(Circle(), interactive: true)
    }
}

/// 44 pt round glass icon button (Volver, Opciones, +, campana).
struct IconChip44: View {
    let systemName: String
    var size: CGFloat = 44
    var iconSize: CGFloat = 16
    var weight: Font.Weight = .semibold
    var fill: Color = KColor.glassBg
    var label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: iconSize, weight: weight))
                .foregroundStyle(KColor.text)
                .frame(width: size, height: size)
                .modifier(ChromeFill(fill: fill, shape: Circle()))
                .contentShape(Circle())
                // Smaller chips (the 36 sheet close) still take a 44 pt touch.
                .kHitArea(horizontal: max(0, (44 - size) / 2), vertical: max(0, (44 - size) / 2))
        }
        .modifier(ChromePress(glass: fill == KColor.glassBg))
        .accessibilityLabel(label)
    }
}

/// Default glass fill → Liquid Glass on iOS 26+; any other fill (selected, s2…) stays flat.
private struct ChromeFill<S: Shape>: ViewModifier {
    let fill: Color
    let shape: S
    func body(content: Content) -> some View {
        if fill == KColor.glassBg {
            content.kGlass(shape, fill: fill, interactive: true)
        } else {
            content.background(fill, in: shape)
        }
    }
}

private struct ChromePress: ViewModifier {
    let glass: Bool
    func body(content: Content) -> some View {
        if glass { content.kGlassPress() } else { content.kPress() }
    }
}

struct BackChip: View {
    @Environment(AppStore.self) private var store
    var action: (() -> Void)? = nil
    var body: some View {
        IconChip44(systemName: "chevron.left", iconSize: 17, label: "Volver") {
            if let action { action() } else { store.pop() }
        }
    }
}

/// Radio indicator used in sheets: filled text circle with a check, or a ring.
struct RadioMark: View {
    let on: Bool
    var body: some View {
        ZStack {
            if on {
                Circle().fill(KColor.text)
                Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(KColor.bg)
            } else {
                Circle().strokeBorder(KColor.radioRing, lineWidth: 1.5)
            }
        }
        .frame(width: 26, height: 26)
        .animation(KMotion.fade, value: on)
        .accessibilityHidden(true)
    }
}
