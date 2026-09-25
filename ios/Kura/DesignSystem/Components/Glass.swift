import SwiftUI

// MARK: - Liquid Glass (iOS 26+)

/// Kura's glass, by OS: from iOS 26 the chrome that floats over content (dock, 44 chips,
/// glass buttons, toast, compact sheet, the spoiler control) is the system's Liquid Glass;
/// before that it's Kura's flat fill. Content (pills, cards, cover badges) never goes glass —
/// glass is the navigation/control layer, not the content layer.
extension View {
    /// `interactive`: the glass reacts to touch (controls). `fill`: the pre-26 surface.
    /// `tint`: for surfaces that carry reading text (sheet, toast), so what's behind stays quiet.
    @ViewBuilder
    func kGlass<S: Shape>(_ shape: S, fill: Color = KColor.glassBg, interactive: Bool = false, tint: Color? = nil) -> some View {
        if #available(iOS 26.0, *) {
            let glass: Glass = interactive ? .regular.interactive() : .regular
            glassEffect(glass.tint(tint), in: shape)
        } else {
            background(fill, in: shape)
        }
    }

    /// Press feedback for a glass control: interactive glass already responds on iOS 26,
    /// so the dim + scale of `kPress` only applies before it.
    @ViewBuilder
    func kGlassPress() -> some View {
        if #available(iOS 26.0, *) {
            buttonStyle(.plain)
        } else {
            kPress()
        }
    }
}
