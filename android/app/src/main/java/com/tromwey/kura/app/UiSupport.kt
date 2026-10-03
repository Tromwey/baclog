package com.tromwey.kura.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
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
import com.tromwey.kura.designsystem.components.KuraReaction
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.StoreHaptic
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.showToast
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
        KuraApiError.Unavailable -> "el catálogo no responde." to "Vuelve a intentarlo en unos minutos."
        is KuraApiError.RateLimited -> "un momento." to "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
        else -> "no pudimos cargar esto." to "Algo falló de nuestro lado. Vuelve a intentarlo."
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

/** A mark as the reaction group draws it (`ReactionGroup`): Solo completo / Me gusta / Me obsesiona. */
val Mark.reaction: KuraReaction
    get() = when (this) {
        Mark.Liked -> KuraReaction.Liked
        Mark.Obsessed -> KuraReaction.Obsessed
        Mark.Completed -> KuraReaction.Completed
    }

/** The reaction group's choice back as the store's [Mark]. */
val KuraReaction.mark: Mark
    get() = when (this) {
        KuraReaction.Liked -> Mark.Liked
        KuraReaction.Obsessed -> Mark.Obsessed
        KuraReaction.Completed -> Mark.Completed
    }

/** The public host as people read it ("get-kura.app"): from `BuildConfig.SITE_URL`, never spelled out. */
val siteHost: String by lazy {
    try {
        URI(BuildConfig.SITE_URL).host ?: BuildConfig.SITE_URL
    } catch (_: IllegalArgumentException) {
        BuildConfig.SITE_URL
    }
}

// MARK: Leaving the app (one recipe each: never a raw `startActivity` in a screen)

/**
 * Opens a web link outside the app (the browser, or the app that owns it). ONLY `https` with a host:
 * anything else — `intent:`, `file:`, `content:`, `javascript:`, a custom scheme that came in a payload —
 * is refused. The one exception is a DEBUG build opening `http` on its own API origin (the dev server
 * at `10.0.2.2`, whose links the server builds from its own host). false = nothing opened (a refused
 * link, no browser, a handler that refused). Screens call [AppStore.openLink], which says so.
 */
fun openUrl(context: Context, url: String?): Boolean {
    val uri = url?.trim()?.takeIf { it.isNotEmpty() }?.let(Uri::parse) ?: return false
    if (!isOpenable(uri.scheme, uri.host, uri.port, BuildConfig.DEBUG, KuraRuntime.apiOrigin)) return false
    return startOutside(context, Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
}

/** The rule of [openUrl], without Android (the tests pin it down). */
internal fun isOpenable(scheme: String?, host: String?, port: Int, debug: Boolean, apiOrigin: String?): Boolean {
    if (host.isNullOrEmpty()) return false
    if (scheme.equals("https", ignoreCase = true)) return true
    if (!debug || !scheme.equals("http", ignoreCase = true)) return false
    val dev = try { apiOrigin?.let { URI.create(it) } } catch (_: IllegalArgumentException) { null } ?: return false
    return dev.scheme.equals("http", ignoreCase = true) && dev.host.equals(host, ignoreCase = true) && dev.port == port
}

/** [openUrl] for a screen: when nothing opened, the person is told (the row would otherwise just not react). */
fun AppStore.openLink(context: Context, url: String?): Boolean {
    val ok = openUrl(context, url)
    if (!ok) showToast(ToastModel("No se pudo abrir el enlace", ToastModel.Kind.Info))
    return ok
}

/** The system share sheet with [text] (a public link, or a line with one). false = nothing can share it. */
fun shareText(context: Context, text: String, subject: String? = null): Boolean {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
    if (subject != null) send.putExtra(Intent.EXTRA_SUBJECT, subject).putExtra(Intent.EXTRA_TITLE, subject)
    return shareIntent(context, send)
}

/** The system share sheet for an `ACTION_SEND` built by the caller (an image: the recap card). */
fun shareIntent(context: Context, send: Intent): Boolean = startOutside(context, Intent.createChooser(send, null))

private fun startOutside(context: Context, intent: Intent): Boolean {
    if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        context.startActivity(intent)
        true
    } catch (_: ActivityNotFoundException) {
        false
    } catch (_: SecurityException) {
        // A handler that isn't exported to us, or a URI grant the target can't take.
        false
    }
}
