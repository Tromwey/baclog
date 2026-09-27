import SwiftUI

/// "Títulos en columnas" (Colecciones formalizado): a collection's titles in three independent
/// columns — records 1:1 and posters 2:3 stack without gaps, and the reading order runs DOWN each
/// column (the web's CSS `columns-3`, balanced). Each tile: the cover at its native form with the
/// state glyph (24) or the wait pill top-left, the title in Newsreader italic 14 and the year (or
/// the format) in mono 10. Gap 12 between columns, 18 between tiles, 20 on the sides.
///
/// Shared by Tus colecciones, a collection, the automatic one and someone else's. `onHold` (the
/// owner's 18c sheet) is optional. Twin of the web's `src/components/kura/masonry.tsx`.
struct Masonry: View {
    let titles: [Title]
    /// What a tile wears (glyph or wait pill); nil = your own state (`store.mark`, the wait).
    var badge: ((Title) -> MasonryBadge)? = nil
    var onHold: ((Title) -> Void)? = nil
    @Environment(AppStore.self) private var store

    var body: some View {
        ColumnsLayout(columns: 3, spacingX: 12, spacingY: 18) {
            ForEach(titles) { t in
                MasonryTile(title: t, badge: badge?(t) ?? ownBadge(t), onHold: onHold.map { hold in { hold(t) } })
            }
        }
        .padding(.horizontal, 20)
    }

    /// Obsession > me gusta > completo; the wait wins over all of them.
    private func ownBadge(_ t: Title) -> MasonryBadge {
        if store.isUnreleased(t), let l = store.releaseLabel(t) { return .wait(l) }
        if let m = store.mark(t.id) { return .mark(m) }
        return .none
    }
}

enum MasonryBadge: Equatable {
    case none
    case mark(Mark)
    /// "4 d" / "17 oct".
    case wait(String)
}

struct MasonryTile: View {
    let title: Title
    let badge: MasonryBadge
    var onHold: (() -> Void)? = nil
    @Environment(AppStore.self) private var store
    /// Under a `TitleHeroHost` (Tus colecciones, a collection opened from the profile) the cover
    /// grows into the ficha in place; anywhere else it's a push (the system's cover zoom, 18+).
    @Environment(\.heroHost) private var hero
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            CoverView(title: title, badge: .none, fluid: true)
                .overlay(alignment: .topLeading) { badgeView.padding(6) }
                .zoomSource(ZoomID.title(title.id))
                .heroSource(title.id)
            Text(title.name)
                .font(.kura.newsItalic(14))
                .foregroundStyle(KColor.text)
                .lineLimit(1)
            Text(title.year.map(String.init) ?? title.format.metaLabel)
                .monoLabel(10)
                .lineLimit(1)
        }
        .contentShape(Rectangle())
        .kPressable(longPress: onHold) {
            if let hero, hero.kind == .title { hero.open(title.id, reduce: reduce) } else { store.push(.title(title.id)) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(.isButton)
        .modifier(HoldAction(onHold: onHold))
    }

    private var accessibilityText: String {
        var parts = [title.name, title.year.map(String.init) ?? title.format.metaLabel]
        switch badge {
        case .mark(let m): parts.append(m.myLabel)
        case .wait(let l): parts.append("sale \(l)")
        case .none: break
        }
        return parts.joined(separator: ", ")
    }

    @ViewBuilder private var badgeView: some View {
        switch badge {
        case .none:
            EmptyView()
        case .mark(let m):
            ArtCircle(size: 24) { GlyphView(glyph: m.glyph, size: 12) }
        case .wait(let l):
            HStack(spacing: 5) {
                GlyphView(glyph: .clock, size: 12)
                Text(l)
                    .font(.kura.mono(10))
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(KColor.text)
                    .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .frame(height: 24)
            .kArtGlass(in: Capsule())
            .fixedSize()
        }
    }
}

/// Balanced columns read top to bottom: the shortest column height H at which filling the
/// columns in order (next tile goes to the next column once it would pass H) fits every tile —
/// what CSS `column-fill: balance` does.
struct ColumnsLayout: Layout {
    var columns = 3
    var spacingX: CGFloat = 12
    var spacingY: CGFloat = 18

    private func columnWidth(_ width: CGFloat) -> CGFloat {
        max(1, (width - spacingX * CGFloat(columns - 1)) / CGFloat(columns))
    }

    /// Column and y of each tile, plus the tallest column.
    private func arrange(_ width: CGFloat, _ subviews: Subviews) -> (slots: [(col: Int, y: CGFloat)], height: CGFloat) {
        let w = columnWidth(width)
        let heights = subviews.map { $0.sizeThatFits(ProposedViewSize(width: w, height: nil)).height }
        guard !heights.isEmpty else { return ([], 0) }
        let total = heights.reduce(0, +) + spacingY * CGFloat(heights.count)
        var target = max(heights.max() ?? 0, (total / CGFloat(columns)).rounded(.up))
        while true {
            var slots: [(Int, CGFloat)] = []
            var col = 0
            var y: CGFloat = 0
            var fits = true
            for h in heights {
                if y > 0 && y + h > target {
                    col += 1
                    y = 0
                    if col >= columns { fits = false; break }
                }
                slots.append((col, y))
                y += h + spacingY
            }
            if fits {
                var tallest: CGFloat = 0
                for (i, s) in slots.enumerated() { tallest = max(tallest, s.1 + heights[i]) }
                return (slots.map { (col: $0.0, y: $0.1) }, tallest)
            }
            target += 4
        }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 350
        return CGSize(width: width, height: arrange(width, subviews).height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let w = columnWidth(bounds.width)
        let (slots, _) = arrange(bounds.width, subviews)
        for (i, v) in subviews.enumerated() where i < slots.count {
            let s = slots[i]
            v.place(at: CGPoint(x: bounds.minX + CGFloat(s.col) * (w + spacingX), y: bounds.minY + s.y),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(width: w, height: nil))
        }
    }
}

/// The hold as a VoiceOver action, only when there is one.
private struct HoldAction: ViewModifier {
    let onHold: (() -> Void)?
    func body(content: Content) -> some View {
        if let onHold { content.accessibilityAction(named: "Opciones", onHold) } else { content }
    }
}
