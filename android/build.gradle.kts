// Root build: only declares the plugins (applied in :app) and the parallel-lane build dir.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}

// Parallel lanes (see README › Carriles en paralelo): `-PkuraBuildDir=/abs/path` moves every
// project's build output under that path (root → <dir>/root, :app → <dir>/app) so several
// agents can compile the same checkout at once without sharing `build/`. Default: each
// project's own `build/`.
providers.gradleProperty("kuraBuildDir").orNull?.takeIf { it.isNotBlank() }?.let { dir ->
    allprojects {
        val leaf = if (this == rootProject) "root" else path.removePrefix(":").replace(':', '-')
        layout.buildDirectory.set(File(dir).resolve(leaf))
    }
}
