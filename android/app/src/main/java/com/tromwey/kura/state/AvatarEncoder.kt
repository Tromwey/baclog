package com.tromwey.kura.state

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.IOException

/**
 * The on-device half of F3.11 (iOS `AvatarEncoder`): center square crop, ≤ 512 px, JPEG under the
 * server's 400 KB cap (`AVATAR_MAX_BYTES`). The profile screen hands the result to
 * `AppStore.uploadAvatar(jpeg)`; `null` = unreadable (the store says so).
 */
object AvatarEncoder {
    const val SIDE = 512
    const val MAX_BYTES = 400 * 1024

    /** The decode's budget: a 48 MP photo decoded whole is ~190 MB of ARGB — an OOM on most phones. */
    const val DECODE_MAX = 1024

    /**
     * From the photo picker's `Uri`, decoded DOWNSAMPLED (a power-of-two `sampleSize`, done by the decoder
     * itself: the full-size bitmap never exists) so its short side stays ≥ [SIDE] (the crop) and its long
     * side is about [DECODE_MAX]. `null` = unreadable or too big even so (the store says so).
     */
    suspend fun encode(context: Context, uri: Uri): ByteArray? = withContext(Dispatchers.Default) {
        try {
            val bitmap = decode(context, uri) ?: return@withContext null
            encode(bitmap).also { bitmap.recycle() }
        } catch (_: OutOfMemoryError) {
            null
        }
    }

    private fun decode(context: Context, uri: Uri): Bitmap? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { d, info, _ ->
                d.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                d.setTargetSampleSize(sampleSize(info.size.width, info.size.height))
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            val opts = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight) }
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
        }
    } catch (_: IOException) {
        null
    } catch (_: RuntimeException) {
        null
    }

    /** Powers of two until the long side is ≤ [DECODE_MAX] — never below [SIDE] on the short side (the
     *  crop would blur). A 4000×3000 photo decodes at 1000×750. */
    fun sampleSize(width: Int, height: Int): Int {
        if (width <= 0 || height <= 0) return 1
        val short = minOf(width, height)
        val long = maxOf(width, height)
        var n = 1
        while (long / n > DECODE_MAX && short / (n * 2) >= SIDE) n *= 2
        return n
    }

    fun encode(image: Bitmap): ByteArray? {
        if (image.width <= 0 || image.height <= 0) return null
        val crop = minOf(image.width, image.height)
        val target = minOf(SIDE, crop)
        val out = Bitmap.createBitmap(target, target, Bitmap.Config.ARGB_8888)
        Canvas(out).apply {
            drawColor(Color.BLACK) // opaque, like iOS's renderer
            // Scale so the short side fills `target`, centered.
            val k = target.toFloat() / crop
            val w = image.width * k
            val h = image.height * k
            val left = (target - w) / 2f
            val top = (target - h) / 2f
            drawBitmap(image, null, android.graphics.RectF(left, top, left + w, top + h), Paint(Paint.FILTER_BITMAP_FLAG))
        }
        for (q in intArrayOf(85, 75, 60, 45)) {
            val bytes = ByteArrayOutputStream().use { s ->
                out.compress(Bitmap.CompressFormat.JPEG, q, s)
                s.toByteArray()
            }
            if (bytes.size <= MAX_BYTES) return bytes
        }
        return null
    }
}
