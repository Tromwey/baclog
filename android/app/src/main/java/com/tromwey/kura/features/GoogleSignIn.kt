package com.tromwey.kura.features

import android.content.Context
import android.os.SystemClock
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.tromwey.kura.data.api.GoogleNonce
import com.tromwey.kura.data.api.KuraLog
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.GOOGLE_SILENT_CANCEL_MS
import com.tromwey.kura.state.GoogleCredential
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.googleFailureText
import com.tromwey.kura.state.showToast

/**
 * The ONE Credential Manager + Sign in with Google recipe (the entrance's "Continuar con Google" and
 * Ajustes › Inicio de sesión › Conectar / Fusionar both call it): an ID token whose `aud` is the server
 * client id (`auth/providers.google.androidClientId`, the web client), with Apple's nonce scheme
 * (API.md §2.2) — Google gets `sha256hex(nonce)` and copies it into the token's `nonce` claim; the
 * server gets the raw one, which `GoogleNonce` keeps for `LiveApi.signInWithGoogle` / `linkGoogle`.
 *
 * What comes back is the store's [GoogleCredential]; the caller says its own words for `NoAccount` and
 * `Failed`. A typed Credential Manager failure (a misconfigured client, no Play services, an interrupted
 * sheet) is logged with its type and told here with the store's words for it (`googleFailureText`), then
 * returned as `Cancelled` so the caller adds no second, vaguer toast.
 */
internal suspend fun googleCredential(context: Context, store: AppStore, clientId: String?): GoogleCredential {
    if (clientId == null) return GoogleCredential.Failed
    val nonce = GoogleNonce.make()
    val option = GetGoogleIdOption.Builder()
        .setServerClientId(clientId)
        .setFilterByAuthorizedAccounts(false)
        .setNonce(GoogleNonce.sha256(nonce))
        .build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val started = SystemClock.elapsedRealtime()
    return try {
        val credential = CredentialManager.create(context).getCredential(context, request).credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
            GoogleNonce.remember(nonce, token)
            GoogleCredential.Token(token)
        } else {
            GoogleCredential.Failed
        }
    } catch (e: GetCredentialCancellationException) {
        // Closing Google's sheet is not an error — but a "cancel" before any sheet could rise is Play
        // services saying there's no account on this phone (`googleFailureText`).
        val elapsed = SystemClock.elapsedRealtime() - started
        KuraLog.w("Google", "${e.type} en $elapsed ms: ${e.errorMessage}")
        if (elapsed < GOOGLE_SILENT_CANCEL_MS) GoogleCredential.NoAccount else GoogleCredential.Cancelled
    } catch (_: NoCredentialException) {
        GoogleCredential.NoAccount
    } catch (_: GoogleIdTokenParsingException) {
        GoogleCredential.Failed
    } catch (e: GetCredentialException) {
        val elapsed = SystemClock.elapsedRealtime() - started
        KuraLog.w("Google", "${e.type} en $elapsed ms: ${e.errorMessage}")
        store.googleFailureText(e.type, e.errorMessage?.toString(), elapsed)?.let { store.showToast(ToastModel(it, ToastModel.Kind.Info)) }
        GoogleCredential.Cancelled
    }
}
