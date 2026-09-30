# Kura — R8 rules for release (minify + shrinkResources). Libraries ship most of their own
# consumer rules; these cover what they leave to the app.

# ── kotlinx.serialization ──────────────────────────────────────────────────────────────────
# Keep the generated serializers of every @Serializable class (companion `serializer()` and the
# `$$serializer` objects), so reflection-free lookups keep working after renaming.
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-dontnote kotlinx.serialization.**
-keepclassmembers @kotlinx.serialization.Serializable class ** {
    static ** Companion;
    *** Companion;
    static **$* *;
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembers class **$$serializer { *** INSTANCE; }
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1>$Companion {
    kotlinx.serialization.KSerializer serializer(...);
}
-if @kotlinx.serialization.Serializable class ** {
    static **$* *;
}
-keepclassmembers class <2>$<3> {
    kotlinx.serialization.KSerializer serializer(...);
}

# ── Ktor (OkHttp engine) ───────────────────────────────────────────────────────────────────
# Engine discovery goes through ServiceLoader; JVM-only diagnostics classes don't exist on Android.
-keep class io.ktor.client.engine.okhttp.OkHttpEngineContainer { *; }
-dontwarn io.ktor.**
-dontwarn java.lang.management.**
-dontwarn org.slf4j.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ── Coroutines ─────────────────────────────────────────────────────────────────────────────
-dontwarn kotlinx.coroutines.debug.**
