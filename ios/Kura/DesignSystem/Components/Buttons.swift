import SwiftUI

/// Press feedback without borders or glows: a slight dim + scale.
struct KPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.72 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
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

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let glyph { GlyphView(glyph: glyph, size: 16) }
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 15, weight: .semibold))
                }
                Text(title).font(.kura.ui(fontSize, .semibold)).lineLimit(1)
                if let trailingSystemImage {
                    Image(systemName: trailingSystemImage).font(.system(size: 13, weight: .semibold))
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

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage { Image(systemName: systemImage).font(.system(size: 17, weight: .semibold)) }
                Text(title).font(.kura.ui(16, .semibold))
            }
            .foregroundStyle(enabled ? KColor.bg : KColor.text2)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(enabled ? KColor.text : KColor.s2, in: Capsule())
            .contentShape(Capsule())
            .animation(.easeInOut(duration: 0.22), value: enabled)
        }
        .kPress()
        .disabled(!enabled)
    }
}

/// Honey — only "Seguir", once per screen.
struct HoneyButton: View {
    var title = "Seguir"
    var height: CGFloat = 36
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.kura.ui(14, .semibold))
                .foregroundStyle(KColor.onAccent)
                .padding(.horizontal, 14)
                .frame(height: height)
                .background(KColor.accent, in: Capsule())
        }
        .kPress()
    }
}

/// Follow toggle for places where honey is already spent (or not allowed):
/// Seguir in glass ↔ Siguiendo quiet.
struct FollowToggle: View {
    let following: Bool
    var honey = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(following ? "Siguiendo" : "Seguir")
                .font(.kura.ui(14, .semibold))
                .foregroundStyle(following ? KColor.text2 : (honey ? KColor.onAccent : KColor.text))
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(following ? Color.clear : (honey ? KColor.accent : KColor.glassBg), in: Capsule())
                .contentShape(Capsule())
                .animation(.easeInOut(duration: 0.2), value: following)
        }
        .kPress()
        .accessibilityLabel(following ? "Dejar de seguir" : "Seguir")
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
        .animation(.easeInOut(duration: 0.18), value: on)
        .accessibilityHidden(true)
    }
}
