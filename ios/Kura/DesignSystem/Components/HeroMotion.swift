import SwiftUI
import UIKit

// MARK: - The springs (colecciones-transiciones.dc.html)
//
// Every value here is the design's `spr({ response, damping })` — SwiftUI's
// `spring(response:dampingFraction:)` model: ω = 2π / response, critically damped at 1.
// Twin of the web's `src/lib/spring.ts`.

enum KSpringSpec {
    /// Entre colecciones: settle after the finger (and a tap on a neighbour's name).
    static let carousel = (response: 0.42, damping: 1.0)
    /// …when the finger threw it (|v| > 1.5 collections/s): the one allowed bounce.
    static let carouselFlung = (response: 0.42, damping: 0.86)
    /// Abrir (a collection from the profile, a title from its cell). Also "regresa" after a
    /// cancelled edge drag.
    static let open = (response: 0.42, damping: 1.0)
    /// Cerrar: the same path backwards, faster, inheriting the finger's velocity.
    static let close = (response: 0.3, damping: 1.0)
    /// The hold sheet (18c): in / out.
    static let holdSheetIn = Animation.spring(response: 0.4, dampingFraction: 1)
    static let holdSheetOut = Animation.spring(response: 0.3, dampingFraction: 1)
}

// MARK: - KSpring

/// One animated number driven frame by frame (CADisplayLink) with the design's analytic spring —
/// a line-by-line port of `spr()` in the design file. SwiftUI's own animations can't do what these
/// transitions need: read the value mid-flight (a finger grabbing the carousel or the edge while
/// it's still settling continues from where it IS, not from the target), hand the finger's
/// velocity over, and derive several staged values (35 % / 50 % / 60 %) from ONE progress.
///
/// Views that read `value` re-render every frame; keep those readers small (a modifier around
/// stable content), never a whole page.
@MainActor
@Observable
final class KSpring {
    private(set) var value: CGFloat
    /// Where it's heading (= `value` at rest).
    @ObservationIgnored private(set) var target: CGFloat

    private struct Run {
        var from: CGFloat
        var to: CGFloat
        var v0: CGFloat
        var w: Double
        var z: Double
        var start: CFTimeInterval
        var completion: (() -> Void)?
    }

    @ObservationIgnored private var run: Run?
    @ObservationIgnored private var link: CADisplayLink?
    @ObservationIgnored private var proxy: LinkProxy?

    /// DEBUG `-kuraMotionRate 0.1`: everything at a tenth of the speed (the design's Tweaks
    /// "cámara lenta"), to capture intermediate frames.
    static let rate: Double = {
        #if DEBUG
        let r = UserDefaults.standard.double(forKey: "kuraMotionRate")
        return r > 0 ? r : 1
        #else
        return 1
        #endif
    }()

    private static let precision: CGFloat = 0.002

    init(_ value: CGFloat = 0) {
        self.value = value
        self.target = value
    }

    var isAnimating: Bool { run != nil }

    /// The velocity right now (units per second), 0 at rest.
    var velocity: CGFloat {
        guard let r = run else { return 0 }
        return sample(r, at: CACurrentMediaTime()).vel
    }

    /// Jump (a finger moving it, a sync). Stops any run WITHOUT its completion.
    func set(_ v: CGFloat) {
        stop()
        target = v
        if value != v { value = v }
    }

    /// Stops where it is (a grab). The completion of the interrupted run never fires.
    func stop() {
        run = nil
        link?.invalidate()
        link = nil
        proxy = nil
    }

    /// Springs from the current value to `to`. `velocity` nil = keep the current one (a retarget
    /// mid-flight doesn't lose its momentum), as the design's `anim()`.
    func animate(to: CGFloat, response: Double, damping: Double = 1, velocity: CGFloat? = nil,
                 completion: (() -> Void)? = nil) {
        let v = velocity ?? self.velocity
        stop()
        target = to
        run = Run(from: value, to: to, v0: v, w: 2 * .pi / response, z: min(damping, 1),
                  start: CACurrentMediaTime(), completion: completion)
        let p = LinkProxy(self)
        let l = CADisplayLink(target: p, selector: #selector(LinkProxy.tick(_:)))
        l.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        l.add(to: .main, forMode: .common)
        proxy = p
        link = l
    }

    /// `spr().sample`: the closed-form damped oscillator, in the design's units.
    private func sample(_ r: Run, at now: CFTimeInterval) -> (val: CGFloat, vel: CGFloat) {
        let rate = Self.rate
        let t = max(0, now - r.start) * rate
        let x0 = Double(r.from - r.to), v0 = Double(r.v0) / rate, w = r.w, z = r.z
        if z < 1 {
            let wd = w * (1 - z * z).squareRoot()
            let a = x0, b = (v0 + z * w * x0) / wd
            let d = exp(-z * w * t), c = cos(wd * t), s = sin(wd * t)
            let val = Double(r.to) + d * (a * c + b * s)
            let vel = d * ((b * wd - z * w * a) * c - (a * wd + z * w * b) * s) * rate
            return (CGFloat(val), CGFloat(vel))
        } else {
            let c = v0 + w * x0, d = exp(-w * t)
            let val = Double(r.to) + (x0 + c * t) * d
            let vel = (c - w * (x0 + c * t)) * d * rate
            return (CGFloat(val), CGFloat(vel))
        }
    }

    fileprivate func tick(_ link: CADisplayLink) {
        guard let r = run else { return }
        let (val, vel) = sample(r, at: link.targetTimestamp)
        if abs(val - r.to) < Self.precision && abs(vel) < Self.precision * 10 {
            let done = r.completion
            stop()
            value = r.to
            done?()
            return
        }
        value = val
    }

    private final class LinkProxy: NSObject {
        weak var owner: KSpring?
        init(_ owner: KSpring) { self.owner = owner }
        @objc func tick(_ link: CADisplayLink) {
            MainActor.assumeIsolated {
                guard let owner else { link.invalidate(); return }
                owner.tick(link)
            }
        }
    }
}

/// `rb()` in the design: resistance past an end (o = overshoot in points, d = dimension).
enum Rubber {
    static let c: CGFloat = 0.55
    static func band(_ o: CGFloat, _ d: CGFloat) -> CGFloat { o * d * c / (d + c * abs(o)) }
    /// The exact inverse (learning 2026-09-24 "rubberband doble"): the base of a grab is the RAW
    /// overshoot, or re-grabbing mid-bounce applies the resistance twice and the thing jumps.
    static func unband(_ y: CGFloat, _ d: CGFloat) -> CGFloat {
        let a = min(abs(y), d * 0.999)
        let o = a * d / (c * (d - a))
        return y < 0 ? -o : o
    }
}

// MARK: - HeroController

/// One "the thing you touched becomes the next screen" transition, hosted by `HeroHost`: the
/// collection from its profile row (2 · 3), a title from its cell (4). Holds the progress (0 =
/// the row, 1 = the page), which item is open, where it came from (`sources`, reported live by
/// `heroSource`) and where it lands (`target`, reported by `heroTarget`).
@MainActor
@Observable
final class HeroController {
    enum Kind { case collection, title }
    let kind: Kind
    /// The progress (0 row … 1 page).
    let p = KSpring(0)
    private(set) var openID: String?
    private(set) var closing = false
    /// Reduce Motion, or nothing to fly from (VoiceOver activation, an off-screen row):
    /// no travel, no scale — a cross of opacity.
    @ObservationIgnored private(set) var crossfade = false

    /// Where each item sits in the host's base (its own coordinate space, BEFORE the base's
    /// 4 % recession), by id.
    @ObservationIgnored var sources: [String: CGRect] = [:]
    /// Where the open page's hero sits, in the host's space (live: it scrolls).
    @ObservationIgnored var target: CGRect?
    /// The host on screen (global), for the recession's anchor.
    @ObservationIgnored var hostFrame: CGRect = .zero

    @ObservationIgnored let baseSpace = "kura.hero.base.\(UUID().uuidString)"
    @ObservationIgnored let hostSpace = "kura.hero.host.\(UUID().uuidString)"

    /// The staged fractions: collection name at 35 % and titles at 50 %; a title's text at 40 %.
    var leadStart: CGFloat { kind == .collection ? 0.35 : 0.4 }
    var restStart: CGFloat { kind == .collection ? 0.5 : 0.4 }

    init(kind: Kind) { self.kind = kind }

    var isOpen: Bool { openID != nil }

    /// Travelling: the copy flies and the real hero hides. Reads `p` → per-frame readers only.
    var flying: Bool { openID != nil && !crossfade && p.value < 1 }

    func open(_ id: String, reduce: Bool) {
        guard openID == nil else { return }
        crossfade = reduce || sources[id] == nil
        target = nil
        closing = false
        p.set(0)
        openID = id
        p.animate(to: 1, response: KSpringSpec.open.response, damping: KSpringSpec.open.damping, velocity: 0)
    }

    /// Volver / the edge released under 70 % / VoiceOver escape. `velocity` in progress/s (the
    /// finger's); nil keeps whatever the spring carries.
    func close(velocity: CGFloat? = nil) {
        guard openID != nil, !closing else { return }
        #if DEBUG
        KBodyLog.hit("-- close")
        #endif
        closing = true
        p.animate(to: 0, response: KSpringSpec.close.response, damping: KSpringSpec.close.damping, velocity: velocity) { [weak self] in
            self?.finish()
        }
    }

    /// The edge released over 70 %: back to the page.
    func settleOpen(velocity: CGFloat) {
        guard openID != nil, !closing else { return }
        p.animate(to: 1, response: KSpringSpec.open.response, damping: KSpringSpec.open.damping, velocity: velocity)
    }

    /// Gone without animation (pop to root, the item was deleted).
    func dismissNow() {
        guard openID != nil else { return }
        p.set(0)
        finish()
    }

    private func finish() {
        #if DEBUG
        KBodyLog.hit("-- finish")
        #endif
        openID = nil
        closing = false
        target = nil
    }
}

// MARK: - Environment

private struct HeroHostKey: EnvironmentKey { static let defaultValue: HeroController? = nil }
private struct HeroPageKey: EnvironmentKey { static let defaultValue: HeroController? = nil }
private struct BackActionKey: EnvironmentKey { static let defaultValue: (() -> Void)? = nil }

extension EnvironmentValues {
    /// The hero hosted by the screen around this view: its items register as sources and open
    /// through it (a Masonry cell opens its title in place instead of pushing).
    var heroHost: HeroController? {
        get { self[HeroHostKey.self] }
        set { self[HeroHostKey.self] = newValue }
    }
    /// The hero this page is the destination of: its layers stage themselves on its progress.
    var heroPage: HeroController? {
        get { self[HeroPageKey.self] }
        set { self[HeroPageKey.self] = newValue }
    }
    /// What Volver does here (a hero page closes itself instead of popping).
    var kBackAction: (() -> Void)? {
        get { self[BackActionKey.self] }
        set { self[BackActionKey.self] = newValue }
    }
}

// MARK: - Page layers

extension View {
    /// A hero page's backdrop (its gradient, its chrome): in over the first 60 % — `cl(p / .6)`.
    /// Identity outside a hero page.
    func heroBackdrop() -> some View { modifier(HeroStageModifier(layer: .backdrop)) }
    /// The first text under the hero (a collection's name at 35 %, a title's text at 40 %):
    /// fades in rising 16 pt.
    func heroLead() -> some View { modifier(HeroStageModifier(layer: .lead)) }
    /// The rest (a collection's titles, at 50 %): fades in rising 16 pt.
    func heroRest() -> some View { modifier(HeroStageModifier(layer: .rest)) }
    /// The page's hero (the header fan, the ficha's cover): reports where it sits and hides while
    /// its copy flies.
    func heroTarget() -> some View { modifier(HeroTargetModifier()) }
    /// An item that opens as a hero (a profile row's fan, a Masonry cover): reports where it
    /// sits and hides while it's open.
    func heroSource(_ id: String) -> some View { modifier(HeroSourceModifier(id: id)) }
}

private enum HeroLayer { case backdrop, lead, rest }

private struct HeroStageModifier: ViewModifier {
    @Environment(\.heroPage) private var hero
    let layer: HeroLayer
    func body(content: Content) -> some View {
        if let hero {
            HeroStaged(hero: hero, layer: layer, content: content)
        } else {
            content
        }
    }
}

/// The per-frame reader: only this re-renders while the progress runs.
private struct HeroStaged<C: View>: View {
    let hero: HeroController
    let layer: HeroLayer
    let content: C

    var body: some View {
        let p = hero.p.value
        let cf = hero.crossfade
        let a: CGFloat = {
            if cf { return clamp01(p) }
            switch layer {
            case .backdrop: return clamp01(p / 0.6)
            case .lead: return clamp01((p - hero.leadStart) / (1 - hero.leadStart))
            case .rest: return clamp01((p - hero.restStart) / (1 - hero.restStart))
            }
        }()
        let rise: CGFloat = (cf || layer == .backdrop) ? 0 : (1 - a) * 16
        content
            .opacity(Double(a))
            .offset(y: rise)
    }
}

private struct HeroTargetModifier: ViewModifier {
    @Environment(\.heroPage) private var hero
    func body(content: Content) -> some View {
        if let hero {
            HeroTargetView(hero: hero, content: content)
        } else {
            content
        }
    }
}

private struct HeroTargetView<C: View>: View {
    let hero: HeroController
    let content: C
    var body: some View {
        content
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(hero.hostSpace)) } action: { r in
                hero.target = r
            }
            // Hidden while its copy flies; under a cross-fade it fades with the page.
            .opacity(hero.flying ? 0 : hero.crossfade && hero.isOpen ? Double(clamp01(hero.p.value)) : 1)
    }
}

private struct HeroSourceModifier: ViewModifier {
    @Environment(\.heroHost) private var hero
    let id: String
    func body(content: Content) -> some View {
        if let hero {
            content
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(hero.baseSpace)) } action: { r in
                    hero.sources[id] = r
                }
                // The row it came from stays empty while it's open: the fan / cover IS the page's
                // (a cross-fade has no copy in flight, so there the row stays).
                .opacity(hero.openID == id && !hero.crossfade ? 0 : 1)
        } else {
            content
        }
    }
}

@inline(__always) func clamp01(_ x: CGFloat) -> CGFloat { max(0, min(1, x)) }
@inline(__always) func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat { a + (b - a) * t }

// MARK: - HeroHost

/// Hosts a hero over a base screen (Tus colecciones, the profile, a collection page):
///
///  - the base recedes 4 % (anchor 50 % / 40 %) as the page comes in;
///  - the page (`page(id)`) on top, its layers staged by `heroBackdrop/Lead/Rest`, Volver =
///    close, VoiceOver escape = close, the base hidden from VoiceOver;
///  - the flying copy (`flyer(id)`, drawn at the TARGET's size and scaled down to the source's
///    width, as the design's `flyTf`) interpolating source → target;
///  - the edge: a drag that starts in the left 32 pt moves the progress 1:1 (320 pt = all of
///    it); released, the projection `p + v·0.2` under 70 % closes at the finger's speed, over
///    it goes back.
///
/// At a tab's root (`rootTab`) the tab bar hides while it's open (like a push), and tapping the
/// tab again closes it (pop to root). Everything else — sheets, pushes from inside the page —
/// works as on any screen: a push covers base + page, and coming back finds the page open.
struct HeroHost<Base: View, Page: View, Flyer: View>: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    let hero: HeroController
    var rootTab: Tab? = nil
    @ViewBuilder let base: Base
    @ViewBuilder let page: (String) -> Page
    /// The copy that flies, laid out at the target's size.
    @ViewBuilder let flyer: (String) -> Flyer

    @State private var edge: EdgeGrab?
    @GestureState private var dragging = false

    private struct EdgeGrab { var p0: CGFloat; var engaged: Bool }

    var body: some View {
        #if DEBUG
        let _ = KBodyLog.hit("HeroHost")
        #endif
        ZStack {
            // The base's geometry must not change while a hero is open, or a scroll view resting at
            // its end shifts its content and snaps back in ONE frame when the close ends, right
            // where the copy lands (the close flicker). Two things changed it:
            //  - hiding the tab bar (bottom safe area 83 → 34): the base ignores the bottom safe
            //    area, so its scroll views never see the bar come and go (the pages carry their own
            //    dock clearance: 150 / 140 bottom padding);
            //  - the 4 % recession as a transform around the base: a non-identity transform cuts
            //    the safe area off from everything under it. It's `.heroRecedes()` on the base's
            //    scroll CONTENT instead (see `HeroRecedeContent`).
            base
                .ignoresSafeArea(.container, edges: .bottom)
                .environment(\.heroHost, hero)
                .coordinateSpace(.named(hero.baseSpace))
                .accessibilityHidden(hero.isOpen)

            if let id = hero.openID {
                page(id)
                    .environment(\.heroPage, hero)
                    .environment(\.heroHost, nil)
                    .environment(\.kBackAction, { hero.close() })
                    .allowsHitTesting(!hero.closing)
                    .simultaneousGesture(edgeDrag)
                    .accessibilityElement(children: .contain)
                    .accessibilityAddTraits(.isModal)
                    .accessibilityAction(.escape) { hero.close() }
                    .transition(.identity)

                HeroFlyLayer(hero: hero, flyer: flyer(id))
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .coordinateSpace(.named(hero.hostSpace))
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { hero.hostFrame = $0 }
        #if DEBUG
        .task { await demo() }
        #endif
        .onChange(of: hero.openID) { _, id in
            guard let rootTab else { return }
            if id != nil { store.heroCovers.insert(rootTab) } else { store.heroCovers.remove(rootTab) }
            #if DEBUG
            KBodyLog.hit("heroCovers \(store.heroCovers)")
            #endif
        }
        .onChange(of: rootTab.map { store.heroResets[$0, default: 0] }) { hero.dismissNow() }
        .onDisappear {
            // Torn down (sign-out, the tab's content replaced): never leave the tab bar hidden.
            if let rootTab, !hero.isOpen { store.heroCovers.remove(rootTab) }
        }
        .onChange(of: dragging) { _, live in
            // A cancelled drag (a system gesture took over) never calls onEnded: settle back open.
            guard !live else { return }
            // Next turn, so a normal end (which clears `edge`) goes first.
            DispatchQueue.main.async {
                guard let g = edge else { return }
                edge = nil
                if g.engaged { hero.settleOpen(velocity: 0) }
            }
        }
    }

    #if DEBUG
    /// `-kuraHeroDemo close|edge|edgeback`: once open, close with Volver, or replay an edge drag
    /// (to 50 % over 0.3 s, then released at +300 pt/s → closes; `edgeback`: to 80 %, released
    /// still → goes back). The captures can't drive a finger.
    private func demo() async {
        guard let mode = UserDefaults.standard.string(forKey: "kuraHeroDemo") else { return }
        while !hero.isOpen || hero.p.isAnimating { try? await Task.sleep(for: .milliseconds(100)) }
        try? await Task.sleep(for: .milliseconds(1200))
        switch mode {
        case "close": hero.close()
        default:
            let to: CGFloat = mode == "edgeback" ? 0.8 : 0.5
            for i in 1...18 {
                hero.p.set(1 - (1 - to) * CGFloat(i) / 18)
                try? await Task.sleep(for: .milliseconds(16))
            }
            let vp: CGFloat = mode == "edgeback" ? 0 : -300 / 320
            if hero.p.value + vp * 0.2 < 0.7 { hero.close(velocity: vp) } else { hero.settleOpen(velocity: vp) }
        }
    }
    #endif

    private var edgeDrag: some Gesture {
        DragGesture(minimumDistance: 10, coordinateSpace: .named(hero.hostSpace))
            .updating($dragging) { _, live, _ in live = true }
            .onChanged { v in
                if edge == nil {
                    let horizontal = abs(v.translation.width) > abs(v.translation.height)
                    let fromEdge = v.startLocation.x <= 32
                    guard hero.isOpen, !hero.closing, fromEdge, horizontal else {
                        edge = EdgeGrab(p0: 0, engaged: false)
                        return
                    }
                    hero.p.stop()
                    edge = EdgeGrab(p0: hero.p.value, engaged: true)
                }
                guard let g = edge, g.engaged else { return }
                hero.p.set(clamp01(g.p0 - v.translation.width / 320))
            }
            .onEnded { v in
                guard let g = edge else { return }
                edge = nil
                guard g.engaged else { return }
                let vp = -v.velocity.width / 320
                if hero.p.value + vp * 0.2 < 0.7 {
                    hero.close(velocity: vp)
                } else {
                    hero.settleOpen(velocity: vp)
                }
            }
    }
}

/// The base receding 4 % (`scale(1 − .04·p)` about the SCREEN's 50 % / 40 %); nothing under
/// Reduce Motion.
///
/// It goes on the base's SCROLL CONTENT (`.heroRecedes()`), never around the base: any transform
/// that isn't the identity cuts the safe area off from everything under it, so a base scroll view
/// stops extending under the bars (container 874 → 778 pt) and, resting at its end, jumps ~34–96
/// pt when the hero opens — and back in ONE frame when the scale returns to 1 at the very end of
/// the close, right where the copy lands: the close flicker (learning
/// 2026-09-27-transformar-la-base-le-quita-el-safe-area). A transform on the content of a scroll
/// view changes nothing about the scroll view's own geometry.
private struct HeroRecedeContent<C: View>: View {
    let hero: HeroController
    let content: C
    var body: some View {
        let s = hero.isOpen && !hero.crossfade ? 1 - 0.04 * clamp01(hero.p.value) : 1
        let host = hero.hostFrame
        content.visualEffect { c, g in
            // Anchor on the host's point (50 %, 40 %), wherever the content sits (it scrolls).
            let f = g.frame(in: .global)
            let ax = f.width > 0 ? (host.midX - f.minX) / f.width : 0.5
            let ay = f.height > 0 ? (host.minY + host.height * 0.4 - f.minY) / f.height : 0.4
            return c.scaleEffect(s, anchor: UnitPoint(x: ax, y: ay))
        }
    }
}

private struct HeroRecedeModifier: ViewModifier {
    @Environment(\.heroHost) private var hero
    func body(content: Content) -> some View {
        if let hero { HeroRecedeContent(hero: hero, content: content) } else { content }
    }
}

extension View {
    /// A hero host's base: its scroll content recedes 4 % while a hero page is open over it.
    /// Put it on the content INSIDE the base's scroll view. Identity anywhere else.
    func heroRecedes() -> some View { modifier(HeroRecedeModifier()) }
}

/// The copy in flight: the target's size, scaled to the interpolated width and placed at the
/// interpolated origin (the design's `translate(lerp) scale(lerp(w) / dst.w)` from 0 0).
private struct HeroFlyLayer<F: View>: View {
    let hero: HeroController
    let flyer: F

    var body: some View {
        let p = hero.p.value
        ZStack(alignment: .topLeading) {
            if hero.flying, let dst = hero.target, let id = hero.openID, let src = hero.sources[id], dst.width > 0 {
                let w = lerp(src.width, dst.width, p)
                let s = w / dst.width
                flyer
                    .environment(\.heroFlyScale, s)
                    .environment(\.heroFlyProgress, p)
                    .frame(width: dst.width, height: dst.height)
                    .scaleEffect(s, anchor: .topLeading)
                    .offset(x: lerp(src.minX, dst.minX, p), y: lerp(src.minY, dst.minY, p))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct HeroFlyScaleKey: EnvironmentKey { static let defaultValue: CGFloat = 1 }
private struct HeroFlyProgressKey: EnvironmentKey { static let defaultValue: CGFloat = 1 }

extension EnvironmentValues {
    /// Inside a flyer: the scale it's drawn at (a radius that must LOOK constant divides by it).
    var heroFlyScale: CGFloat {
        get { self[HeroFlyScaleKey.self] }
        set { self[HeroFlyScaleKey.self] = newValue }
    }
    /// Inside a flyer: the progress (a title's corner goes 14 → 18).
    var heroFlyProgress: CGFloat {
        get { self[HeroFlyProgressKey.self] }
        set { self[HeroFlyProgressKey.self] = newValue }
    }
}

/// The flying cover of a title: the ficha's cover, its corner 14 → 18 as it LOOKS (the design's
/// `flyR = lerp(14, 18, p) / s`).
struct HeroCoverFlyer: View {
    @Environment(\.heroFlyScale) private var s
    @Environment(\.heroFlyProgress) private var p
    let title: Title
    var body: some View {
        // The cover's inputs stay constant (its body — image lookup, palette task — isn't
        // re-run every frame); only the clip that wraps it changes with the progress.
        GeometryReader { g in
            CoverView(title: title, width: g.size.width, height: g.size.height, radius: 0, shadow: false)
                .clipShape(RoundedRectangle(cornerRadius: lerp(KRadius.coverL, KRadius.surface, p) / max(s, 0.01),
                                            style: .continuous))
                .kShadow(.cover)
        }
    }
}

#if DEBUG
/// `-kuraBodyLog YES`: logs the hero host's body, close/finish, the tab-bar cover and the base
/// scroll views' geometry (`kDebugScrollLog`) — how the close flicker was found.
enum KBodyLog {
    static let on = UserDefaults.standard.bool(forKey: "kuraBodyLog")
    static func hit(_ name: String) {
        if on { print(String(format: "BODY %.3f ", CACurrentMediaTime()) + name) }
    }
}
#endif

extension View {
    /// DEBUG `-kuraBodyLog YES`: prints a scroll view's offset / insets / size whenever they
    /// change. A no-op otherwise, and in Release.
    @ViewBuilder func kDebugScrollLog(_ name: String) -> some View {
        #if DEBUG
        if #available(iOS 18.0, *), KBodyLog.on {
            onScrollGeometryChange(for: String.self) { g in
                "off \(Int(g.contentOffset.y)) ins t\(Int(g.contentInsets.top)) b\(Int(g.contentInsets.bottom)) cont \(Int(g.contentSize.height)) box \(Int(g.containerSize.height))"
            } action: { _, v in KBodyLog.hit("SCROLL \(name) " + v) }
        } else {
            self
        }
        #else
        self
        #endif
    }
}
