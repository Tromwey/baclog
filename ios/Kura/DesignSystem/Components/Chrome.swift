import SwiftUI

// MARK: - Dock

/// Floating dock: 4 tabs, rgba(20,20,26,.5) + blur, pill, float shadow.
struct Dock: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Tab.allCases) { tab in
                let on = store.tab == tab
                Button {
                    store.select(tab)
                } label: {
                    VStack(spacing: 3) {
                        DockIcon(tab: tab)
                        Text(tab.label).font(.kura.ui(10, .medium))
                    }
                    .foregroundStyle(on ? KColor.text : KColor.text2)
                    .padding(.vertical, 10)
                    .padding(.horizontal, 22)
                    .background(on ? KColor.dockActive : Color.clear, in: Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.label)
                .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(6)
        .background {
            ZStack {
                Capsule().fill(.ultraThinMaterial)
                Capsule().fill(KColor.dock)
            }
        }
        .environment(\.colorScheme, .dark)
        .kShadow(.float)
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
        .background(KColor.s2, in: Capsule())
        .kShadow(.float)
        .accessibilityElement(children: .contain)
    }
}

struct ToastHost: View {
    @Environment(AppStore.self) private var store
    var dockVisible: Bool

    var body: some View {
        VStack {
            Spacer()
            if let t = store.toast {
                ToastView(toast: t) { t.action?() }
                    .padding(.horizontal, 16)
                    .padding(.bottom, dockVisible && store.sheet == nil ? 78 : 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .id(t.id)
            }
        }
        .animation(KMotion.short, value: store.toast?.id)
    }
}

// MARK: - Sheets

/// Compact sheet: inset 8, radius 36, s2, grabber 36×5, float shadow.
/// Tall sheet (Agregar): 54 from the top, s1, radius 36 on top.
struct SheetHost: View {
    @Environment(AppStore.self) private var store
    @State private var drag: CGFloat = 0

    var body: some View {
        ZStack(alignment: .bottom) {
            if let route = store.sheet {
                KColor.scrim
                    .ignoresSafeArea()
                    .onTapGesture { store.dismissSheet() }
                    .transition(.opacity)
                    .accessibilityLabel("Cerrar")
                    .accessibilityAddTraits(.isButton)

                container(for: route)
                    .offset(y: max(0, drag))
                    .transition(.move(edge: .bottom))
                    .id(route.id)
            }
        }
        .animation(store.sheet == nil ? KMotion.sheetOut : KMotion.sheetIn, value: store.sheet?.id)
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { v in drag = v.translation.height }
            .onEnded { v in
                if v.translation.height > 110 || v.predictedEndTranslation.height > 260 {
                    store.dismissSheet()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { drag = 0 }
                } else {
                    withAnimation(KMotion.spring) { drag = 0 }
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
                .background(KColor.s2, in: RoundedRectangle(cornerRadius: KRadius.sheet, style: .continuous))
                .kShadow(.float)
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

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Group {
                    if let glyph { GlyphView(glyph: glyph, size: 16) }
                    else { Image(systemName: systemImage).font(.system(size: 17, weight: .regular)).foregroundStyle(iconColor) }
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
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "wifi.slash").font(.system(size: 15, weight: .medium))
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
    }
}
