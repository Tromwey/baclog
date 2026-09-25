import SwiftUI

/// Vertical spine label: mono 13, tracking .14em, reads bottom → top.
struct SpineLabel: View {
    let text: String
    let height: CGFloat
    var color: Color = KColor.text
    var size: CGFloat = 13

    var body: some View {
        Text(text)
            .font(.kura.mono(size))
            .tracking(size * 0.14)
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.78)
            .truncationMode(.tail)
            .frame(width: max(height - 16, 20))
            .fixedSize(horizontal: false, vertical: true)
            .rotationEffect(.degrees(-90))
            .frame(width: KSize.spine, height: height)
            .background(KColor.spine)
            .accessibilityHidden(true)
    }
}

/// Card of a collection in "tus colecciones": 40 px spine + covers aligned to
/// the base, all the same height. Scrolls horizontally when it overflows.
struct CollectionCard: View {
    let collection: KCollection
    let titles: [Title]
    let marks: [String: Mark]
    let palette: [String]?
    var coverHeight: CGFloat
    var spineSize: CGFloat = 13
    var waitingLabel: (Title) -> String? = { _ in nil }
    var onTap: () -> Void = {}
    var onTitleTap: ((Title) -> Void)? = nil
    var onLongPress: () -> Void = {}
    /// The covers push their own ficha (not the collection): they're zoom sources.
    var coversOpenTitles = false

    /// Covers mounted per card: enough to overflow any screen, never a whole long collection.
    static let teaserLimit = 12

    private var vPad: CGFloat { coverHeight >= 150 ? 20 : 16 }
    private var cardHeight: CGFloat { coverHeight + vPad * 2 }

    var body: some View {
        GeometryReader { geo in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    SpineLabel(text: collection.name, height: cardHeight,
                               color: titles.isEmpty ? KColor.text3 : KColor.text, size: spineSize)
                    HStack(alignment: .bottom, spacing: 10) {
                        if titles.isEmpty {
                            ForEach(0..<3, id: \.self) { i in
                                RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous)
                                    .fill(KColor.s2)
                                    .frame(width: coverHeight * 2 / 3, height: coverHeight)
                                    .opacity(i == 2 ? 0.5 : 1)
                            }
                        }
                        // A teaser, not the shelf: the collection itself shows everything. Counts
                        // (VoiceOver's included) still read the full `titles`.
                        ForEach(titles.prefix(CollectionCard.teaserLimit)) { t in
                            CoverView(title: t, height: coverHeight, badge: badge(for: t))
                                .zoomSource(coversOpenTitles ? ZoomID.title(t.id) : nil)
                                .onTapGesture { (onTitleTap ?? { _ in onTap() })(t) }
                        }
                        Color.clear.frame(width: 2, height: 1)
                    }
                    .padding(.vertical, vPad)
                    .padding(.horizontal, 14)
                }
                .frame(minWidth: geo.size.width - 24, alignment: .leading)
                .background(surface)
                .clipShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                .kPressable(longPress: onLongPress, action: onTap)
                .padding(.horizontal, 12)
            }
            .scrollClipDisabled()
        }
        .frame(height: cardHeight)
        .kFixedChrome()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(collection.name), \(titles.count) títulos")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: "Opciones") { onLongPress() }
    }

    private var surface: AnyShapeStyle {
        if let palette { return AnyShapeStyle(Tint.card(palette)) }
        return AnyShapeStyle(KColor.s1)
    }

    private func badge(for t: Title) -> CoverBadge {
        if let m = marks[t.id] { return .mark(m) }
        if let w = waitingLabel(t) { return .waiting(w) }
        return .none
    }
}

/// The automatic "no puedo esperar" card: spine, "auto" pill, covers with clock pills.
struct WaitingCard: View {
    let titles: [Title]
    let label: (Title) -> String
    var onTap: () -> Void
    var onTitleTap: (Title) -> Void

    private let coverHeight: CGFloat = 150
    private var cardHeight: CGFloat { coverHeight + 44 + 18 }

    var body: some View {
        GeometryReader { geo in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    SpineLabel(text: "no puedo esperar", height: cardHeight)
                    HStack(alignment: .bottom, spacing: 10) {
                        ForEach(titles.prefix(CollectionCard.teaserLimit)) { t in
                            CoverView(title: t, height: coverHeight, badge: .waiting(label(t)), badgeHeight: 24)
                                .zoomSource(ZoomID.title(t.id))
                                .onTapGesture { onTitleTap(t) }
                        }
                        Color.clear.frame(width: 2, height: 1)
                    }
                    .padding(.top, 44)
                    .padding(.bottom, 18)
                    .padding(.horizontal, 14)
                }
                .frame(minWidth: geo.size.width - 24, alignment: .leading)
                .background(Tint.card(titles.first?.palette ?? ["#5ca6cb", "#33566e"]))
                .overlay(alignment: .topLeading) {
                    Text("auto")
                        .monoLabel(10)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(KColor.glassArt, in: Capsule())
                        .padding(.top, 12)
                        .padding(.leading, 56)
                }
                .clipShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: KRadius.screen, style: .continuous))
                .kPressable(action: onTap)
                .padding(.horizontal, 12)
            }
            .scrollClipDisabled()
        }
        .frame(height: cardHeight)
        .kFixedChrome()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("no puedo esperar, automática, \(titles.count) títulos")
        .accessibilityAddTraits(.isButton)
    }
}
