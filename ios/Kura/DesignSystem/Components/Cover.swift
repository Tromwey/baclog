import SwiftUI

/// What sits on a cover's top-left corner.
enum CoverBadge: Equatable {
    case none
    /// Grid pill: 26 circle, glass-art, glyph 13.
    case mark(Mark)
    /// Waiting pill: clock + "14 h" / "16 oct".
    case waiting(String)
    /// Selection number (onboarding).
    case number(Int)
    /// Plain check (chosen cover).
    case chosen
}

/// A cover: AsyncImage, the palette as a 160° gradient while it loads or if it
/// fails, the DS corner radius and cover shadow.
struct CoverView: View {
    let title: Title
    var width: CGFloat? = nil
    var height: CGFloat? = nil
    var radius: CGFloat = KRadius.coverL
    var badge: CoverBadge = .none
    var shadow = true
    var badgeHeight: CGFloat = 26
    /// Fill the proposed width at the format's aspect (grids).
    var fluid = false

    private var size: CGSize {
        let a = title.format.aspect
        switch (width, height) {
        case let (w?, h?): return CGSize(width: w, height: h)
        case let (w?, nil): return CGSize(width: w, height: w / a)
        case let (nil, h?): return CGSize(width: h * a, height: h)
        default: return CGSize(width: 100, height: 100 / a)
        }
    }

    var body: some View {
        if fluid {
            Color.clear
                .aspectRatio(title.format.aspect, contentMode: .fit)
                .overlay { CoverImage(url: title.coverURL, palette: title.palette) }
                .overlay(alignment: .topLeading) { badgeView.padding(6) }
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                .modifier(ConditionalShadow(on: shadow))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(accessibilityText)
        } else {
            fixed
        }
    }

    private var fixed: some View {
        let s = size
        return ZStack(alignment: .topLeading) {
            CoverImage(url: title.coverURL, palette: title.palette)
                .frame(width: s.width, height: s.height)
            badgeView
                .padding(6)
        }
        .frame(width: s.width, height: s.height)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .modifier(ConditionalShadow(on: shadow))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        switch badge {
        case .mark(let m): return "\(title.name), \(m.myLabel)"
        case .waiting(let l): return "\(title.name), sale \(l)"
        default: return title.name
        }
    }

    @ViewBuilder private var badgeView: some View {
        switch badge {
        case .none:
            EmptyView()
        case .mark(let m):
            ArtCircle(size: 26) { GlyphView(glyph: m.glyph, size: 13) }
        case .waiting(let label):
            WaitingPill(label: label, height: badgeHeight)
        case .number(let n):
            ArtCircle(size: 26) {
                Text("\(n)").font(.kura.mono(12)).foregroundStyle(KColor.text)
            }
        case .chosen:
            ArtCircle(size: 26) {
                Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(KColor.text)
            }
        }
    }
}

private struct ConditionalShadow: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.kShadow(.cover) } else { content }
    }
}

/// The image itself, with the palette fallback. Fades in (240 ms, the tint timing).
struct CoverImage: View {
    let url: URL?
    let palette: [String]

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: KMotion.tint)) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
                    .transition(.opacity)
            default:
                Tint.coverFallback(palette)
            }
        }
    }
}

/// Glass-art circle that sits over artwork (blur + rgba(11,11,13,.5)).
struct ArtCircle<Content: View>: View {
    var size: CGFloat = 26
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(width: size, height: size)
            .background {
                ZStack {
                    Circle().fill(.ultraThinMaterial)
                    Circle().fill(KColor.glassArt)
                }
            }
            .environment(\.colorScheme, .dark)
    }
}

/// Clock + date pill used over covers ("no puedo esperar").
struct WaitingPill: View {
    let label: String
    var height: CGFloat = 26
    var body: some View {
        HStack(spacing: 5) {
            GlyphView(glyph: .clock, size: 12.5)
            Text(label)
                .font(.kura.mono(height < 26 ? 10 : 11))
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundStyle(KColor.text)
                .lineLimit(1)
        }
        .padding(.leading, 7)
        .padding(.trailing, 9)
        .frame(height: height)
        .background {
            ZStack {
                Capsule().fill(.ultraThinMaterial)
                Capsule().fill(KColor.glassArt)
            }
        }
        .environment(\.colorScheme, .dark)
        .fixedSize()
    }
}

/// A dashed empty slot (the only borders allowed: mock affordances).
struct EmptyCoverSlot: View {
    var width: CGFloat = 160
    var height: CGFloat = 240
    var body: some View {
        RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous)
            .fill(Color.white.opacity(0.03))
            .overlay {
                RoundedRectangle(cornerRadius: KRadius.coverL, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.18), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
            }
            .overlay {
                Image(systemName: "plus").font(.system(size: 24, weight: .medium)).foregroundStyle(KColor.text2)
            }
            .frame(width: width, height: height)
    }
}
