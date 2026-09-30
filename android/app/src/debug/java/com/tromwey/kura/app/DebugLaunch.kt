package com.tromwey.kura.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.util.Log
import com.tromwey.kura.data.SecureStore
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.data.models.WelcomeArt
import com.tromwey.kura.debug.DesignGallery
import com.tromwey.kura.state.AppPhase
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute

/**
 * DEBUG only (src/debug; the release twin in src/release does nothing). iOS `-kuraScreen`:
 *
 * ```
 * adb shell am start -S -n <appId>/com.tromwey.kura.MainActivity \
 *     [--es kuraBearer <jwt>] [--es kuraScreen <name>] [--es kuraEmail <correo>]
 * ```
 * (`-S` force-stops first: the store lives for the whole process, so a warm process would ignore both.)
 *
 * - `kuraPrintBearer true` (`--ez`): logs the current bearer, its `sid` and expiry (to reuse a session).
 * - `kuraBearer <jwt>`: writes that bearer to the Keystore session BEFORE the store exists, so the app
 *   starts signed in (skips the OTP). The splash then refreshes it if it expires within 7 days.
 * - `kuraScreen <name>` puts the REAL store (live API, no mock on Android yet) on a screen:
 *   - entrance: `splash` (held, doesn't route) · `onboarding` (13, welcome) · `signup` / `login` /
 *     `loginemail` (O1a "entra a kura." — one door, like iOS since f31effe) · `code` (O1c; the email
 *     shown is `kuraEmail`) · `username` (O1b) · `pick` (32a) · `people` (32b, picks = the welcome's three
 *     covers) · `underage` (13 años)
 *   - tabs (need a session, e.g. `kuraBearer`): `collections` · `discover` · `feed` · `profile` ·
 *     `settings` (Perfil › Ajustes, no dock) · `notifications` (Feed › la campana) · `toast`
 *     (Colecciones + an Undo toast over the dock) · `sheet` (Colecciones + the "Nueva colección" sheet)
 *   - a page by id (pushed over its tab, Volver pops to the root): `title:<id>` (Colecciones › ficha) ·
 *     `collection:<id>` (Colecciones › colección) · `person:<handle>` (Feed › perfil)
 *   - design system: `gallery` · `gallery-sheet` · `gallery-fan`
 * - States for captures (`--ez`, with any tab screen): `kuraEmptyFeed true` (nobody followed → E1 feed
 *   vacío) · `kuraEmptyLibrary true` (no collections → tus colecciones vacía) · `kuraKeepLoading true`
 *   (the launch never finishes → the skeletons).
 *
 * ONLY FROM `adb shell am start`: MainActivity is exported (App Links, notices), so on a debug build any
 * other app could otherwise hand it a bearer (sign the phone into someone else's account) or ask it to
 * print this one to logcat. Every extra here is ignored unless the launch came from the shell (or root)
 * — see [fromShell].
 */
object DebugLaunch {
    private const val TAG = "KuraDebugLaunch"

    /** `adb shell` runs as uid 2000 (`Process.SHELL_UID`); `adb root` as 0. */
    private const val ROOT_UID = 0
    private const val SHELL_PACKAGE = "com.android.shell"

    /**
     * Who launched the activity:
     * - `Activity.getLaunchedFromUid()` (API 34+) when the system shares it — it only does when the
     *   launcher opted in (`ActivityOptions.setShareIdentityEnabled`), which `am start` does NOT: then
     *   it's `Process.INVALID_UID` and we fall through.
     * - `getReferrer()` read WITHOUT the caller-set `EXTRA_REFERRER(_NAME)` extras (with them present
     *   it'd be the caller's claim, so we refuse) is the launching package the system recorded
     *   (`launchedFromPackage`, checked against the caller's uid); the shell's is `com.android.shell`.
     *   An approximation, and a debug-only one: release builds ignore every extra.
     */
    fun fromShell(activity: Activity): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val uid = activity.launchedFromUid
            if (uid != Process.INVALID_UID) return uid == Process.SHELL_UID || uid == ROOT_UID
        }
        val intent = activity.intent ?: return false
        if (intent.hasExtra(Intent.EXTRA_REFERRER) || intent.hasExtra(Intent.EXTRA_REFERRER_NAME)) return false
        val referrer: Uri = activity.referrer ?: return false
        return referrer.scheme == "android-app" && referrer.host == SHELL_PACKAGE
    }

    private fun hasDebugExtras(intent: Intent?): Boolean =
        intent != null && (intent.hasExtra("kuraBearer") || intent.hasExtra("kuraPrintBearer") || intent.hasExtra("kuraScreen"))

    /** The launch intent's debug extras, only when [fromShell]; otherwise null (and a warning). */
    private fun trusted(activity: Activity, intent: Intent?): Intent? {
        if (!hasDebugExtras(intent)) return intent
        if (fromShell(activity)) return intent
        Log.w(TAG, "extras de depuración ignorados: el lanzamiento no vino de adb shell")
        return null
    }

    fun seedSession(activity: Activity, intent: Intent?) {
        val jwt = trusted(activity, intent)?.getStringExtra("kuraBearer")?.trim()?.ifEmpty { null } ?: return
        SecureStore(activity).set(jwt)
        Log.i(TAG, "kuraBearer: session seeded")
    }

    fun configure(activity: Activity, store: AppStore, launchIntent: Intent?, firstLaunch: Boolean): LaunchOptions {
        val intent = trusted(activity, launchIntent)
        // `--ez kuraPrintBearer true`: logs this install's bearer ONCE (tag KuraDebugLaunch) so a session
        // made by hand can be handed to `kuraBearer` on another install. Debug only; clear logcat after.
        if (intent?.getBooleanExtra("kuraPrintBearer", false) == true) {
            Log.i(TAG, "bearer=${store.session.token ?: "none"} sid=${store.session.sid ?: "none"} exp=${store.session.expiry ?: "none"}")
        }
        val name = intent?.getStringExtra("kuraScreen") ?: return LaunchOptions.Normal
        when (name) {
            "gallery" -> return LaunchOptions(override = { DesignGallery() })
            "gallery-sheet" -> return LaunchOptions(override = { DesignGallery(openSheet = true) })
            "gallery-fan" -> return LaunchOptions(override = { DesignGallery(onlyCollections = true) })
        }
        // A recreated activity (rotation is locked, but font scale / theme recreate it) keeps the store as it is.
        if (!firstLaunch) return LaunchOptions.Normal

        fun entrance(step: OnboardingStep) {
            store.onboardingStep = step
            store.phase = AppPhase.Onboarding
        }

        fun main(tab: Tab = Tab.Collections, routes: List<Route> = emptyList()) {
            store.tab = tab
            store.paths = mapOf(tab to routes)
            store.phase = AppPhase.Main
        }

        // Capture states: read by `startIfNeeded` → `bootstrap` when the tabs first appear.
        store.debugEmptyFollowing = intent.getBooleanExtra("kuraEmptyFeed", false)
        store.emptyLibrary = intent.getBooleanExtra("kuraEmptyLibrary", false)
        store.keepLoading = intent.getBooleanExtra("kuraKeepLoading", false)

        // `title:<id>` · `collection:<id>` · `person:<handle>`: a page by id over its tab.
        val arg = name.substringAfter(':', "").trim()
        when {
            name.startsWith("title:") && arg.isNotEmpty() -> {
                main(Tab.Collections, listOf(Route.TitleRoute(arg)))
                return LaunchOptions.Normal
            }
            name.startsWith("collection:") && arg.isNotEmpty() -> {
                main(Tab.Collections, listOf(Route.Collection(arg)))
                return LaunchOptions.Normal
            }
            name.startsWith("person:") && arg.isNotEmpty() -> {
                main(Tab.Feed, listOf(Route.PersonRoute(arg.removePrefix("@"))))
                return LaunchOptions.Normal
            }
        }

        when (name) {
            "splash" -> return LaunchOptions(holdSplash = true)
            "onboarding" -> entrance(OnboardingStep.Welcome)
            "signup", "login", "loginemail" -> entrance(OnboardingStep.Signup)
            "code" -> {
                store.authEmail = intent.getStringExtra("kuraEmail") ?: "tu@correo.com"
                entrance(OnboardingStep.Code)
            }
            "username" -> entrance(OnboardingStep.Username)
            "pick" -> entrance(OnboardingStep.Pick)
            "people" -> {
                store.registerAll(WelcomeArt.titles)
                store.onboardingPicks = WelcomeArt.titles.map { it.id }
                entrance(OnboardingStep.People)
            }
            "underage" -> entrance(OnboardingStep.Underage)
            "collections" -> main(Tab.Collections)
            "discover" -> main(Tab.Discover)
            "feed" -> main(Tab.Feed)
            "profile" -> main(Tab.Profile)
            "settings" -> main(Tab.Profile, listOf(Route.Settings))
            "notifications" -> main(Tab.Feed, listOf(Route.Notifications))
            "toast" -> {
                main()
                store.pendingAction = { store.undoToast("Aviso de prueba") {} }
            }
            "sheet" -> {
                main()
                store.pendingSheet = SheetRoute.NewCollection(addingTitleId = null)
            }
            else -> return LaunchOptions(override = { DesignGallery(unknown = name) })
        }
        return LaunchOptions.Normal
    }
}
