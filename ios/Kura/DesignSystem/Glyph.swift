import SwiftUI

/// One glyph, one meaning; the color reinforces it (sistema-de-diseno · glifos).
enum Glyph: Hashable {
    case flame, thumb, check, clock, bookmark, review, users, lock, warn

    var symbol: String {
        switch self {
        case .flame: return "flame.fill"
        case .thumb: return "hand.thumbsup.fill"
        case .check: return "checkmark"
        case .clock: return "clock.fill"
        case .bookmark: return "bookmark.fill"
        case .review: return "bubble.fill"
        case .users: return "person.2.fill"
        case .lock: return "lock.fill"
        case .warn: return "exclamationmark.triangle.fill"
        }
    }

    var color: Color {
        switch self {
        case .flame: return KColor.obsessed
        case .thumb: return KColor.liked
        case .check: return KColor.completed
        case .clock: return KColor.waiting
        default: return KColor.text
        }
    }
}

struct GlyphView: View {
    let glyph: Glyph
    var size: CGFloat = 14
    var color: Color? = nil

    var body: some View {
        Image(systemName: glyph.symbol)
            .font(.system(size: glyph == .check ? size * 0.92 : size * 0.86,
                          weight: glyph == .check ? .bold : .regular))
            .foregroundStyle(color ?? glyph.color)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

// MARK: - Dock icons (bespoke filled shapes from the mocks)

struct DockIcon: View {
    let tab: Tab
    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Self.path(tab, side: size.width), with: .foreground)
        }
        .frame(width: 21, height: 21)
        .accessibilityHidden(true)
    }

    /// The same shape as a template image, for the system tab bar (iOS 26).
    static func image(_ tab: Tab) -> UIImage {
        let side: CGFloat = 24
        let img = UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { r in
            UIColor.black.setFill()
            r.cgContext.addPath(path(tab, side: side).cgPath)
            r.cgContext.fillPath()
        }
        return img.withRenderingMode(.alwaysTemplate)
    }

    static func path(_ tab: Tab, side: CGFloat) -> Path {
        let s = side / 24
        func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
            CGRect(x: x * s, y: y * s, width: w * s, height: h * s)
        }
        var path = Path()
        switch tab {
        case .collections:
            path.addRoundedRect(in: r(4, 4, 16, 6.6), cornerSize: CGSize(width: 1.7 * s, height: 1.7 * s))
            path.addRoundedRect(in: r(4, 13.4, 16, 6.6), cornerSize: CGSize(width: 1.7 * s, height: 1.7 * s))
        case .discover:
            path.move(to: CGPoint(x: 12 * s, y: 2 * s))
            path.addLine(to: CGPoint(x: 14 * s, y: 10 * s))
            path.addLine(to: CGPoint(x: 22 * s, y: 12 * s))
            path.addLine(to: CGPoint(x: 14 * s, y: 14 * s))
            path.addLine(to: CGPoint(x: 12 * s, y: 22 * s))
            path.addLine(to: CGPoint(x: 10 * s, y: 14 * s))
            path.addLine(to: CGPoint(x: 2 * s, y: 12 * s))
            path.addLine(to: CGPoint(x: 10 * s, y: 10 * s))
            path.closeSubpath()
        case .feed:
            path.addEllipse(in: r(8 - 4.2, 12 - 4.2, 8.4, 8.4))
            path.addRoundedRect(in: r(16, 7.6, 4, 3.2), cornerSize: CGSize(width: 1.6 * s, height: 1.6 * s))
            path.addRoundedRect(in: r(16, 13.2, 2.2, 3.2), cornerSize: CGSize(width: 1.1 * s, height: 1.6 * s))
        case .profile:
            path.addEllipse(in: r(12 - 3.8, 8.5 - 3.8, 7.6, 7.6))
            path.move(to: CGPoint(x: 5 * s, y: 20.5 * s))
            path.addRelativeArc(center: CGPoint(x: 12 * s, y: 20.5 * s), radius: 7 * s,
                                startAngle: .degrees(180), delta: .degrees(180))
            path.closeSubpath()
        }
        return path
    }
}
