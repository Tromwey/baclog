package com.tromwey.kura.data

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.ProviderException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Where the bearer lives. `SecureStore` on the device; `InMemoryTokenStore` for tests and the mock. */
interface TokenStore {
    fun get(): String?
    fun set(value: String)
    fun clear()
}

class InMemoryTokenStore(private var value: String? = null) : TokenStore {
    @Synchronized override fun get() = value
    @Synchronized override fun set(value: String) { this.value = value }
    @Synchronized override fun clear() { value = null }
}

/**
 * The bearer, encrypted at rest — the Android twin of the iOS Keychain item (service
 * `com.tromwey.kura`, account `bearer`). AES-256-GCM with a key that never leaves the Android
 * Keystore (alias `com.tromwey.kura.bearer`); the ciphertext (`iv:ct`, Base64) sits in private
 * `SharedPreferences`. Never plain prefs, never `EncryptedSharedPreferences` (deprecated).
 *
 * No backup and no device transfer (`allowBackup=false` + `data_extraction_rules.xml`), and the
 * Keystore key dies with the app: unlike iOS, a reinstall can't resurrect an old bearer, so there
 * is no `InstallMarker` here. A value that no longer decrypts (key invalidated, data corrupted) is
 * dropped and logged — the person just signs in again.
 */
class SecureStore(context: Context, private val slot: String = KEY) : TokenStore {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private var cached: String? = null
    private var loaded = false

    @Synchronized
    override fun get(): String? {
        if (!loaded) {
            cached = prefs.getString(slot, null)?.let(::decrypt)
            loaded = true
        }
        return cached
    }

    @Synchronized
    override fun set(value: String) {
        val sealed = try {
            encrypt(value)
        } catch (e: Exception) {
            if (!isKeystoreFailure(e)) throw e
            // Never fall back to plaintext: without the Keystore the value lives in memory only.
            Log.e(TAG, "No se pudo cifrar [$slot]; no se guarda en disco (${e.javaClass.simpleName})")
            prefs.edit().remove(slot).apply()
            cached = value; loaded = true
            return
        }
        prefs.edit().putString(slot, sealed).apply()
        cached = value
        loaded = true
    }

    @Synchronized
    override fun clear() {
        prefs.edit().remove(slot).apply()
        cached = null
        loaded = true
    }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return gen.generateKey()
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return b64(cipher.iv) + ":" + b64(ct)
    }

    private fun decrypt(sealed: String): String? {
        val parts = sealed.split(":")
        return try {
            require(parts.size == 2) { "formato" }
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, unb64(parts[0])))
            String(cipher.doFinal(unb64(parts[1])), Charsets.UTF_8)
        } catch (e: Exception) {
            if (!isKeystoreFailure(e) && e !is IllegalArgumentException) throw e
            dropUnreadable(e)
        }
    }

    private fun dropUnreadable(e: Exception): String? {
        Log.w(TAG, "El valor guardado [$slot] ya no se puede descifrar; se descarta (${e.javaClass.simpleName})")
        prefs.edit().remove(slot).apply()
        return null
    }

    /** What the Keystore throws when it can't serve: a crypto error, a keystore daemon failure
     *  (`ProviderException`, unchecked) or the keystore file unreadable (`IOException` from `load`). */
    private fun isKeystoreFailure(e: Exception) =
        e is GeneralSecurityException || e is ProviderException || e is IOException

    private fun b64(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)
    private fun unb64(s: String) = Base64.decode(s, Base64.NO_WRAP)

    private companion object {
        const val TAG = "KuraSecureStore"
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "com.tromwey.kura.bearer"
        const val PREFS = "com.tromwey.kura.secure"
        /** The bearer's slot (the default); other slots share the key and the file. */
        const val KEY = "bearer"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
