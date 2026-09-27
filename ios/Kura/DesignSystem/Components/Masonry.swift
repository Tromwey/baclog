import SwiftUI

/// "Títulos en columnas" (Colecciones formalizado): a collection's titles in three independent
/// columns — records 1:1 and posters 2:3 stack without gaps, each title dealt in order to the
/// shortest column so the reading runs along the rows (`ColumnsLayout`). Each tile: the cover at its native form with the
/// state glyph (24) or the wait pill top-left and the title in Newsreader italic 14, up to two lines — no year:
/// detail lives in the ficha (founder, 2026-09-27). Gap 12 between columns, 18 between tiles, 20 on the sides.
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
                // Two lines: with the year gone the name is the only line under the cover, and
                // one line cut "The Life of a Show…" (critica 2026-09-27 #25).
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
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

/// Titles dealt across the columns in order, each to the currently SHORTEST column (a tie goes to
/// the leftmost), with the tiles' real heights (a 2:3 poster is taller than a 1:1 record). So the
/// reading runs along the rows — 1→col 1, 2→col 2, 3→col 3, 4→the shortest… — and a column is
/// never left empty while there are at least as many titles as columns (4 equal tiles = 2·1·1).
/// Founder, 2026-09-27: this replaced the CSS `columns-3` fill (4 records came out 2·2·0). The
/// web's `masonry.tsx` deals the same way with heights estimated from the aspect.
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
        var tops = Array(repeating: CGFloat(0), count: max(1, columns))
        var slots: [(col: Int, y: CGFloat)] = []
        var tallest: CGFloat = 0
        for v in subviews {
            let h = v.sizeThatFits(ProposedViewSize(width: w, height: nil)).height
            // Half-point tolerance: rounding in the measured heights must not break a visual tie.
            var col = 0
            for c in 1..<tops.count where tops[c] < tops[col] - 0.5 { col = c }
            slots.append((col: col, y: tops[col]))
            tallest = max(tallest, tops[col] + h)
            tops[col] += h + spacingY
        }
        return (slots, tallest)
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
