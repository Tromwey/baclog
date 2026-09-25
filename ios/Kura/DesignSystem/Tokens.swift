import SwiftUI
import UIKit

// MARK: - Hex color math

/// A color in sRGB 0…255, used for the palette math the design system specifies
/// (`mix`, inversion). Everything the DS describes as "mezclado X % hacia Y"
/// goes through here so the numbers match the web mocks exactly.
struct RGB: Hashable {
    var r: Double
    var g: Double
    var b: Double

    init(r: Double, g: Double, b: Double) {
        self.r = r; self.g = g; self.b = b
    }

    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        let v = UInt32(s, radix: 16) ?? 0
        r = Double((v >> 16) & 0xff)
        g = Double((v >> 8) & 0xff)
        b = Double(v & 0xff)
    }

    /// The DS `mix(a, b, k)`: `k` is how far toward `other` (0 = self, 1 = other).
    func mix(_ other: RGB, _ k: Double) -> RGB {
        let k = min(max(k, 0), 1)
        return RGB(r: (r * (1 - k) + other.r * k).rounded(),
                   g: (g * (1 - k) + other.g * k).rounded(),
                   b: (b * (1 - k) + other.b * k).rounded())
    }

    /// `0xffffff ^ hex` — used by the seal.
    var inverted: RGB { RGB(r: 255 - r, g: 255 - g, b: 255 - b) }

    var color: Color { Color(.sRGB, red: r / 255, green: g / 255, blue: b / 255, opacity: 1) }
}

extension Color {
    init(hex: String, opacity: Double = 1) {
        let c = RGB(hex: hex)
        self.init(.sRGB, red: c.r / 255, green: c.g / 255, blue: c.b / 255, opacity: opacity)
    }
}

// MARK: - Color tokens

/// Kura color tokens, copied from `sistema-de-diseno.dc.html`. No red anywhere;
/// honey (`accent`) appears once per screen and only on "Seguir".
enum KColor {
    static let bgHex = "#0b0b0d"
    static let s1Hex = "#141417"
    static let s2Hex = "#1c1c21"
    static let textHex = "#f4f3ee"

    static let bg = Color(hex: bgHex)
    /// `bg` for UIKit (the window behind SwiftUI).
    static let bgUI = UIColor(red: 0x0b / 255, green: 0x0b / 255, blue: 0x0d / 255, alpha: 1)
    static let s1 = Color(hex: s1Hex)
    static let s2 = Color(hex: s2Hex)
    static let text = Color(hex: textHex)
    static let text2 = Color(hex: "#b9b8c2")
    static let text3 = Color(hex: "#8f8e9b")
    static let glassBg = Color.white.opacity(0.075)
    static let glassArt = Color(.sRGB, red: 11 / 255, green: 11 / 255, blue: 13 / 255, opacity: 0.5)
    static let accent = Color(hex: "#efce8d")
    static let onAccent = Color(hex: "#0b0b0d")

    static let obsessedHex = "#ec8e76"
    static let likedHex = "#9cbae1"
    static let completedHex = "#a0cba0"
    static let obsessed = Color(hex: obsessedHex)
    static let liked = Color(hex: likedHex)
    static let completed = Color(hex: completedHex)
    static let waiting = Color(hex: "#b9a6e8")

    /// Dock: `rgba(20,20,26,.5)` over a blur.
    static let dock = Color(.sRGB, red: 20 / 255, green: 20 / 255, blue: 26 / 255, opacity: 0.5)
    static let dockActive = Color.white.opacity(0.14)
    /// Sheet scrim `rgba(5,5,6,.62)`.
    static let scrim = Color(.sRGB, red: 5 / 255, green: 5 / 255, blue: 6 / 255, opacity: 0.62)
    /// Sheet grabber `rgba(255,255,255,.18)`.
    static let grabber = Color.white.opacity(0.18)
    /// Spine band `rgba(0,0,0,.24)`.
    static let spine = Color.black.opacity(0.24)
    /// Radio ring `rgba(244,243,238,.24)`.
    static let radioRing = Color(hex: textHex, opacity: 0.24)
    /// Selected glass (`rgba(255,255,255,.22)`) — pressed/selected state for glass controls.
    static let glassSelected = Color.white.opacity(0.22)

    /// Fixed art tiles that have no cover to tint from — the only gradients not born from a
    /// palette. The recap notification's 蔵 tile (warm) and "no puedo esperar"'s lead (pizarra).
    static let recapTile = [Color(hex: "#49291d"), Color(hex: "#34211a")]
    static let waitingLead = [Color(hex: "#3a5a70"), Color(hex: "#1c2a35")]
}

// MARK: - Radii / sizes

enum KRadius {
    static let coverS: CGFloat = 8
    static let coverL: CGFloat = 14
    static let surface: CGFloat = 18
    static let screen: CGFloat = 26
    static let sheet: CGFloat = 36
    static let field: CGFloat = 16
}

enum KSize {
    static let touch: CGFloat = 44
    static let chromeTop: CGFloat = 64
    /// Top of a tab root's title (tus colecciones, descubrir, tu feed): one value for every
    /// tab and every state (loading, empty, loaded), whatever chip sits beside it.
    static let titleTop: CGFloat = chromeTop + 4
    /// Top of the content under the back chip on a pushed screen (its title, usually).
    static let pushedTitleTop: CGFloat = 124
    static let chromeSide: CGFloat = 24
    static let spine: CGFloat = 40
    static let cardCoverPinned: CGFloat = 150
    static let cardCoverCompact: CGFloat = 120
}

// MARK: - Shadows

/// CSS box-shadows approximated for SwiftUI (radius ≈ blur / 2; SwiftUI has no spread).
enum KShadow {
    /// `control`: a draggable knob lifted off its track (the mark slider).
    case cover, stack, float, control

    var color: Color {
        switch self {
        case .control: return Color.black.opacity(0.5)
        case .cover: return Color.black.opacity(0.72)
        case .stack: return Color.black.opacity(0.42)
        case .float: return Color.black.opacity(0.55)
        }
    }
    var radius: CGFloat {
        switch self {
        case .control: return 8
        case .cover: return 11
        case .stack: return 9
        case .float: return 22
        }
    }
    var y: CGFloat {
        switch self {
        case .control: return 6
        case .cover: return 14
        case .stack: return -8
        case .float: return 14
        }
    }
}

extension View {
    /// Paints `color` ABOVE the view's top edge, so pulling a scroll view down past its top (the
    /// rubber band) shows the header's own color stretching up instead of bare `bg`. Put it on
    /// the tinted header (or the feed's first card), with that surface's top color.
    /// iOS 26+ draws its own scroll-edge effect (a dimmed, blurred band) under the status bar
    /// once content scrolls beneath it. On a screen whose chrome floats transparently over its
    /// own tinted surface (the feed) that band reads as a cut across the status bar: hide it there.
    @ViewBuilder func kNoTopEdgeEffect() -> some View {
        if #available(iOS 26.0, *) {
            scrollEdgeEffectHidden(true, for: .top)
        } else {
            self
        }
    }

    func kOverscrollFill(_ color: Color) -> some View {
        background(alignment: .top) {
            color.frame(height: 1200).offset(y: -1200).allowsHitTesting(false)
        }
    }

    func kShadow(_ s: KShadow, opacity: Double = 1) -> some View {
        shadow(color: s.color.opacity(opacity), radius: s.radius, x: 0, y: s.y)
    }
}

// MARK: - Tinted surfaces

/// The only way color enters the UI: a cover's two-hex palette dragged toward black.
enum Tint {
    /// `k = 1 − 0.45 · 0.78`
    static let k: Double = 1 - 0.45 * 0.78
    static let topTarget = RGB(hex: "#101013")
    static let bottomTarget = RGB(hex: "#0c0c10")

    static func ends(_ palette: [String]) -> (RGB, RGB) {
        let a = RGB(hex: palette.first ?? "#6c6b76")
        let b = RGB(hex: palette.count > 1 ? palette[1] : (palette.first ?? "#6c6b76"))
        return (a.mix(topTarget, k), b.mix(bottomTarget, min(1, k + 0.08)))
    }

    /// Card surface: 168° gradient between the two ends (feed, collection cards).
    static func card(_ palette: [String]) -> LinearGradient {
        let (top, bottom) = ends(palette)
        return LinearGradient(colors: [top.color, bottom.color],
                              startPoint: angle168.start, endPoint: angle168.end)
    }

    /// Header surface outside the feed: fades to `bg` in its last third.
    static func header(_ palette: [String]) -> LinearGradient {
        let (top, bottom) = ends(palette)
        return LinearGradient(stops: [
            .init(color: top.color, location: 0),
            .init(color: bottom.color, location: 0.66),
            .init(color: KColor.bg, location: 1)
        ], startPoint: .top, endPoint: .bottom)
    }

    /// Profile header: the three obsessions blended top to bottom, fading to bg.
    static func header3(_ palettes: [[String]]) -> LinearGradient {
        let tops = palettes.prefix(3).map { ends($0).0 }
        guard !tops.isEmpty else { return neutralHeader }
        var stops: [Gradient.Stop] = []
        for (i, c) in tops.enumerated() {
            stops.append(.init(color: c.color, location: Double(i) / Double(max(tops.count, 1)) * 0.66))
        }
        stops.append(.init(color: KColor.bg, location: 1))
        return LinearGradient(stops: stops, startPoint: UnitPoint(x: 0.2, y: 0), endPoint: UnitPoint(x: 0.8, y: 1))
    }

    /// Without a cover there is no color: s1 → bg.
    static let neutralHeader = LinearGradient(colors: [KColor.s1, KColor.bg], startPoint: .top, endPoint: .bottom)

    /// The top edge of `header`/`card` (its palette's first end) — or `neutralHeader`'s s1 without
    /// one. What `kOverscrollFill` extends upward.
    static func headerTop(_ palette: [String]?) -> Color {
        guard let palette, !palette.isEmpty else { return KColor.s1 }
        return ends(palette).0.color
    }

    /// Palette fallback for a cover still loading / failed: 160° between the two hex.
    static func coverFallback(_ palette: [String]) -> LinearGradient {
        let a = Color(hex: palette.first ?? KColor.s2Hex)
        let b = Color(hex: palette.count > 1 ? palette[1] : (palette.first ?? KColor.s2Hex))
        return LinearGradient(colors: [a, b], startPoint: angle160.start, endPoint: angle160.end)
    }

    /// CSS `168deg` expressed as unit points.
    static let angle168 = cssAngle(168)
    static let angle160 = cssAngle(160)

    static func cssAngle(_ deg: Double) -> (start: UnitPoint, end: UnitPoint) {
        let rad = deg * .pi / 180
        let dx = sin(rad) / 2
        let dy = -cos(rad) / 2
        return (UnitPoint(x: 0.5 - dx, y: 0.5 - dy), UnitPoint(x: 0.5 + dx, y: 0.5 + dy))
    }
}

// MARK: - Motion

/// Every curve in the app comes from here (DS "movimiento"). Rules:
/// - Tap-driven state changes are critically damped springs (no bounce): `snappy`.
/// - Bounce only after a drag that carries momentum: `momentum` (slider snap, sheet release).
/// - Fades (tint, opacity, color) are eases: `tint`, `fade`.
/// - Press: instant in, `release` out (KPressStyle, kPressable).
/// - Reduce Motion: anything spatial (move, zoom, scale, bounce) becomes a fade —
///   use `KMotion.slide(_:reduce:)`, `.kAnimation(_:value:)` and `.kScale(_:)`, which read it.
enum KMotion {
    /// Shared cover, reaction morph: 320 ms spring, barely damped past critical.
    static let spring = Animation.spring(response: 0.32, dampingFraction: 0.86)
    /// Tap-driven toggles/selections: quick, no overshoot.
    static let snappy = Animation.spring(response: 0.28, dampingFraction: 0.92)
    /// Settles a drag that had momentum (bounce allowed here only).
    static let momentum = Animation.spring(response: 0.32, dampingFraction: 0.68)
    /// Press release (press-in is instant).
    static let release = Animation.spring(response: 0.3, dampingFraction: 0.9)
    /// Tint fade.
    static let tint = Animation.easeInOut(duration: 0.24)
    /// Opacity / color fades.
    static let fade = Animation.easeInOut(duration: 0.2)
    /// Sheet up / down: springs (retargetable mid-flight), not fixed eases.
    static let sheetIn = Animation.smooth(duration: 0.34)
    static let sheetOut = Animation.smooth(duration: 0.26)
    /// Legacy name for `fade`.
    static let short = fade

    /// The system setting, for code outside a view (store, gestures).
    static var reduceMotion: Bool { UIAccessibility.isReduceMotionEnabled }

    /// A spatial animation, or a fade when Reduce Motion is on.
    static func spatial(_ a: Animation, reduce: Bool = reduceMotion) -> Animation { reduce ? fade : a }

    /// Slide in from an edge; a plain fade with Reduce Motion.
    static func slide(_ edge: Edge, reduce: Bool, fading: Bool = false) -> AnyTransition {
        if reduce { return .opacity }
        return fading ? .move(edge: edge).combined(with: .opacity) : .move(edge: edge)
    }
}

extension View {
    /// `.animation(_:value:)` that swaps a spatial curve for a fade under Reduce Motion.
    func kAnimation<V: Equatable>(_ a: Animation, value: V) -> some View {
        modifier(KReducedAnimation(animation: a, value: value))
    }

    /// Emphasis scale that Reduce Motion drops (stays at 1).
    func kScale(_ s: CGFloat) -> some View { modifier(KReducedScale(scale: s)) }
}

private struct KReducedAnimation<V: Equatable>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let animation: Animation
    let value: V
    func body(content: Content) -> some View {
        content.animation(reduce ? KMotion.fade : animation, value: value)
    }
}

private struct KReducedScale: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let scale: CGFloat
    func body(content: Content) -> some View {
        content.scaleEffect(reduce ? 1 : scale)
    }
}
