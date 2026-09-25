import SwiftUI

// MARK: - Dock

/// Floating dock: 4 equal tabs, rgba(20,20,26,.5) + blur, pill, float shadow.
/// iOS 26+: a Liquid Glass capsule, and the selection behaves like the system tab bar's
/// "gota": touching lifts a glass lens that follows the finger (it stretches with speed and
/// magnifies the icon under it), and a tap glides it to the new tab and settles back into
/// the flat pill. Before 26 the same pill slides, without the glass.
///
/// Touch is one drag gesture on the whole bar (tap = drag of ~0), so the items aren't
/// Buttons; each one is still a button for VoiceOver (`accessibilityAction`).
struct Dock: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    /// Finger x in the bar's space while touching; nil at rest.
    @State private var touchX: CGFloat?
    /// Horizontal finger speed (pt/s), for the lens' stretch.
    @State private var speed: CGFloat = 0
    /// The lens stays lifted for the glide after a tap.
    @State private var gliding = false
    /// Resets itself when the system cancels the touch (onEnded never runs then).
    @GestureState private var pressing = false

    private static let itemW: CGFloat = 82
    private static let itemH: CGFloat = 56
    private static let tabs = Tab.allCases

    private var lifted: Bool { touchX != nil || gliding }

    /// 0…0.28: the lens elongates with finger speed, and a little on a tap's glide.
    private var stretch: CGFloat {
        if reduce { return 0 }
        if touchX != nil { return min(speed / 2600, 0.28) }
        return gliding ? 0.14 : 0
    }

    private func index(at x: CGFloat) -> Int {
        min(max(Int(x / Self.itemW), 0), Self.tabs.count - 1)
    }

    /// The tab under the finger while touching, else the selected one.
    private var focused: Tab { touchX.map { Self.tabs[index(at: $0)] } ?? store.tab }

    private var lensX: CGFloat {
        let half = Self.itemW / 2
        if let x = touchX { return min(max(x, half), Self.itemW * CGFloat(Self.tabs.count) - half) - half }
        return Self.itemW * CGFloat(Self.tabs.firstIndex(of: store.tab) ?? 0)
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Self.tabs) { tab in item(tab) }
        }
        .background(alignment: .leading) {
            ZStack(alignment: .leading) { pill; lens }
        }
        .contentShape(Capsule())
        .gesture(drag)
        .padding(6)
        .modifier(DockSurface())
        .environment(\.colorScheme, .dark)
        .kFixedChrome()
        .onChange(of: store.tab) { _, _ in
            guard touchX == nil, !reduce else { return }
            gliding = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) { gliding = false }
        }
        .onChange(of: focused) { _, _ in if touchX != nil { KHaptic.select() } }
        .onChange(of: pressing) { _, p in if !p, touchX != nil { touchX = nil; speed = 0 } }
    }

    private func item(_ tab: Tab) -> some View {
        VStack(spacing: 3) {
            DockIcon(tab: tab)
            Text(tab.label).font(.kura.ui(10, .medium, fixed: true)).lineLimit(1)
        }
        .foregroundStyle(focused == tab ? KColor.text : KColor.text2)
        // The icon under the droplet swells with it, as through a lens.
        .scaleEffect(touchX != nil && focused == tab && glassLens ? 1.14 : 1)
        .animation(KMotion.momentum, value: focused)
        .animation(KMotion.momentum, value: touchX == nil)
        .frame(width: Self.itemW, height: Self.itemH)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(tab.label)
        .accessibilityAddTraits(store.tab == tab ? [.isSelected, .isButton] : .isButton)
        .accessibilityAction { store.select(tab) }
        .accessibilityShowsLargeContentViewer { DockIcon(tab: tab); Text(tab.label) }
    }

    private var glassLens: Bool {
        if #available(iOS 26.0, *) { return !reduce } else { return false }
    }

    /// The flat selection pill (at rest; before 26 it is also the moving lens).
    private var pill: some View {
        Capsule()
            .fill(lifted && !glassLens ? KColor.glassSelected : KColor.dockActive)
            .frame(width: Self.itemW, height: Self.itemH)
            .scaleEffect(x: 1 + stretch, y: 1 - stretch * 0.35)
            .scaleEffect(lifted && !reduce && !glassLens ? 1.06 : 1)
            .offset(x: lensX)
            .opacity(lifted && glassLens ? 0 : 1)
            .animation(motion, value: lensX)
            .animation(KMotion.momentum, value: lifted)
            .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.7), value: stretch)
            .allowsHitTesting(false)
    }

    /// iOS 26: the glass droplet, between the bar's glass and the items (glass drawn over the
    /// icons would blur them away), with the icon above it magnified by `item`.
    @ViewBuilder private var lens: some View {
        if #available(iOS 26.0, *), glassLens {
            Color.clear
                .frame(width: Self.itemW, height: Self.itemH)
                .glassEffect(.clear.interactive(), in: Capsule())
                .scaleEffect(x: 1 + stretch, y: 1 - stretch * 0.35)
                .scaleEffect(lifted ? 1.16 : 0.7)
                .offset(x: lensX)
                .opacity(lifted ? 1 : 0)
                .animation(motion, value: lensX)
                .animation(KMotion.momentum, value: lifted)
                .animation(.interactiveSpring(response: 0.22, dampingFraction: 0.7), value: stretch)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    /// Follows the finger tightly; glides between tabs with a little overshoot.
    private var motion: Animation? {
        if reduce { return nil }
        return touchX != nil ? .interactiveSpring(response: 0.18, dampingFraction: 0.86) : KMotion.momentum
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0)
            .updating($pressing) { _, p, _ in p = true }
            .onChanged { v in
                touchX = v.location.x
                speed = abs(v.velocity.width)
            }
            .onEnded { v in
                let tab = Self.tabs[index(at: v.location.x)]
                let tapped = abs(v.translation.width) < 10 && abs(v.translation.height) < 10
                touchX = nil
                speed = 0
                // A tap on the active tab pops it to root; a scrub that lands back on it doesn't.
                if tapped || tab != store.tab { store.select(tab) }
            }
    }
}

private struct DockSurface: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            // Glass as a layer behind the items, not wrapping them: the lens is glass too,
            // and glass nested inside glass can't sample what's under it.
            content.background { Color.clear.glassEffect(.regular, in: Capsule()) }
        } else {
            content
                .background {
                    ZStack {
                        Capsule().fill(.ultraThinMaterial)
                        Capsule().fill(KColor.dock)
                    }
                }
                .kShadow(.float)
        }
    }
}

// MARK: - Toast ("avisos")

/// s2 pill over the dock for 5 s: Deshacer / Reintentar (with triangle).
struct ToastView: View {
    let toast: ToastModel
    let onAction: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            if toast.kind == .retry {
                GlyphView(glyph: .warn, size: 15)
            }
            Text(toast.text)
                .font(.kura.ui(15))
                .foregroundStyle(KColor.text)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            if toast.action != nil {
                Button(action: onAction) {
                    Text(toast.kind == .retry ? "Reintentar" : "Deshacer")
                        .monoLabel(11, color: KColor.text)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, 18)
        .padding(.trailing, 8)
        .frame(minHeight: 52)
        .kGlass(Capsule(), fill: KColor.s2, tint: KColor.s2.opacity(0.7))
        .modifier(PreGlassShadow())
        .kFixedChrome()
        .accessibilityElement(children: .contain)
    }
}

struct ToastHost: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    var dockVisible: Bool

    var body: some View {
        VStack {
            Spacer()
            if let t = store.toast {
                ToastView(toast: t) { t.action?() }
                    .padding(.horizontal, 16)
                    .padding(.bottom, dockVisible && store.sheet == nil ? 78 : 12)
                    .transition(KMotion.slide(.bottom, reduce: reduce, fading: true))
                    .id(t.id)
            }
        }
        .animation(KMotion.spatial(KMotion.snappy, reduce: reduce), value: store.toast?.id)
    }
}

// MARK: - Sheets

/// Compact sheet: inset 8, radius 36, s2, grabber 36×5, float shadow.
/// Tall sheet (Agregar): 54 from the top, s1, radius 36 on top.
///
/// Modal for VoiceOver (`isModal` + the escape "Z" gesture closes it like the scrim);
/// `RootView` hides everything behind it from accessibility while it's up.
/// The grabber drag follows the finger down, rubber-bands up, and hands its velocity
/// to the settle (or to the dismissal). Only the grabber drags: the sheets hold
/// ScrollViews/lists, and on iOS 17 there's no scroll-offset signal to know when a body
/// drag should move the sheet instead of the list.
struct SheetHost: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var drag: CGFloat = 0
    @State private var sheetHeight: CGFloat = 400
    /// True while a grabber drag is live; resets on end AND on cancel (a system gesture or
    /// an interruption never calls `onEnded`, which would leave the sheet hanging mid-drag).
    @GestureState private var dragging = false

    var body: some View {
        ZStack(alignment: .bottom) {
            if let route = store.sheet {
                KColor.scrim
                    .ignoresSafeArea()
                    .onTapGesture { store.dismissSheetInteractively() }
                    .transition(.opacity)
                    .accessibilityHidden(true)

                container(for: route)
                    .background {
                        GeometryReader { g in
                            Color.clear
                                .onAppear { sheetHeight = g.size.height }
                                .onChange(of: g.size.height) { _, h in sheetHeight = h }
                        }
                    }
                    .offset(y: rubberBand(drag))
                    .accessibilityElement(children: .contain)
                    .accessibilityAddTraits(.isModal)
                    .accessibilityAction(.escape) { store.dismissSheetInteractively() }
                    .accessibilityAction(named: "Cerrar") { store.dismissSheetInteractively() }
                    .transition(KMotion.slide(.bottom, reduce: reduce))
                    .id(route.id)
            }
        }
        // No `.animation` here: `present`/`dismissSheet` bring their own (and a drag hands
        // its velocity to the dismissal), and an id remap (local → server) swaps in place.
        // A new sheet (or none) always starts at rest; the leaving one keeps its offset
        // while its removal transition plays.
        .onChange(of: store.sheet?.id) { drag = 0 }
        .onChange(of: dragging) { _, live in
            guard !live, drag != 0, store.sheet != nil else { return }
            withAnimation(KMotion.snappy) { drag = 0 }
        }
    }

    /// Down follows the finger 1:1; up resists (a sheet has nowhere to go up).
    private func rubberBand(_ d: CGFloat) -> CGFloat {
        d >= 0 ? d : -pow(-d, 0.7)
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 8)
            .updating($dragging) { _, live, _ in live = true }
            .onChanged { v in drag = v.translation.height }
            .onEnded { v in
                let vy = v.velocity.height
                let shouldDismiss = v.translation.height > 110 || v.predictedEndTranslation.height > 260
                if shouldDismiss, !store.sheetLocked {
                    // The removal continues at the finger's speed: velocity in "progress per
                    // second" over the transition's travel (the move adds the sheet's full
                    // height on top of the current drag offset).
                    let anim: Animation = reduce ? KMotion.sheetOut
                        : .interpolatingSpring(duration: 0.3, bounce: 0, initialVelocity: max(vy, 0) / max(sheetHeight, 1))
                    store.dismissSheetInteractively(animation: anim)
                } else {
                    let from = rubberBand(drag)
                    let v0 = abs(from) > 1 ? -vy / from : 0
                    withAnimation(reduce ? KMotion.fade : .interpolatingSpring(duration: 0.36, bounce: 0.12, initialVelocity: v0)) {
                        drag = 0
                    }
                }
            }
    }

    @ViewBuilder
    private func container(for route: SheetRoute) -> some View {
        switch route.style {
        case .compact:
            VStack(spacing: 0) {
                accessory(for: route)
                VStack(spacing: 0) {
                    if route.showsGrabber {
                        Grabber().padding(.top, 10).padding(.bottom, 8)
                            .frame(maxWidth: .infinity)
                            .contentShape(Rectangle())
                            .gesture(dragGesture)
                    } else {
                        Color.clear.frame(height: 24)
                    }
                    SheetContent(route: route)
                }
                .padding(.bottom, 26)
                .kGlass(RoundedRectangle(cornerRadius: KRadius.sheet, style: .continuous), fill: KColor.s2, tint: KColor.s2.opacity(0.7))
                .modifier(PreGlassShadow())
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
            }
            .ignoresSafeArea(.container, edges: .bottom)
        case .tall:
            VStack(spacing: 0) {
                Grabber().padding(.top, 8).padding(.bottom, 6)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                    .gesture(dragGesture)
                SheetContent(route: route)
            }
            .frame(maxHeight: .infinity, alignment: .top)
            .background(KColor.s1, in: UnevenRoundedRectangle(topLeadingRadius: KRadius.sheet, topTrailingRadius: KRadius.sheet, style: .continuous))
            // Below the screen edge: what a rubber-banded upward pull reveals.
            .background(alignment: .bottom) { KColor.s1.frame(height: 90).offset(y: 90) }
            .padding(.top, 54)
            .ignoresSafeArea(.container, edges: [.top, .bottom])
        }
    }

    @ViewBuilder
    private func accessory(for route: SheetRoute) -> some View {
        if case .titleActions(let tid, _) = route, let t = store.title(tid) {
            CoverView(title: t, width: t.format == .album ? 170 : 150, shadow: false)
                .kShadow(.float)
                .padding(.bottom, 22)
                .allowsHitTesting(false)
        }
    }
}

/// The float shadow of pre-26 surfaces; Liquid Glass brings its own depth.
struct PreGlassShadow: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) { content } else { content.kShadow(.float) }
    }
}

struct Grabber: View {
    var body: some View {
        Capsule().fill(KColor.grabber).frame(width: 36, height: 5)
            .accessibilityHidden(true)
    }
}

/// Header row of a sheet: Newsreader 26 title + optional close chip.
struct SheetHeader: View {
    let title: String
    var italic = false
    var trailing: String? = nil
    var onClose: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(title)
                .font(italic ? .kura.newsItalic(22) : .kura.news(26))
                .foregroundStyle(KColor.text)
                .lineLimit(2)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            if let trailing { Text(trailing).monoLabel() }
            if let onClose {
                IconChip44(systemName: "xmark", size: 36, iconSize: 13, label: "Cerrar", action: onClose)
            }
        }
        .padding(.bottom, 6)
    }
}

/// 54 pt sheet row: icon in a 24 slot, label 16/500, optional trailing.
struct SheetRow<Trailing: View>: View {
    let systemImage: String
    let label: String
    var iconColor: Color = KColor.text
    var glyph: Glyph? = nil
    let action: () -> Void
    @ViewBuilder var trailing: Trailing
    @ScaledMetric(relativeTo: .callout) private var iconSize: CGFloat = 17

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Group {
                    if let glyph { GlyphView(glyph: glyph, size: 16) }
                    else { Image(systemName: systemImage).font(.system(size: iconSize, weight: .regular)).foregroundStyle(iconColor) }
                }
                .frame(width: 24)
                Text(label).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                Spacer(minLength: 8)
                trailing
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(SheetRowStyle())
    }
}

extension SheetRow where Trailing == EmptyView {
    init(systemImage: String, label: String, iconColor: Color = KColor.text, glyph: Glyph? = nil, action: @escaping () -> Void) {
        self.systemImage = systemImage
        self.label = label
        self.iconColor = iconColor
        self.glyph = glyph
        self.action = action
        self.trailing = EmptyView()
    }
}

/// Fill-change pressed state (no borders).
struct SheetRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.white.opacity(0.06) : Color.clear,
                        in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
    }
}

/// Glass text field (radius 16, height 52).
struct GlassField: View {
    let placeholder: String
    @Binding var text: String
    var serif = false
    var clearable = false
    var trailing: AnyView? = nil
    var focus: FocusState<Bool>.Binding? = nil

    var body: some View {
        HStack(spacing: 10) {
            field
            if clearable && !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(KColor.text2)
                        .frame(width: 28, height: 28)
                        .kHitArea(horizontal: 8, vertical: 8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Borrar texto")
            }
            if let trailing { trailing }
        }
        .padding(.horizontal, 18)
        .frame(height: 52)
        .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: KRadius.field, style: .continuous))
    }

    @ViewBuilder private var field: some View {
        let tf = TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(KColor.text3))
            .font(serif ? .kura.news(20) : .kura.ui(16))
            .foregroundStyle(KColor.text)
            .tint(KColor.text)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
        if let focus { tf.focused(focus) } else { tf }
    }
}

// MARK: - Offline strip

struct OfflineStrip: View {
    @ScaledMetric(relativeTo: .footnote) private var iconSize: CGFloat = 15
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "wifi.slash").font(.system(size: iconSize, weight: .medium))
            Text("Sin conexión. Ves lo guardado en tu teléfono.")
                .font(.kura.ui(14))
                .foregroundStyle(KColor.text2)
            Spacer(minLength: 0)
        }
        .foregroundStyle(KColor.text)
        .padding(.horizontal, 16)
        .frame(minHeight: 44)
        .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
    }
}

// MARK: - Scroll helpers

/// Top chrome for pushed screens: Volver (left) and Opciones (right) at 64/24.
struct TopChrome<Right: View>: View {
    var onBack: (() -> Void)? = nil
    @ViewBuilder var right: Right
    var body: some View {
        HStack {
            BackChip(action: onBack)
            Spacer()
            right
        }
        .padding(.horizontal, KSize.chromeSide)
        .padding(.top, KSize.chromeTop)
        .kFixedChrome()
        // chromeTop is measured from the screen's edge, never from the safe area: otherwise
        // a screen whose container respects the safe area drops its chips ~60 pt lower.
        .ignoresSafeArea(.container, edges: .top)
    }
}
