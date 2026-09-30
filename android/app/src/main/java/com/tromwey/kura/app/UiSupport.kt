package com.tromwey.kura.app

import com.tromwey.kura.BuildConfig
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.KuraRuntime
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.designsystem.components.CoverArt
import com.tromwey.kura.designsystem.components.CoverShape
import com.tromwey.kura.state.StoreHaptic
import java.net.URI

// Small bridges every screen lane needs between `data/`·`state/` and the design system (which never
// depends on `data/`). One recipe per concept: use these, don't re-map at the call site.

/** What the design system draws for a title: 2:3 poster (film, series) or 1:1 record (album). */
val Title.art: CoverArt
    get() = CoverArt(
        id = id,
        name = name,
        url = coverUrl,
        palette = palette,
        shape = if (format == MediaFormat.Album) CoverShape.Album else CoverShape.Poster,
    )

/** A person's profile photo for `Seal(photo = …)`: `avatarUrl` resolved against the API origin
 *  (it may come relative, `/api/avatar/{key}`); the app's image loader adds the bearer there. */
val Person.photo: String? get() = KuraRuntime.resolve(avatarUrl)

/**
 * Headline + note for a screen whose read failed (iOS `KuraAPIError.loadCopy`). Kura voice: what
 * happened and what to do, lowercase headline with a period, no wink (it's our failure).
 * Pair it with `LoadErrorBlock(title, note, onRetry)` / `LoadErrorScreen`.
 */
val KuraApiError.loadCopy: Pair<String, String>
    get() = when (this) {
        KuraApiError.Offline -> "sin conexión." to "Revisa tu red y vuelve a intentarlo."
        KuraApiError.Unavailable -> "no disponible por ahora." to "El catálogo no responde. Inténtalo de nuevo en un momento."
        is KuraApiError.RateLimited -> "un momento." to "Fueron muchas acciones seguidas. Espera unos segundos y vuelve a intentarlo."
        else -> "no se pudo cargar." to "Algo falló de nuestro lado. Vuelve a intentarlo."
    }

/** The store's haptic cases → the design system's events (iOS `KHaptic.Event.reaction`). */
val StoreHaptic.event: KHapticEvent?
    get() = when (this) {
        StoreHaptic.Tap -> KHapticEvent.Tap
        StoreHaptic.Selection -> KHapticEvent.Selection
        StoreHaptic.Success -> KHapticEvent.Success
        StoreHaptic.Error -> KHapticEvent.Error
        is StoreHaptic.Reaction -> when (mark) {
            Mark.Obsessed -> KHapticEvent.Firm
            Mark.Liked, Mark.Completed -> KHapticEvent.Tap
            null -> null
        }
    }

/** The public host as people read it ("get-kura.app"): from `BuildConfig.SITE_URL`, never spelled out. */
val siteHost: String by lazy {
    try {
        URI(BuildConfig.SITE_URL).host ?: BuildConfig.SITE_URL
    } catch (_: IllegalArgumentException) {
        BuildConfig.SITE_URL
    }
}
