package com.tromwey.kura.designsystem.components

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// Long lists INSIDE a page that already scrolls as one piece (`verticalScroll`: the collection under the
// carousel's fan, a profile's gradient page, the ficha). A `LazyColumn` can't live there — it would be a
// second vertical scroller inside the first, and those pages draw one gradient across the header and the
// rows — so the list is WINDOWED instead: it composes its first [WINDOW_PAGE] rows and grows by a page
// each time its end comes near the viewport. Rows already composed stay (it only ever grows): the cost
// that mattered is composing hundreds of covers at once on open, and that is gone. Rows are keyed by the
// caller (`key(id) { … }`), so growing or a reorder never recomposes the ones on screen.

/** Rows per page of a windowed list: ~2,000 dp of 72 dp rows, or 10 rows of a 3-column masonry. */
const val WINDOW_PAGE = 30

/** What a windowed list draws now ([visible]) and whether [WindowEnd] still has rows to bring. */
class KWindow<T> internal constructor(val visible: List<T>, val hasMore: Boolean, internal val limit: Int, internal val grow: () -> Unit)

/**
 * The window over [items]. The count survives leaving and coming back to the page (`rememberSaveable`),
 * so the page's saved scroll position still has its rows under it.
 */
@Composable
fun <T> rememberWindow(items: List<T>, page: Int = WINDOW_PAGE): KWindow<T> {
    val limit = rememberSaveable { mutableIntStateOf(page) }
    val n = limit.intValue
    return KWindow(if (items.size <= n) items else items.subList(0, n), items.size > n, n) { limit.intValue = n + page }
}

/** Goes right after a windowed list's rows: nothing while the window shows everything. */
@Composable
fun <T> WindowEnd(window: KWindow<T>) {
    if (!window.hasMore) return
    // Keyed by the limit: a fresh node per page, so it reports its position even when growing didn't move it.
    key(window.limit) { NearViewport(onNear = window.grow) }
}

/**
 * A 1 dp marker that calls [onNear] when it's placed within [ahead] below the window's bottom edge (or
 * anywhere above it). The page's scroll moves it, so it fires as the reader approaches. Key it by what
 * [onNear] advances (a cursor, a limit) when the answer may not move it.
 */
@Composable
fun NearViewport(modifier: Modifier = Modifier, ahead: Dp = 900.dp, onNear: () -> Unit) {
    val bottom = LocalWindowInfo.current.containerSize.height
    val aheadPx = with(LocalDensity.current) { ahead.roundToPx() }
    val call by rememberUpdatedState(onNear)
    Spacer(
        modifier.fillMaxWidth().height(1.dp).onGloballyPositioned { c ->
            if (c.isAttached && c.positionInWindow().y < bottom + aheadPx) call()
        },
    )
}
