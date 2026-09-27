import SwiftUI

// MARK: - Switch (30a)

/// The system switch (on iOS 26 its knob turns into the Liquid Glass lens while it's
/// pressed/dragged — the OS material, like the dock). On = salvia, Kura's "hecho" green:
/// honey is once per screen and a settings list has several switches; the DS's white track
/// would swallow the system's white knob.
struct KuraSwitch: View {
    let label: String
    @Binding var isOn: Bool
    var body: some View {
        Toggle(label, isOn: $isOn)
            .labelsHidden()
            .tint(KColor.completed)
    }
}

// MARK: - Grouped settings list (s1, radius 18, hairline dividers)

struct GroupedList<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 0) { content }
        .background(KColor.s1, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
    }
}

/// Content hairline between grouped rows (allowed: content dividers).
struct ListDivider: View {
    var inset: CGFloat = 16
    var body: some View {
        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1).padding(.leading, inset)
    }
}

/// A 52 pt settings row: title (+ note), trailing value/chevron or a switch.
struct SettingsRow<Trailing: View>: View {
    let title: String
    var note: String? = nil
    var action: (() -> Void)? = nil
    @ViewBuilder var trailing: Trailing

    var body: some View {
        let row = HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.kura.ui(16)).foregroundStyle(KColor.text)
                if let note {
                    Text(note).font(.kura.ui(13)).foregroundStyle(KColor.text2).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.leading, 16).padding(.trailing, 14)
        .padding(.vertical, note == nil ? 0 : 8)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
        if let action {
            Button(action: action) { row }.buttonStyle(SheetRowStyle())
        } else {
            row
        }
    }
}

/// Value + chevron for a settings row. `chevron.right` = the row pushes a page; a row that opens
/// a menu of choices in place passes `chevron.up.chevron.down` (`SettingsChoiceRow`).
struct RowValue: View {
    let text: String
    var symbol = "chevron.right"
    @ScaledMetric(relativeTo: .subheadline) private var chevron: CGFloat = 13
    var body: some View {
        HStack(spacing: 6) {
            Text(text).font(.kura.ui(15)).foregroundStyle(KColor.text2)
            Image(systemName: symbol).font(.system(size: chevron, weight: .semibold)).foregroundStyle(KColor.text2)
        }
    }
}

/// A settings row whose value is one of a few options: the system menu shows them all before you
/// pick (crítica 2026-09-27 #18 — a chevron row that rotated values on each tap promised a page and
/// hid the options). Selecting answers with the selection haptic.
struct SettingsChoiceRow<Value: Hashable>: View {
    let title: String
    var note: String? = nil
    let options: [Value]
    let label: (Value) -> String
    @Binding var selection: Value

    var body: some View {
        Menu {
            Picker(title, selection: Binding(get: { selection }, set: { v in
                guard v != selection else { return }
                selection = v
                KHaptic.play(.selection)
            })) {
                ForEach(options, id: \.self) { Text(label($0)).tag($0) }
            }
        } label: {
            SettingsRow(title: title, note: note) {
                RowValue(text: label(selection), symbol: "chevron.up.chevron.down")
            }
            .multilineTextAlignment(.leading)
        }
        .buttonStyle(SheetRowStyle())
        .accessibilityValue(label(selection))
    }
}

// MARK: - Reaction slider (26a · "slider relleno")

/// Three stops Completo → Me gusta → Me obsesiona. The fill runs from the left
/// in the stop's tone (mixed 55 % toward bg), the thumb is the stop color with
/// its glyph; it snaps with a spring and a haptic on each stop (light, then
/// medium on "Me obsesiona").
struct ReactionSlider: View {
    @Binding var value: CGFloat
    @State private var dragging = false
    @State private var lastStop = 0

    static let stops: [(mark: Mark, label: String, hex: String)] = [
        (.completed, "Completo", KColor.completedHex),
        (.liked, "Me gusta", KColor.likedHex),
        (.obsessed, "Me obsesiona", KColor.obsessedHex)
    ]

    var stop: Int { min(2, max(0, Int(value.rounded()))) }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let s = Self.stops[stop]
            let fill = RGB(hex: s.hex).mix(RGB(hex: KColor.bgHex), 0.55).color
            ZStack(alignment: .topLeading) {
                Capsule().fill(Color.white.opacity(0.07))
                Capsule().fill(fill)
                    .frame(width: (w - 64) * value / 2 + 64)
                    .animation(KMotion.fade, value: stop)
                ForEach(0..<3, id: \.self) { i in
                    GlyphView(glyph: Self.stops[i].mark.glyph, size: 22,
                              color: CGFloat(i) <= value + 0.02 ? KColor.text : Color.white.opacity(0.3))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                        .position(x: (w - 64) * CGFloat(i) / 2 + 32, y: 32)
                        .onTapGesture { snap(to: i) }
                }
                Circle()
                    .fill(Color(hex: s.hex))
                    .frame(width: 56, height: 56)
                    .overlay(GlyphView(glyph: s.mark.glyph, size: 24, color: KColor.bg))
                    .kShadow(.control)
                    .kScale(stop == 2 ? 1.12 : 1)
                    .kAnimation(KMotion.snappy, value: stop)
                    .offset(x: (w - 64) * value / 2 + 4, y: 4)
                    .allowsHitTesting(false)
            }
            .contentShape(Capsule())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        dragging = true
                        value = min(2, max(0, (g.location.x - 32) / max(w - 64, 1) * 2))
                        hapticIfStopChanged()
                    }
                    .onEnded { _ in
                        dragging = false
                        snap(to: stop)
                    }
            )
        }
        .frame(height: 64)
        .onAppear { lastStop = stop }
        .accessibilityElement()
        .accessibilityLabel("Cómo te dejó")
        .accessibilityValue(Self.stops[stop].label)
        .accessibilityAdjustableAction { dir in
            switch dir {
            case .increment: snap(to: min(2, stop + 1))
            case .decrement: snap(to: max(0, stop - 1))
            @unknown default: break
            }
        }
    }

    @Environment(\.accessibilityReduceMotion) private var reduce

    /// The one bounce left in the app: the thumb settling after a drag with momentum.
    private func snap(to i: Int) {
        withAnimation(KMotion.spatial(KMotion.momentum, reduce: reduce)) { value = CGFloat(i) }
        hapticIfStopChanged(force: i)
    }

    private func hapticIfStopChanged(force: Int? = nil) {
        let s = force ?? stop
        guard s != lastStop else { return }
        lastStop = s
        KHaptic.play(.reaction(Self.stops[s].mark))
    }
}

// MARK: - Avatar row helpers

/// "12 seguidores · 34 siguiendo" with bold numbers (20a).
struct FollowCounts: View {
    let followers: Int
    let following: Int
    /// false = plain text (a preview, a blocked profile): nothing that looks tappable and isn't.
    var interactive = true
    var onFollowers: () -> Void = {}
    var onFollowing: () -> Void = {}
    var body: some View {
        HStack(spacing: 16) {
            count(followers, " seguidores", onFollowers)
            count(following, " siguiendo", onFollowing)
        }
        .font(.kura.ui(14))
        .buttonStyle(.plain)
    }

    @ViewBuilder private func count(_ n: Int, _ label: String, _ action: @escaping () -> Void) -> some View {
        let text = Text("\(n)").fontWeight(.semibold).foregroundColor(KColor.text) + Text(label).foregroundColor(KColor.text2)
        if interactive { Button(action: action) { text } } else { text }
    }
}

/// A profile's stat ribbon: obsesiones · completos · me gusta · reseñas. A zero says nothing, so it
/// isn't drawn (crítica #26), and VoiceOver reads the nouns the glyphs stand for.
struct StatRibbon: View {
    let obsessed: Int
    let completed: Int
    let liked: Int
    let reviews: Int

    private var items: [(glyph: Glyph, n: Int, one: String, many: String)] {
        [(.flame, obsessed, "obsesión", "obsesiones"), (.check, completed, "completo", "completos"),
         (.thumb, liked, "me gusta", "me gusta"), (.review, reviews, "reseña", "reseñas")]
            .filter { $0.1 > 0 }
    }

    var body: some View {
        let items = self.items
        if !items.isEmpty {
            FlowLayout(spacing: 7, lineSpacing: 7) {
                ForEach(items.indices, id: \.self) { i in RibbonPill(glyph: items[i].glyph, value: items[i].n) }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(items.map { "\($0.n) \($0.n == 1 ? $0.one : $0.many)" }.joined(separator: ", "))
        }
    }
}

/// Glass ribbon pill (`KPill.ribbon`, perfil).
struct RibbonPill: View {
    let glyph: Glyph
    let value: Int
    var body: some View {
        let s = KPill.ribbon
        HStack(spacing: s.gap) {
            GlyphView(glyph: glyph, size: s.glyph).kMeasure("RibbonPill:\(value)", "glyph")
            Text("\(value)").font(.kura.mono(s.font)).foregroundStyle(KColor.text).kMeasure("RibbonPill:\(value)", "label")
        }
        .padding(.horizontal, s.h)
        .frame(height: s.height)
        .background(KColor.glassBg, in: Capsule())
        .kMeasure("RibbonPill:\(value)", "box")
    }
}

/// Mono chip row (Todo / Cine / Series / Música / Personas / Usuarios), 40 high.
struct ChipRow<T: Hashable>: View {
    let options: [(T, String)]
    @Binding var selection: T
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                    let on = opt.0 == selection
                    Button {
                        selection = opt.0
                        KHaptic.play(.selection)
                    } label: {
                        Text(opt.1)
                            .monoLabel(11, tracking: 0.1, color: on ? KColor.text : KColor.text2)
                            .padding(.horizontal, 16)
                            .frame(height: 40)
                            .background(on ? KColor.glassSelected : KColor.glassBg, in: Capsule())
                            // 44 pt touch; the extra 2+2 lives inside the scroll view so it's hit-testable.
                            .padding(.vertical, 2)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, -2)
    }
}
