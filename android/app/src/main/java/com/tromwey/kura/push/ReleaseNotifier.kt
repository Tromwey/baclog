package com.tromwey.kura.push

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.tromwey.kura.BuildConfig
import com.tromwey.kura.data.models.KCalendar
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.Title
import java.time.Duration
import java.time.Instant
import java.time.LocalTime
import java.util.concurrent.TimeUnit

/**
 * 31c · "Ya salió …" — a LOCAL notice on release day at 9:00 (Mexico City) for a title saved before
 * release (twin of iOS `ReleaseNotifier`), as a WorkManager `OneTimeWorkRequest` delayed until then,
 * unique per title (`release-<id>`, a re-save replaces it).
 *
 * Only while this install is NOT registered for remote push: then the server sends the same notice
 * and a local one would arrive twice (`PushRegistration`; registering cancels every pending local).
 * Permission is read when it fires, not when it's scheduled: granting it later still gets the notice.
 *
 * Debug only: an int `kura.debug.releaseNoticeDelaySec` in the `com.tromwey.kura.debug` prefs replaces
 * the delay, to see one fire without waiting for a real release day. Written from the Mac with
 * `adb shell run-as com.tromwey.kura` into `shared_prefs/com.tromwey.kura.debug.xml` (the app only reads it).
 */
object ReleaseNotifier {
    private const val PREFIX = "release-"
    private const val TAG = "kura-release-notice"

    fun schedule(context: Context, t: Title, registration: PushRegistration, now: Instant = Instant.now()) {
        if (registration.isRegistered) return
        val day = (t.release as? Release.Day)?.date ?: return
        val fireAt = KCalendar.date(day).atTime(LocalTime.of(9, 0)).atZone(KCalendar.zone).toInstant()
        val delay = debugDelay(context) ?: Duration.between(now, fireAt).takeIf { !it.isNegative && !it.isZero } ?: return
        val request = OneTimeWorkRequestBuilder<ReleaseNoticeWorker>()
            .setInitialDelay(delay.toMillis(), TimeUnit.MILLISECONDS)
            .setInputData(
                workDataOf(
                    ReleaseNoticeWorker.TITLE_ID to t.id,
                    ReleaseNoticeWorker.TITLE to "Ya salió ${t.name}",
                    // Neutral in gender for every format (un álbum es "lo"); a film may premiere on
                    // streaming, so no "en cines". Same copy as iOS.
                    ReleaseNoticeWorker.BODY to "No podías esperar. " +
                        if (t.format == MediaFormat.Album) "Ya puedes escucharlo." else "Ya puedes verla.",
                ),
            )
            .addTag(TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(PREFIX + t.id, ExistingWorkPolicy.REPLACE, request)
    }

    fun cancel(context: Context, titleId: String) {
        WorkManager.getInstance(context).cancelUniqueWork(PREFIX + titleId)
    }

    /** Every pending local notice (sign-out, or the server's push replaces them). */
    fun cancelAll(context: Context) {
        WorkManager.getInstance(context).cancelAllWorkByTag(TAG)
    }

    private fun debugDelay(context: Context): Duration? {
        if (!BuildConfig.DEBUG) return null
        val s = context.getSharedPreferences("com.tromwey.kura.debug", Context.MODE_PRIVATE)
            .getInt("kura.debug.releaseNoticeDelaySec", 0)
        return if (s > 0) Duration.ofSeconds(s.toLong()) else null
    }
}

/** Draws the notice (a tap opens the ficha, same `title:<id>` target as the remote push). */
class ReleaseNoticeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val id = inputData.getString(TITLE_ID) ?: return Result.success()
        // Registered since it was scheduled (and the cancel didn't reach it): the server sends it.
        if (PushRegistration(applicationContext).isRegistered) return Result.success()
        PushNotifications.show(
            applicationContext,
            id = (PREFIX_ID + id).hashCode(),
            title = inputData.getString(TITLE) ?: return Result.success(),
            body = inputData.getString(BODY),
            target = "title:$id",
        )
        return Result.success()
    }

    companion object {
        const val TITLE_ID = "titleId"
        const val TITLE = "title"
        const val BODY = "body"
        private const val PREFIX_ID = "release-"
    }
}
