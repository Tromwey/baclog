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
/// monochrome (every chroma < 8) → up to 5 `#rrggbb`, picked for variety (`rank`). Any failure
/// is `[]`, never a guess.
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

        return rank(px)
    }

    // PROPUESTA (2026-09-28, pendiente del founder) — paleta con variedad. Twin of the web's
    // `PALETTE_MIN_DELTA` & co. in `src/modules/cards/palette.ts`; change both or neither.
    static let minDelta = 20.0
    private static let minShare = 0.01
    private static let neutralShare = 0.08
    private static let lightL = 80.0
    private static let darkL = 20.0

    /// RGBA pixels (a 64×64 raster) → up to 5 `#rrggbb`, most memorable first — the twin of
    /// the web's `rankPalette`. Buckets of 3 bits per channel averaged inside; score = chroma ×
    /// coverage (coverage alone when monochrome). Then variety: the first colour is the top score
    /// (tone 1 never moves); each next one is the best score among buckets ≥ `minDelta` (CIE76)
    /// from ALL chosen ones and ≥ 1 % coverage; a light (L* ≥ 80) or dark (L* ≤ 20) mass ≥ 8 %
    /// that tone 1 isn't part of gets one reserved slot (its biggest bucket; the larger mass
    /// wins); short of distinct candidates the rest fill by score — never fewer colours.
    static func rank(_ px: [UInt8]) -> [String] {
        struct Bucket { var r = 0, g = 0, b = 0, n = 0 }
        var buckets: [Int: Bucket] = [:]
        // Insertion order, for the same tie-break as the web's Map (raster order).
        var order: [Int] = []
        var total = 0
        for i in stride(from: 0, to: px.count - 3, by: 4) where px[i + 3] >= 200 {
            let r = Int(px[i]), g = Int(px[i + 1]), b = Int(px[i + 2])
            let key = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5)
            if buckets[key] == nil { order.append(key) }
            buckets[key, default: Bucket()].r += r
            buckets[key]!.g += g
            buckets[key]!.b += b
            buckets[key]!.n += 1
            total += 1
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
        let ranked: [Avg] = averaged.enumerated()
            .sorted { score($0.element) != score($1.element) ? score($0.element) > score($1.element) : $0.offset < $1.offset }
            .map(\.element)

        let lab = ranked.map { Self.lab($0.r, $0.g, $0.b) }
        let want = min(5, ranked.count)
        var picked = [0]
        func far(_ i: Int) -> Bool { picked.allSatisfy { Self.deltaE(lab[i], lab[$0]) >= minDelta } }

        // The light / dark mass (white paper, a black field) counted as a group — it splits
        // across several buckets — represented by its biggest bucket.
        struct Mass { let isLight: Bool; let rep: Int; let share: Double }
        func contains(_ m: Mass, _ l: Double) -> Bool { m.isLight ? l >= lightL : l <= darkL }
        func mass(light: Bool) -> Mass {
            var n = 0, rep = -1
            for (i, c) in ranked.enumerated() where light ? lab[i].0 >= lightL : lab[i].0 <= darkL {
                n += c.n
                if rep < 0 || c.n > ranked[rep].n { rep = i }
            }
            return Mass(isLight: light, rep: rep, share: total > 0 ? Double(n) / Double(total) : 0)
        }
        let neutral: Mass? = [mass(light: true), mass(light: false)]
            .filter { $0.rep >= 0 && $0.share >= neutralShare && !contains($0, lab[0].0) }
            .enumerated()
            .sorted { $0.element.share != $1.element.share ? $0.element.share > $1.element.share : $0.offset < $1.offset }
            .first?.element
        func needsNeutral() -> Bool { neutral.map { m in !picked.contains { contains(m, lab[$0].0) } } ?? false }

        func diverse(_ limit: Int) {
            var i = 1
            while i < ranked.count && picked.count < limit {
                if !picked.contains(i) && Double(ranked[i].n) >= Double(total) * minShare && far(i) { picked.append(i) }
                i += 1
            }
        }
        diverse(want - (needsNeutral() ? 1 : 0))
        if let m = neutral, needsNeutral(), picked.count < want, far(m.rep) { picked.append(m.rep) }
        diverse(want)
        var i = 1
        while i < ranked.count && picked.count < want {
            if !picked.contains(i) { picked.append(i) }
            i += 1
        }

        return picked.map { let c = ranked[$0]; return "#" + hex2(c.r) + hex2(c.g) + hex2(c.b) }
    }

    /// CIE L*a*b* (D65) — same math as the web's `lab` (and `kura/tint.ts`).
    private static func lab(_ r8: Int, _ g8: Int, _ b8: Int) -> (Double, Double, Double) {
        func lin(_ v: Int) -> Double {
            let x = Double(v) / 255
            return x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4)
        }
        let (r, g, b) = (lin(r8), lin(g8), lin(b8))
        let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
        let y = 0.2126 * r + 0.7152 * g + 0.0722 * b
        let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
        func f(_ t: Double) -> Double { t > 0.008856 ? cbrt(t) : 7.787 * t + 16.0 / 116.0 }
        return (116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))
    }

    private static func deltaE(_ p: (Double, Double, Double), _ q: (Double, Double, Double)) -> Double {
        let (a, b, c) = (p.0 - q.0, p.1 - q.1, p.2 - q.2)
        return (a * a + b * b + c * c).squareRoot()
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
