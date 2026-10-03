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

    /// WCAG relative luminance (0 = black, 1 = white) — the web's `relativeLuminance`.
    var relativeLuminance: Double {
        func lin(_ v: Double) -> Double {
            let x = v / 255
            return x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    /// CIE L*a*b* (D65) — only to measure how far apart two tint ends read (`Tint.ends`).
    var lab: (l: Double, a: Double, b: Double) {
        func lin(_ v: Double) -> Double {
            let x = v / 255
            return x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4)
        }
        let (R, G, B) = (lin(r), lin(g), lin(b))
        let x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
        let y = 0.2126 * R + 0.7152 * G + 0.0722 * B
        let z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
        func f(_ t: Double) -> Double { t > 0.008856 ? pow(t, 1.0 / 3) : 7.787 * t + 16.0 / 116 }
        return (116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))
    }

    /// CIE76 ΔE — the web's `deltaE` (src/components/kura/tint.ts).
    func deltaE(_ o: RGB) -> Double {
        let p = lab, q = o.lab
        return ((p.l - q.l) * (p.l - q.l) + (p.a - q.a) * (p.a - q.a) + (p.b - q.b) * (p.b - q.b)).squareRoot()
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
    /// Party seals (fiesta-app-v2 `AV`): each person a flat disk of ONE of these muted tones,
    /// picked stably from their handle (`PartySeal`), with `sealInk` initials. No red.
    static let sealHexes = ["#c98b6b", "#6f8a9a", "#a58bb0", "#8a9a6f", "#c9a25a", "#b0898f"]
    static let sealInk = Color(hex: "#1c1916")
    /// "alguien"'s seal: the design's `surface-3` (white .14 over bg), opaque so stacked seals don't show through.
    static let sealSomeone = Color(hex: "#2c2c30")
    /// Hairline between groups of sheet rows `rgba(255,255,255,.08)` (a content divider: allowed).
    static let sheetDivider = Color.white.opacity(0.08)

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

    /// The two ends — each capped at `maxLuminance` so text on it keeps AA. Twin of the web's
    /// `tintEnds` (src/components/kura/tint.ts); change both or neither.
    ///
    /// Tone 1 is always the palette's first colour. Tone 2 is its second — unless those two land
    /// closer than `minEndsDelta` once tinted (a cover's two most dominant colours are often two
    /// shades of the same blue: tone 1 ≈ tone 2 and the gradient vanished on the card, the page
    /// and the profile alike). Then tone 2 is the palette colour whose tinted end is FARTHEST
    /// from tone 1 (first one on a tie). Pairs already ≥ `minEndsDelta` apart never change.
    static func ends(_ palette: [String]) -> (RGB, RGB) {
        let first = palette.first ?? "#6c6b76"
        let top = capLuminance(RGB(hex: first).mix(topTarget, k), toward: topTarget)
        func bottom(_ hex: String) -> RGB {
            capLuminance(RGB(hex: hex).mix(bottomTarget, min(1, k + 0.08)), toward: bottomTarget)
        }
        var end = bottom(palette.count > 1 ? palette[1] : first)
        var gap = top.deltaE(end)
        if gap < minEndsDelta {
            for hex in palette.dropFirst(2) {
                let c = bottom(hex), d = top.deltaE(c)
                if d > gap { end = c; gap = d }
            }
        }
        return (top, end)
    }

    /// How far apart (CIE76 ΔE, after tinting) tone 1 and tone 2 must be before tone 2 stops
    /// being simply the second colour (founder 2026-09-28: Burning 4.7, mosca 7.8, Hermoso 11.7
    /// read flat; the lively multicolour pairs sit ≥ 15). Twin of the web's `MIN_ENDS_DELTA`.
    static let minEndsDelta = 13.0

    /// The brightest a tint end may be (critica 2026-09-27, WCAG 1.4.3 — the web's
    /// `TINT_MAX_LUMINANCE`). A pale, desaturated cover (white sleeve, grey poster) mixed at
    /// k = 0.65 lands on a mid grey (L ≈ 0.07) where text-2 fell to 4.4:1; at L ≤ 0.04 text-2
    /// reads ≥ 5.8:1 on the bare end and ≥ 4.9:1 under a 5 % white card. Dark or saturated
    /// palettes sit far below the cap and are untouched — only the pale ones get pulled further
    /// toward their ink, hue kept.
    static let maxLuminance = 0.04

    /// Pull `c` toward `ink` just enough that its luminance is ≤ `maxLuminance` (the web's
    /// `capLuminance`: 16 bisection steps, then the mix at the upper bound).
    static func capLuminance(_ c: RGB, toward ink: RGB) -> RGB {
        guard c.relativeLuminance > maxLuminance else { return c }
        var lo = 0.0, hi = 1.0
        for _ in 0..<16 {
            let mid = (lo + hi) / 2
            if c.mix(ink, mid).relativeLuminance > maxLuminance { lo = mid } else { hi = mid }
        }
        return c.mix(ink, hi)
    }

    /// Card surface: 168° gradient between the two ends (feed, collection cards).
    static func card(_ palette: [String]) -> LinearGradient {
        let (top, bottom) = ends(palette)
        return LinearGradient(colors: [top.color, bottom.color],
                              startPoint: angle168.start, endPoint: angle168.end)
    }

    // Degradado único (founder, 2026-09-27): every PAGE — profiles, collections, a public
    // collection, the ficha, a creator, Editar perfil — wears `FeedSurface` (`kFeedSurface` +
    // `feedTail` ground + `kFeedDockBand` where the dock shows); every card / tile / block inside
    // a page wears `card`. The vertical header that faded to black (`header`) is gone. The one
    // exception is the onboarding below (`header3`), whose fade into black is the design's
    // (flujos-v2 32a/32b `obBg`: `linear-gradient(180deg, <pick> 0%, #0b0b0d 55%)`).

    /// Onboarding (O1/O2) only: the three picks blended top to bottom, fading to bg.
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

    /// The top edge of `header3`/`card` (its palette's first end) — or `neutralHeader`'s s1
    /// without one. What `kOverscrollFill` extends upward (the onboarding's hero).
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

// MARK: - Feed gradient (Colecciones formalizado · "Degradado del feed")

extension Tint {
    /// The two ends of the feed gradient, or nil without a palette ("sin portada no hay color").
    /// Same ends as `card` (`tintEnds` on the web); the lima ADN fallback never counts.
    static func feedEnds(_ hexes: [String]) -> (top: Color, bottom: Color)? {
        let h = FanOrder.kuraHexes(hexes)
        guard !h.isEmpty else { return nil }
        let (a, b) = ends(h)
        return (a.color, b.color)
    }

    /// The colour a feed-gradient page continues in (under the dock's band): tone 2, or `bg`.
    static func feedTail(_ hexes: [String]) -> Color { feedEnds(hexes)?.bottom ?? KColor.bg }

    /// Its first tone (what the rubber band shows above the top), or `bg`.
    static func feedTop(_ hexes: [String]) -> Color { feedEnds(hexes)?.top ?? KColor.bg }
}

/// The feed gradient over a whole page: 168°, tone 1 at the top-left corner and tone 2 by `span`
/// points along the gradient line, then the page CONTINUES in tone 2 instead of fading to black.
/// Anchored in points (CSS `linear-gradient(168deg, a 0px, b {span}px, b 100%)`): at 168° the 0
/// line passes through the top-left corner, so the colour of a point only depends on its offset
/// from that corner — a long page never stretches it. Put it BEHIND the scroll content (it scrolls
/// with it). 760 on Tus colecciones, 900 on every other page (a collection, the profiles, the
/// ficha, a creator, Editar perfil).
struct FeedSurface: View {
    let hexes: [String]
    var span: CGFloat = 900

    var body: some View {
        GeometryReader { g in
            if let e = Tint.feedEnds(hexes) {
                let rad = 168.0 * Double.pi / 180
                let dx = CGFloat(sin(rad)) * span, dy = CGFloat(-cos(rad)) * span
                LinearGradient(colors: [e.top, e.bottom], startPoint: .topLeading,
                               endPoint: UnitPoint(x: dx / max(g.size.width, 1), y: dy / max(g.size.height, 1)))
            } else {
                KColor.bg
            }
        }
        .allowsHitTesting(false)
    }
}

extension View {
    /// Scroll content wearing the feed gradient: the surface behind it, its first tone stretching
    /// up past the top when the page is pulled down.
    func kFeedSurface(_ hexes: [String], span: CGFloat) -> some View {
        // On a hero page (a collection opening from the profile) the gradient is the backdrop:
        // it comes in over the first 60 % of the progress. Identity anywhere else.
        // A short page (a collection with one title) ends before the gradient reaches tone 2:
        // the surface still runs its whole course past the content's bottom (backgrounds aren't
        // clipped), so the tail under it continues tone 2 instead of cutting mid-gradient. At
        // 168° the left edge reaches `span` along the line at span / cos 12°.
        background(alignment: .top) {
            FeedSurface(hexes: hexes, span: span)
                .frame(minHeight: (span / cos(12 * .pi / 180)).rounded(.up), alignment: .top)
                .heroBackdrop()
        }
            .background(alignment: .top) {
                Tint.feedTop(hexes).frame(height: 1200).offset(y: -1200).allowsHitTesting(false).heroBackdrop()
            }
    }

    /// The dock floats over the page's own bottom tone, not over black: a fixed 150 band from
    /// transparent to the tail (at 75 %). Put it on the screen's ZStack, above the scroll view.
    func kFeedDockBand(_ hexes: [String]) -> some View {
        kFeedDockBand(fill: Tint.feedTail(hexes))
    }

    /// The same band over any OPAQUE fill (e.g. a tail crossing between two collections): the
    /// fill is masked by the band's alpha ramp. Crossing two semi-transparent bands instead
    /// (`band(a)` + `band(b).opacity(t)`) is not a crossfade — where the ramp is partial the
    /// stack gets more opaque and skews to `a`, and the band shows as a shadow mid-drag.
    func kFeedDockBand<F: View>(fill: F) -> some View {
        overlay(alignment: .bottom) {
            fill
                .mask {
                    LinearGradient(stops: [.init(color: .black.opacity(0), location: 0),
                                           .init(color: .black, location: 0.75)],
                                   startPoint: .top, endPoint: .bottom)
                }
                .frame(height: 150)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .ignoresSafeArea(edges: .bottom)
        }
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
