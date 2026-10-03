package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.api.MePatch
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.Person
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

// Your profile: release alerts, Editar perfil, the photo, borrar la cuenta and the ribbon counters —
// twin of `AppStore+Profile.swift`.

fun AppStore.toggleAlert(titleId: String) {
    if (titleId in alerts) {
        s.alerts = s.alerts - titleId
    } else {
        s.alerts = s.alerts + titleId
        haptic(StoreHaptic.Tap)
    }
    saveLocal()
}

/** 20f · Editar perfil: name via `PATCH /me`, handle via `PUT /me/username` (409 → "ya está tomado");
 *  featured obsession and "en común" stay local. */
fun AppStore.saveProfile(name: String, handle: String, featured: String?, isPrivate: Boolean, showCommon: Boolean) {
    val cleanName = name.trim().lowercase()
    val cleanHandle = handle.lowercase().filter { it.isLetter() || it.isDigit() || it == '.' || it == '_' }
    val oldName = me.name
    val oldInitials = me.initials
    val oldHandle = me.handle
    var updated = me
    if (cleanName.isNotEmpty()) updated = updated.copy(name = cleanName, initials = Person.initials(cleanName))
    if (featured != null) {
        updated = updated.copy(featuredTitleId = featured)
        s.titles[featured]?.let { t -> updated = updated.copy(hexes = t.palette) }
    }
    val newHandle = cleanHandle.ifEmpty { oldHandle }
    val handleChanged = newHandle != oldHandle
    if (handleChanged) {
        updated = rehandled(updated, newHandle)
        s.people = s.people - oldHandle
    }
    me = updated
    if (me.id.isNotEmpty()) s.people = s.people + (me.id to me)
    profilePrivate = isPrivate
    this.showCommon = showCommon
    saveLocal()
    if (cleanName.isNotEmpty() && cleanName != oldName) {
        patchSetting(MePatch(name = cleanName), "No se pudo cambiar tu nombre.",
            stillMine = { me.name == cleanName },
            revert = {
                me = me.copy(name = oldName, initials = oldInitials)
                if (me.id.isNotEmpty()) s.people = s.people + (me.id to me)
            })
    }
    if (handleChanged) claimHandle(newHandle, oldHandle)
    showToast(ToastModel("Perfil actualizado", ToastModel.Kind.Info))
}

/** `PUT /me/username`. On ANY failure the app goes back to the old @ (the server kept it). Taken /
 *  rejected says why; anything else offers Reintentar (puts the new @ back and sends it again). */
private fun AppStore.claimHandle(newHandle: String, oldHandle: String) {
    val session = s
    sync(key = AppStore.WriteKey.USERNAME, onError = err@{ e ->
        revertHandle(newHandle, oldHandle)
        val text = when (e) {
            KuraApiError.Unauthorized -> return@err true
            is KuraApiError.Conflict -> "@$newHandle ya está tomado"
            is KuraApiError.Invalid -> e.fields["username"] ?: e.message.ifEmpty { "Ese @ no se puede usar" }
            KuraApiError.NotFound, KuraApiError.Unsupported -> e.toast
            else -> {
                retryToast(e.toast("No se pudo cambiar tu @"), AppStore.WriteKey.USERNAME) {
                    if (me.handle != oldHandle) return@retryToast
                    dismissToast()
                    applyHandle(newHandle, oldHandle)
                    claimHandle(newHandle, oldHandle)
                }
                return@err true
            }
        }
        showToast(ToastModel(text, ToastModel.Kind.Info))
        true
    }) { api ->
        val m = api.claimUsername(newHandle)
        on(session) { account = m }
    }
}

/** `me` (and its `people` entry) under the new handle, optimistically. */
private fun AppStore.applyHandle(newHandle: String, oldHandle: String) {
    me = rehandled(me, newHandle)
    s.people = s.people - oldHandle
    if (me.id.isNotEmpty()) s.people = s.people + (me.id to me)
}

/** The same person under another handle (`Person.handle` is its identity). */
private fun rehandled(p: Person, handle: String): Person = Person(
    handle = handle, name = p.name, initials = p.initials, hexes = p.hexes, featuredTitleId = p.featuredTitleId,
    isPrivate = p.isPrivate, followers = p.followers, followingCount = p.followingCount, stats = p.stats,
    avatarUrl = p.avatarUrl,
)

/** `PUT /me/username` failed: `me` and `people` go back to the old handle (the rest of the edit stays). */
private fun AppStore.revertHandle(newHandle: String, oldHandle: String) {
    if (me.handle != newHandle) return
    me = rehandled(me, oldHandle)
    s.people = s.people - newHandle
    if (oldHandle.isNotEmpty()) s.people = s.people + (oldHandle to me)
}

/**
 * 20f · Cambiar foto: `jpeg` is the photo already cropped square, ≤ 512 px and ≤ 400 KB ON THE DEVICE
 * (`AvatarEncoder.encode`; the server only re-checks size and sniffs magic bytes, AGENTS.md F3.11).
 * `null` = the picked image couldn't be read.
 */
suspend fun AppStore.uploadAvatar(jpeg: ByteArray?) {
    if (s.avatarBusy) return
    if (jpeg == null) {
        showToast(ToastModel("No se pudo usar esa foto. Prueba con otra.", ToastModel.Kind.Info))
        return
    }
    val session = s
    session.avatarBusy = true
    try {
        when (val r = boundWrite { api.uploadAvatar(jpeg, "image/jpeg") }) {
            BoundWrite.Stale -> return
            is BoundWrite.Ok -> {
                adoptAvatar(r.value)
                showToast(ToastModel("Foto actualizada", ToastModel.Kind.Info))
            }
            is BoundWrite.Failed -> {
                val e = r.error
                if (e == KuraApiError.Unauthorized) return
                val text = when {
                    e is KuraApiError.Invalid && e.message.isNotEmpty() -> e.message
                    e == KuraApiError.Offline -> "Sin conexión. La foto no se subió."
                    else -> "No se pudo subir la foto"
                }
                showToast(ToastModel(text, ToastModel.Kind.Retry) { scope.launch { uploadAvatar(jpeg) } })
            }
        }
    } finally {
        session.avatarBusy = false
    }
}

/** Only the photo changes: `applyMe` would replace `me` whole and undo a local featured/tint or a
 *  name PATCH still in flight. */
private fun AppStore.adoptAvatar(m: Me) {
    account = m
    me = me.copy(avatarUrl = m.avatarUrl)
    if (me.id.isNotEmpty()) s.people[me.id]?.let { p -> s.people = s.people + (me.id to p.copy(avatarUrl = m.avatarUrl)) }
}

suspend fun AppStore.removeAvatar() {
    if (s.avatarBusy || me.avatarUrl == null) return
    val session = s
    session.avatarBusy = true
    try {
        when (val r = boundWrite { api.deleteAvatar() }) {
            BoundWrite.Stale -> return
            is BoundWrite.Ok -> {
                adoptAvatar(r.value)
                showToast(ToastModel("Foto quitada", ToastModel.Kind.Info))
            }
            is BoundWrite.Failed -> {
                if (r.error == KuraApiError.Unauthorized) return
                showToast(ToastModel(r.error.toast("No se pudo quitar la foto"), ToastModel.Kind.Retry) {
                    scope.launch { removeAvatar() }
                })
            }
        }
    } finally {
        session.avatarBusy = false
    }
}

/** C3 · the second irreversible action (typing your @ confirms it). Only a 204 confirms the deletion;
 *  a 401 is a revoked bearer on an account still ALIVE — never "Tu cuenta se borró.". */
fun AppStore.deleteAccount() {
    val session = s
    scope.launch {
        try {
            api.deleteAccount()
            if (s !== session) return@launch
        } catch (err: Exception) {
            if (s !== session || err is CancellationException) return@launch
            when (val e = err as? KuraApiError ?: KuraApiError.Server(err.toString())) {
                KuraApiError.Unauthorized -> {
                    api.forgetSession()
                    sessionExpired("Tu sesión terminó. Entra de nuevo para borrar tu cuenta.")
                }
                else -> {
                    if (e == KuraApiError.Offline) offline = true
                    val text = if (e == KuraApiError.Offline) "Sin conexión. Tu cuenta sigue aquí." else "No se pudo borrar tu cuenta"
                    showToast(ToastModel(text, ToastModel.Kind.Retry) { deleteAccount() })
                }
            }
            return@launch
        }
        // After a 204: forget the token and everything local. No `auth/logout`: nothing left to revoke.
        api.forgetSession()
        leaveSession("Tu cuenta se borró.")
    }
}

// MARK: Counters (profile ribbon)

fun AppStore.count(mark: Mark): Int = userTitles.values.count { it.mark == mark }
