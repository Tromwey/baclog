package com.tromwey.kura.data

import java.io.File

/** The REAL responses captured from the local server (`app/src/test/resources/fixtures`, email and tokens stripped). */
object Fixtures {
    fun text(name: String): String {
        val url = Fixtures::class.java.getResource("/fixtures/$name.json") ?: error("falta la fixture $name.json")
        return url.readText()
    }

    fun names(): Set<String> {
        val dir = Fixtures::class.java.getResource("/fixtures") ?: error("sin carpeta de fixtures")
        return File(dir.toURI()).listFiles().orEmpty().filter { it.extension == "json" }.map { it.nameWithoutExtension }.toSet()
    }
}
