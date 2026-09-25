import CoreGraphics
import Foundation
import ImageIO

/// On-device cover palette — the Swift twin of the web's `extractPalette`
/// (`src/modules/cards/palette.ts`, F2.15 / F3.6.1). `catalog_item.paletteHex` is filled
/// on-device, once, by whoever shows the title first (AGENTS.md): colors are not protectable
/// expression (ADR-008), so only the hexes ever leave the phone, never the artwork.
///
/// Same algorithm, so web and app agree on what a cover's palette is:
/// 64×64 sRGB raster → 3-bit-per-channel buckets averaged inside each bucket → ranked by
/// vividness (chroma = max−min channel) × coverage, or by coverage alone when the art is
/// monochrome (every chroma < 8) → the top 5 as `#rrggbb`. Any failure is `[]`, never a guess.
enum CoverPalette {
    private static let side = 64

    /// Downloads (through `URLSession.shared`, so a cover already drawn comes from `URLCache`)
    /// and extracts off the main thread. `[]` on any failure.
    static func extract(from url: URL) async -> [String] {
        await Task.detached(priority: .utility) { () -> [String] in
            guard let (data, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true,
                  !Task.isCancelled,
                  let image = CoverPalette.thumbnail(data) else { return [] }
            return CoverPalette.extract(from: image)
        }.value
    }

    /// The ranking itself, on an already-decoded image (any size: it's drawn into 64×64
    /// like the web's `drawImage(img, 0, 0, 64, 64)`).
    static func extract(from image: CGImage) -> [String] {
        let n = side
        guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return [] }
        var px = [UInt8](repeating: 0, count: n * n * 4)
        let drawn: Bool = px.withUnsafeMutableBytes { buf in
            guard let ctx = CGContext(data: buf.baseAddress, width: n, height: n, bitsPerComponent: 8,
                                      bytesPerRow: n * 4, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: n, height: n))
            return true
        }
        guard drawn else { return [] }

        struct Bucket { var r = 0, g = 0, b = 0, n = 0 }
        var buckets: [Int: Bucket] = [:]
        // Insertion order, for the same tie-break as the web's Map (raster order).
        var order: [Int] = []
        for i in stride(from: 0, to: px.count, by: 4) where px[i + 3] >= 200 {
            let r = Int(px[i]), g = Int(px[i + 1]), b = Int(px[i + 2])
            let key = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5)
            if buckets[key] == nil { order.append(key) }
            buckets[key, default: Bucket()].r += r
            buckets[key]!.g += g
            buckets[key]!.b += b
            buckets[key]!.n += 1
        }

        struct Avg { let r: Int, g: Int, b: Int, n: Int, chroma: Int }
        let averaged: [Avg] = order.compactMap { key in
            guard let s = buckets[key], s.n > 0 else { return nil }
            // `Math.round` of a positive mean = round half up.
            let r = Int((Double(s.r) / Double(s.n)).rounded())
            let g = Int((Double(s.g) / Double(s.n)).rounded())
            let b = Int((Double(s.b) / Double(s.n)).rounded())
            return Avg(r: r, g: g, b: b, n: s.n, chroma: max(r, g, b) - min(r, g, b))
        }
        guard !averaged.isEmpty else { return [] }

        let monochrome = (averaged.map(\.chroma).max() ?? 0) < 8
        let score: (Avg) -> Int = monochrome ? { $0.n } : { $0.chroma * $0.n }
        // Stable sort (enumerated index as the tie-break), like `Array.prototype.sort`.
        return averaged.enumerated()
            .sorted { score($0.element) != score($1.element) ? score($0.element) > score($1.element) : $0.offset < $1.offset }
            .prefix(5)
            .map { "#" + hex2($0.element.r) + hex2($0.element.g) + hex2($0.element.b) }
    }

    /// 0…255 → two lowercase hex digits (the web's `toString(16).padStart(2, "0")`).
    private static func hex2(_ v: Int) -> String {
        let s = String(v, radix: 16)
        return s.count < 2 ? "0" + s : s
    }

    /// ImageIO decodes straight to a small thumbnail (never the CDN's full 600×900).
    private static func thumbnail(_ data: Data) -> CGImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: side * 4,
        ]
        return CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
    }
}
