import SwiftUI
import ImageIO
import UIKit

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

/// A cover: the downsampled image (`CoverImage`), the palette as a 160° gradient while it loads or if it
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
    /// Optional: previews and the welcome art draw covers outside the app's environment.
    @Environment(AppStore.self) private var store: AppStore?

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
        cover
            // The first draw of a title with no palette extracts its cover on the device
            // (`AppStore+Palette`): the tints stop falling back to gray, for everyone.
            .task(id: title.id) {
                if title.palette.isEmpty { store?.fillPaletteIfNeeded(title) }
            }
    }

    @ViewBuilder private var cover: some View {
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
/// Decoded and downsampled to the size it's drawn at (`CoverImageStore`), never the
/// CDN's 600×600 for a 40 pt thumb.
struct CoverImage: View {
    let url: URL?
    let palette: [String]

    var body: some View {
        GeometryReader { geo in
            CoverImageBody(url: url, palette: palette, size: geo.size)
                .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}

private struct CoverImageBody: View {
    let url: URL?
    let palette: [String]
    let size: CGSize
    @Environment(\.displayScale) private var scale
    /// The last image this view drew: kept while a new size bucket loads (no flash
    /// back to the palette when a cover grows or shrinks).
    @State private var loaded: (url: URL, image: UIImage)?

    var body: some View {
        let key = url.map { CoverImageStore.Key(url: $0, size: size, scale: scale) }
        let img = key.flatMap { CoverImageStore.shared.cached($0) } ?? (loaded?.url == url ? loaded?.image : nil)
        ZStack {
            if let img {
                Image(uiImage: img).resizable().scaledToFill()
                    .frame(width: size.width, height: size.height)
                    .transition(.opacity)
            } else {
                Tint.coverFallback(palette)
            }
        }
        .animation(KMotion.tint, value: img != nil)
        // Leaving the screen cancels the wait (and the download, once nobody else wants it).
        .task(id: key) {
            guard let key else { return }
            // The cache may have filled between this body and the task (another view finished the
            // same download): take the hit as ours, or this view keeps drawing the palette.
            if let hit = CoverImageStore.shared.cached(key) {
                if loaded?.url != key.url || loaded?.image !== hit { loaded = (key.url, hit) }
                return
            }
            if let image = await CoverImageStore.shared.image(for: key), !Task.isCancelled {
                loaded = (key.url, image)
            }
        }
    }
}

/// Decoded, downsampled covers in memory — the cover twin of `AvatarStore`. Cover art is
/// public CDN art (TMDB, iTunes…): no bearer, and the raw bytes also sit in
/// `URLCache.shared` (sized in `KuraApp`), so a cover evicted from here comes back from
/// disk, not the network.
///
/// Keyed by URL + the size bucket it's drawn at; a request for a key already in flight
/// joins it, and the download is cancelled once every view waiting on it is gone.
@MainActor
final class CoverImageStore {
    static let shared = CoverImageStore()

    struct Key: Hashable {
        let url: URL
        /// Longest drawn side in pixels, rounded up to a 64 px step: a cover that moves a
        /// few points (zoom, Dynamic Type) doesn't decode again.
        let bucket: Int

        init(url: URL, size: CGSize, scale: CGFloat) {
            self.url = url
            let px = max(size.width, size.height, 1) * max(scale, 1)
            bucket = Int((px / 64).rounded(.up)) * 64
        }

        var nsKey: NSString { "\(bucket)|\(url.absoluteString)" as NSString }
    }

    private let cache = NSCache<NSString, UIImage>()
    private var inflight: [Key: (task: Task<UIImage?, Never>, waiters: Int)] = [:]

    private init() {
        // Cost = decoded bytes: a 300 pt cover at 3× is ~3 MB. iOS trims it under pressure.
        cache.totalCostLimit = 96 * 1024 * 1024
    }

    func cached(_ key: Key) -> UIImage? { cache.object(forKey: key.nsKey) }

    func image(for key: Key) async -> UIImage? {
        if let img = cached(key) { return img }
        let task: Task<UIImage?, Never>
        if let entry = inflight[key] {
            task = entry.task
            inflight[key]?.waiters += 1
        } else {
            task = Task.detached(priority: .userInitiated) { await CoverImageStore.fetch(key) }
            inflight[key] = (task, 1)
        }
        let img = await withTaskCancellationHandler {
            await task.value
        } onCancel: {
            Task { @MainActor in CoverImageStore.shared.leave(key) }
        }
        // The download is over (done, failed or cancelled): nobody needs to join it anymore.
        if inflight[key]?.task == task { inflight[key] = nil }
        if let img, cached(key) == nil {
            cache.setObject(img, forKey: key.nsKey, cost: img.cgImage.map { $0.bytesPerRow * $0.height } ?? 0)
        }
        return img
    }

    /// One waiter fewer; the last one out cancels the download.
    private func leave(_ key: Key) {
        guard let entry = inflight[key] else { return }
        if entry.waiters <= 1 {
            inflight[key] = nil
            entry.task.cancel()
        } else {
            inflight[key]?.waiters -= 1
        }
    }

    private nonisolated static func fetch(_ key: Key) async -> UIImage? {
        guard let (data, response) = try? await URLSession.shared.data(from: key.url),
              (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true,
              !Task.isCancelled else { return nil }
        return downsample(data, maxPixel: CGFloat(key.bucket))
    }

    /// ImageIO thumbnail: decodes straight at the target size (never the full image).
    private nonisolated static func downsample(_ data: Data, maxPixel: CGFloat) -> UIImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        // `maxPixel` bounds the drawn frame's longest side. The image FILLS that frame, so its
        // short side has to reach it (a 2:3 poster in a square slot) — never past the original.
        var limit = maxPixel
        if let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any],
           let w = (props[kCGImagePropertyPixelWidth] as? NSNumber).map({ CGFloat($0.doubleValue) }),
           let h = (props[kCGImagePropertyPixelHeight] as? NSNumber).map({ CGFloat($0.doubleValue) }),
           min(w, h) > 0 {
            limit = min(max(w, h), maxPixel * max(w, h) / min(w, h))
        }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(limit, 1),
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// Glass-art: the system's one surface for small controls/badges ON artwork — a blur plus
/// rgba(11,11,13,.5), dark on every OS (content stays flat: it is never Liquid Glass). Every
/// badge over a cover goes through this instead of hand-pairing a material with a fill.
extension View {
    func kArtGlass<S: Shape>(in shape: S) -> some View {
        background {
            ZStack {
                shape.fill(.ultraThinMaterial)
                shape.fill(KColor.glassArt)
            }
        }
        .environment(\.colorScheme, .dark)
    }
}

/// Glass-art circle that sits over artwork (blur + rgba(11,11,13,.5)).
struct ArtCircle<Content: View>: View {
    var size: CGFloat = 26
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(width: size, height: size)
            .kArtGlass(in: Circle())
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
        .kArtGlass(in: Capsule())
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
