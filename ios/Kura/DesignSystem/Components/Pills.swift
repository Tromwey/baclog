import SwiftUI

/// Card pill: glyph 13 · mono 12 · 9/14 · glass. Max two per object.
struct StatusPill: View {
    let glyph: Glyph
    let label: String
    var body: some View {
        HStack(spacing: 8) {
            GlyphView(glyph: glyph, size: 13)
            Text(label)
                .font(.kura.mono(12))
                .tracking(0.72)
                .textCase(.uppercase)
                .foregroundStyle(KColor.text)
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(KColor.glassBg, in: Capsule())
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
    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                let on = opt.0 == selection
                Button {
                    selection = opt.0
                    UISelectionFeedbackGenerator().selectionChanged()
                } label: {
                    Text(opt.1)
                        .font(.kura.mono(11))
                        .tracking(1.1)
                        .textCase(.uppercase)
                        .foregroundStyle(on ? KColor.text : KColor.text2)
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
        .background(KColor.glassBg, in: Capsule())
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
struct Skeleton: View {
    var radius: CGFloat = KRadius.coverL
    @State private var on = false
    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(KColor.s2)
            .opacity(on ? 1 : 0.45)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { on = true }
            }
            .accessibilityHidden(true)
    }
}
