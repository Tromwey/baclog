package com.tromwey.kura.data

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import coil3.ImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.cbrt
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * On-device cover palette — the Kotlin twin of iOS `CoverPalette` and of the web's
 * `extractPalette` (`src/modules/cards/palette.ts`). `catalog_item.paletteHex` is filled on-device,
 * once, by whoever shows the title first (first writer wins), so web, iOS and Android MUST agree on
 * what a cover's palette is: the same algorithm, not `androidx.palette` (its quantizer and
 * swatch ranking give different hexes, which would make the shared cache depend on which phone
 * saw the cover first). Only the hexes ever leave the phone, never the artwork (ADR-008).
 *
 * 64×64 raster → 3-bit-per-channel buckets averaged inside each bucket → ranked by vividness
 * (chroma = max−min channel) × coverage, or by coverage alone when monochrome (every chroma < 8)
 * → up to 5 `#rrggbb` picked for variety (`rank`). Any failure is `[]`, never a guess.
 */
object CoverPalette {
    private const val SIDE = 64

    /** Loads through Coil (a cover already drawn comes from its cache), off the main thread. */
    suspend fun extract(context: Context, imageLoader: ImageLoader, url: String): List<String> {
        val request = ImageRequest.Builder(context).data(url).size(SIDE * 4).allowHardware(false).build()
        val result = imageLoader.execute(request) as? SuccessResult ?: return emptyList()
        return withContext(Dispatchers.Default) {
            try {
                extract(result.image.toBitmap())
            } catch (c: CancellationException) {
                throw c
            } catch (e: RuntimeException) {
                Log.w("KuraPalette", "No se pudo leer la portada para la paleta (${e.javaClass.simpleName})")
                emptyList()
            }
        }
    }

    /** The ranking on an already-decoded bitmap (any size: drawn into 64×64 like the web's `drawImage`). */
    fun extract(bitmap: Bitmap): List<String> {
        val small = Bitmap.createScaledBitmap(bitmap, SIDE, SIDE, true)
        val argb = IntArray(SIDE * SIDE)
        small.getPixels(argb, 0, SIDE, 0, 0, SIDE, SIDE)
        if (small !== bitmap) small.recycle()
        val px = IntArray(argb.size * 4)
        for ((i, c) in argb.withIndex()) {
            px[i * 4] = (c shr 16) and 0xff
            px[i * 4 + 1] = (c shr 8) and 0xff
            px[i * 4 + 2] = c and 0xff
            px[i * 4 + 3] = (c ushr 24) and 0xff
        }
        return rank(px)
    }

    // Twin of the web's `PALETTE_MIN_DELTA` & co. (`src/modules/cards/palette.ts`) and iOS; change all or none.
    const val MIN_DELTA = 20.0
    private const val MIN_SHARE = 0.01
    private const val NEUTRAL_SHARE = 0.08
    private const val LIGHT_L = 80.0
    private const val DARK_L = 20.0

    private class Bucket { var r = 0; var g = 0; var b = 0; var n = 0 }
    private class Avg(val r: Int, val g: Int, val b: Int, val n: Int, val chroma: Int)
    private class Mass(val isLight: Boolean, val rep: Int, val share: Double)

    /**
     * RGBA pixels (0…255 each, a 64×64 raster) → up to 5 `#rrggbb`, most memorable first — the twin
     * of the web's `rankPalette`. Tone 1 is the top score and never moves; each next one is the best
     * score among buckets ≥ `MIN_DELTA` (CIE76) from ALL chosen ones and ≥ 1 % coverage; a light
     * (L* ≥ 80) or dark (L* ≤ 20) mass ≥ 8 % that tone 1 isn't part of gets one reserved slot; short
     * of distinct candidates the rest fill by score — never fewer colours.
     */
    fun rank(px: IntArray): List<String> {
        val buckets = HashMap<Int, Bucket>()
        val order = ArrayList<Int>() // insertion order = the web Map's tie-break (raster order)
        var total = 0
        var i = 0
        while (i < px.size - 3) {
            if (px[i + 3] >= 200) {
                val r = px[i]; val g = px[i + 1]; val b = px[i + 2]
                val key = ((r shr 5) shl 6) or ((g shr 5) shl 3) or (b shr 5)
                val bucket = buckets.getOrPut(key) { order.add(key); Bucket() }
                bucket.r += r; bucket.g += g; bucket.b += b; bucket.n += 1
                total += 1
            }
            i += 4
        }

        val averaged = order.mapNotNull { key ->
            val s = buckets[key] ?: return@mapNotNull null
            if (s.n == 0) return@mapNotNull null
            // `Math.round` of a positive mean = round half up.
            val r = Math.round(s.r.toDouble() / s.n).toInt()
            val g = Math.round(s.g.toDouble() / s.n).toInt()
            val b = Math.round(s.b.toDouble() / s.n).toInt()
            Avg(r, g, b, s.n, max(r, max(g, b)) - min(r, min(g, b)))
        }
        if (averaged.isEmpty()) return emptyList()

        val monochrome = (averaged.maxOf { it.chroma }) < 8
        val score: (Avg) -> Int = if (monochrome) { a -> a.n } else { a -> a.chroma * a.n }
        // Stable sort, like `Array.prototype.sort`.
        val ranked = averaged.sortedByDescending(score)

        val lab = ranked.map { lab(it.r, it.g, it.b) }
        val want = min(5, ranked.size)
        val picked = mutableListOf(0)
        fun far(idx: Int) = picked.all { deltaE(lab[idx], lab[it]) >= MIN_DELTA }

        fun contains(m: Mass, l: Double) = if (m.isLight) l >= LIGHT_L else l <= DARK_L
        fun mass(light: Boolean): Mass {
            var n = 0
            var rep = -1
            for ((idx, c) in ranked.withIndex()) {
                val l = lab[idx][0]
                if (if (light) l >= LIGHT_L else l <= DARK_L) {
                    n += c.n
                    if (rep < 0 || c.n > ranked[rep].n) rep = idx
                }
            }
            return Mass(light, rep, if (total > 0) n.toDouble() / total else 0.0)
        }
        val neutral = listOf(mass(true), mass(false))
            .filter { it.rep >= 0 && it.share >= NEUTRAL_SHARE && !contains(it, lab[0][0]) }
            .sortedByDescending { it.share }
            .firstOrNull()
        fun needsNeutral() = neutral?.let { m -> picked.none { contains(m, lab[it][0]) } } ?: false

        fun diverse(limit: Int) {
            var j = 1
            while (j < ranked.size && picked.size < limit) {
                if (!picked.contains(j) && ranked[j].n.toDouble() >= total * MIN_SHARE && far(j)) picked.add(j)
                j++
            }
        }
        diverse(want - if (needsNeutral()) 1 else 0)
        if (neutral != null && needsNeutral() && picked.size < want && far(neutral.rep)) picked.add(neutral.rep)
        diverse(want)
        var j = 1
        while (j < ranked.size && picked.size < want) {
            if (!picked.contains(j)) picked.add(j)
            j++
        }

        return picked.map { ranked[it].let { c -> "#" + hex2(c.r) + hex2(c.g) + hex2(c.b) } }
    }

    /** CIE L*a*b* (D65) — same math as the web's `lab` (and `kura/tint.ts`). */
    private fun lab(r8: Int, g8: Int, b8: Int): DoubleArray {
        fun lin(v: Int): Double {
            val x = v / 255.0
            return if (x <= 0.04045) x / 12.92 else ((x + 0.055) / 1.055).pow(2.4)
        }
        val r = lin(r8); val g = lin(g8); val b = lin(b8)
        val x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
        val y = 0.2126 * r + 0.7152 * g + 0.0722 * b
        val z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
        fun f(t: Double) = if (t > 0.008856) cbrt(t) else 7.787 * t + 16.0 / 116.0
        return doubleArrayOf(116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))
    }

    private fun deltaE(p: DoubleArray, q: DoubleArray): Double {
        val a = p[0] - q[0]; val b = p[1] - q[1]; val c = p[2] - q[2]
        return sqrt(a * a + b * b + c * c)
    }

    /** 0…255 → two lowercase hex digits (the web's `toString(16).padStart(2, "0")`). */
    private fun hex2(v: Int) = v.toString(16).padStart(2, '0')
}
