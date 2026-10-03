package com.tromwey.kura.features

import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.dismissSheet

/**
 * A write started from a sheet (Enviar reporte, Bloquear, Desconectar, Salir de la fiesta…): it runs
 * on the STORE's scope, never on the sheet's `rememberCoroutineScope`, so nothing the sheet does to
 * itself (a drag, a remount, leaving composition) can cancel it half-way and strand `sheetLocked`.
 *
 * The sheet is locked while it runs — [AppStore.sheetLocked] is also the buttons' "busy", so a
 * remounted sheet still reads "Enviando…". [block] answers whether the sheet should close (`true`
 * after a write that always leaves, the store's own `Boolean` "it worked" where a failure keeps the
 * sheet up to try again). When it ends — however it ends, an exception included — the lock lifts and
 * the sheet closes if asked, but only if that same sheet is still up: one presented meanwhile has
 * its own lock (`present` resets it) and stays.
 */
fun AppStore.sheetWrite(block: suspend () -> Boolean) {
    val route = sheet
    sheetLocked = true
    launch {
        var close = false
        try {
            close = block()
        } finally {
            if (sheet == route) {
                sheetLocked = false
                if (close) dismissSheet()
            }
        }
    }
}
