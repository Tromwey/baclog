import SwiftUI

/// The design's glass mono pills (sistema-de-diseno · pillVariants, flujos 12 perfil). One spec
/// per variant, shared by every screen that draws it.
enum KPill {
    struct Spec {
        let glyph: CGFloat
        let font: CGFloat
        /// The design's `padding: v h` — around a `line-height: 1` label.
        let v: CGFloat
        let h: CGFloat
        let gap: CGFloat
        /// The box the design draws. Red Hat Mono carries ~4 pt of leading on iOS (a 12 pt label
        /// lays out 16 high), so `padding(.vertical, v)` drew every pill 4 pt taller than the
        /// design and the web: the height is set from the font size instead. Mono is fixed-size
        /// (no Dynamic Type), so a fixed box never clips.
        var height: CGFloat { font + 2 * v }
    }
    /// Card: glifo 13 · mono 12 · 9/14 — feed, cabecera de obra, hoja de completar. 30 high.
    static let card = Spec(glyph: 13, font: 12, v: 9, h: 14, gap: 8)
    /// Ribbon: glifo 12 · conteo mono · 7/12 — the profile's one count per state. 26 high.
    static let ribbon = Spec(glyph: 12, font: 12, v: 7, h: 12, gap: 7)
}

/// Card pill (`KPill.card`). Max two per object.
struct StatusPill: View {
    let glyph: Glyph
    let label: String
    var body: some View {
        let s = KPill.card
        HStack(spacing: s.gap) {
            GlyphView(glyph: glyph, size: s.glyph).kMeasure("StatusPill:\(label)", "glyph")
            Text(label)
                .font(.kura.mono(s.font))
                .tracking(0.72)
                .textCase(.uppercase)
                .foregroundStyle(KColor.text)
                .lineLimit(1)
                .kMeasure("StatusPill:\(label)", "label")
        }
        .padding(.horizontal, s.h)
        .frame(height: s.height)
        .background(KColor.glassBg, in: Capsule())
        .kMeasure("StatusPill:\(label)", "box")
        .fixedSize()
        .accessibilityElement(children: .combine)
    }
}

/// Ribbon: glyph 14 + mono 12 count, text2. One per state.
struct CountRibbon: View {
    let items: [(Glyph, String)]
    var body: some View {
        FlowLayout(spacing: 12, lineSpacing: 6, alignment: .center) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                HStack(spacing: 5) {
                    GlyphView(glyph: item.0, size: 14)
                    Text(item.1).font(.kura.mono(12)).foregroundStyle(KColor.text2)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Seal: the avatar without a photo. Two lowercase initials in Newsreader
/// MediumItalic at 42 % of the diameter; background is the featured
/// obsession's dark tone inverted and mixed 72 % toward bg; initials the light
/// tone inverted mixed 55 % toward text.
struct Seal: View {
    let person: Person
    var size: CGFloat = 48

    var body: some View {
        let colors = Seal.colors(for: person)
        Text(person.initials.lowercased())
            .font(.kura.newsMediumItalic(size * 0.42, fixed: true))
            .tracking(-size * 0.42 * 0.035)
            .foregroundStyle(colors.1)
            .padding(.trailing, size * 0.42 * 0.04)
            .frame(width: size, height: size)
            .background(colors.0, in: Circle())
            // The profile photo, when there is one, covers the initials; if it
            // can't load (private, gone, offline) the seal stays. No border, no glow.
            .overlay { if let url = person.avatarURL { AvatarPhoto(url: url, size: size) } }
            .accessibilityHidden(true)
    }

    static func colors(for p: Person) -> (Color, Color) {
        guard p.hexes.count >= 2 else { return (KColor.s2, KColor.text) }
        let bg = RGB(hex: p.hexes[0]).inverted.mix(RGB(hex: KColor.bgHex), 0.72)
        let fg = RGB(hex: p.hexes[1]).inverted.mix(RGB(hex: KColor.textHex), 0.55)
        return (bg.color, fg.color)
    }
}

/// Newsreader 24 section header with an optional mono trailing label.
struct SectionTitle: View {
    let text: String
    var trailing: String? = nil
    var size: CGFloat = 24
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(text).font(.kura.news(size)).foregroundStyle(KColor.text)
            Spacer(minLength: 0)
            if let trailing { Text(trailing).monoLabel() }
        }
        .accessibilityAddTraits(.isHeader)
    }
}

/// Mono segmented control in glass (Todas / Cine / Series / Música).
struct MonoSegmented<T: Hashable>: View {
    let options: [(T, String)]
    @Binding var selection: T
    var height: CGFloat = 36
    /// The track's fill — Descubrir · Todo (3a) puts it on dark glass so the page tint shows through.
    var fill: Color = KColor.glassBg
    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                let on = opt.0 == selection
                Button {
                    selection = opt.0
                    KHaptic.play(.selection)
                } label: {
                    Text(opt.1)
                        .font(.kura.mono(11))
                        .tracking(1.1)
                        .textCase(.uppercase)
                        .foregroundStyle(on ? KColor.text : KColor.text2)
                        // «PELÍCULAS» fills an equal quarter at 375 pt; shrink before clipping.
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .frame(height: height)
                        .background(on ? KColor.dockActive : Color.clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(5)
        .background(fill, in: Capsule())
    }
}

/// Wrapping layout for pills and chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8
    var alignment: HorizontalAlignment = .leading

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        let rows = arrange(maxW, subviews)
        let h = rows.map(\.height).reduce(0, +) + CGFloat(max(rows.count - 1, 0)) * lineSpacing
        let w = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? w, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = arrange(bounds.width, subviews)
        var y = bounds.minY
        for row in rows {
            var x: CGFloat
            switch alignment {
            case .center: x = bounds.minX + (bounds.width - row.width) / 2
            case .trailing: x = bounds.maxX - row.width
            default: x = bounds.minX
            }
            for i in row.indices {
                let s = subviews[i].sizeThatFits(.unspecified)
                subviews[i].place(at: CGPoint(x: x, y: y + (row.height - s.height) / 2), proposal: .unspecified)
                x += s.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(_ maxW: CGFloat, _ subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var cur = Row()
        for i in subviews.indices {
            let s = subviews[i].sizeThatFits(.unspecified)
            let add = cur.indices.isEmpty ? s.width : cur.width + spacing + s.width
            if add > maxW && !cur.indices.isEmpty {
                rows.append(cur)
                cur = Row(indices: [i], width: s.width, height: s.height)
            } else {
                cur.indices.append(i)
                cur.width = add
                cur.height = max(cur.height, s.height)
            }
        }
        if !cur.indices.isEmpty { rows.append(cur) }
        return rows
    }
}

/// Skeleton block: opacity pulse between s1 and s2 over 1.6 s (allowed: loading).
/// Reduce Motion: a still block at the midpoint, no loop.
struct Skeleton: View {
    var radius: CGFloat = KRadius.coverL
    @State private var on = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(KColor.s2)
            .opacity(reduce ? 0.7 : (on ? 1 : 0.45))
            .onAppear {
                guard !reduce else { return }
                withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { on = true }
            }
            .accessibilityHidden(true)
    }
}

/// The skeleton pulse (opacity 1 ↔ .45, 1.6 s) on a whole silhouette at once — the shapes inside
/// are plain `s1` fills (the collection skeletons, 6c). Still with Reduce Motion.
private struct SkeletonPulse: ViewModifier {
    @State private var on = false
    @Environment(\.accessibilityReduceMotion) private var reduce
    func body(content: Content) -> some View {
        content
            .opacity(reduce ? 0.8 : (on ? 1 : 0.45))
            .onAppear {
                guard !reduce else { return }
                withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { on = true }
            }
    }
}

extension View {
    func kSkeletonPulse() -> some View { modifier(SkeletonPulse()) }
}

extension View {
    /// DEBUG `-kuraBodyLog YES`: `MEASURE <tag> <part> x y w h` in global space — the component
    /// audit's ruler (container vs. its glyph/label, so paddings and gaps come out of real layout).
    @ViewBuilder func kMeasure(_ tag: String, _ part: String) -> some View {
        #if DEBUG
        if KBodyLog.on {
            onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in
                KBodyLog.hit(String(format: "MEASURE %@ %@ %.2f %.2f %.2f %.2f", tag.replacingOccurrences(of: " ", with: "_"), part, r.minX, r.minY, r.width, r.height))
            }
        } else { self }
        #else
        self
        #endif
    }
}
