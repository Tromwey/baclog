package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Mark
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Marks, reviews with Deshacer, follow / unfollow. */
@OptIn(ExperimentalCoroutinesApi::class)
class ReactionsSocialTest {
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be" // in the library, no mark

    private fun AppStore.tapToast() = tapToastAction(toast!!)

    @Test fun markIsOptimisticAndANotReleasedRefusalRevertsIt() = storeTest { h ->
        val store = h.store
        signedIn(h)
        assertNull(store.mark(yhlq))
        store.setMark(yhlq, Mark.Obsessed)
        assertEquals(Mark.Obsessed, store.mark(yhlq)) // before the server answered
        runCurrent()
        assertEquals(listOf("setMark $yhlq obsessed false"), h.api.callsOf("setMark"))
        assertEquals(Mark.Obsessed, store.mark(yhlq))

        h.api.failNext("setMark", KuraApiError.Conflict("not_released", ""))
        store.setMark(yhlq, Mark.Completed)
        assertEquals(Mark.Completed, store.mark(yhlq))
        runCurrent()
        assertEquals("vuelve a la marca de antes", Mark.Obsessed, store.mark(yhlq))
        assertEquals("Todavía no sale. Usa La vi en preestreno.", store.toast?.text)
        assertEquals(ToastModel.Kind.Info, store.toast?.kind)
    }

    @Test fun aMarkOnATitleOutsideTheLibraryThatFailsLeavesNoTrace() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.failNext("setMark", KuraApiError.NotFound)
        store.setMark("desconocido", Mark.Liked)
        assertNotNull(store.userTitles["desconocido"])
        runCurrent()
        assertNull(store.userTitles["desconocido"])
        assertEquals(AppStore.UNKNOWN_TITLE_NOTE, store.toast?.text)
    }

    @Test fun completeConfirmedReturnsTheErrorAndReverts() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.failNext("setMark", KuraApiError.Offline)
        val e = store.setMarkConfirmed(yhlq, Mark.Completed, preview = false)
        assertEquals(KuraApiError.Offline, e)
        assertNull(store.mark(yhlq))
        assertTrue(store.offline)
        assertNull("sin error la hoja manda la reseña", store.setMarkConfirmed(yhlq, Mark.Liked, preview = false))
        assertEquals(Mark.Liked, store.mark(yhlq))
        assertFalse(store.offline)
    }

    @Test fun reviewPublishesThenDeleteAndUndoBringsItBack() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.setMark(yhlq, Mark.Liked)
        store.publishReview(yhlq, "  un disco que no se acaba  ", spoiler = false)
        val local = store.myReview(yhlq)!!
        assertTrue(local.id.startsWith("r-"))
        assertEquals("un disco que no se acaba", local.text)
        runCurrent()
        assertEquals("srv-review", store.myReview(yhlq)!!.id)
        assertEquals("srv-review", store.userTitles[yhlq]!!.reviewId)

        store.deleteReview(yhlq)
        assertNull(store.myReview(yhlq))
        runCurrent()
        store.tapToast()
        assertEquals("un disco que no se acaba", store.myReview(yhlq)!!.text)
        runCurrent()
        // DELETE, then the review written again — in that order (same WriteKey).
        val del = h.api.calls.indexOf("deleteReview $yhlq")
        val again = h.api.calls.lastIndexOf("saveReview $yhlq un disco que no se acaba")
        assertTrue(del in 0 until again)
    }

    @Test fun aReviewWithoutReactionIsRefusedWithTheRealRule() = storeTest { h ->
        val store = h.store
        signedIn(h)
        // The phone has a reaction and the server doesn't (taken off elsewhere): the server's rule wins.
        // (Without one on the phone nothing is even sent: `AuditRound7Test`.)
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        h.api.failNext("saveReview", KuraApiError.Conflict("reaction_required", ""))
        store.publishReview(yhlq, "sin reacción", spoiler = true)
        assertNotNull(store.myReview(yhlq))
        runCurrent()
        assertNull(store.myReview(yhlq))
        assertEquals("Para reseñar, elige Me gusta o Me obsesiona", store.toast?.text)
        assertEquals(ToastModel.Kind.Info, store.toast?.kind)
    }

    @Test fun followThenUnfollowWithUndoInOrder() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.loadPerson("nueva")
        val followers = store.person("nueva")!!.followers
        val count = store.me.followingCount
        assertFalse(store.isFollowing("nueva"))

        store.toggleFollow("nueva")
        assertTrue(store.isFollowing("nueva"))
        assertEquals(followers + 1, store.person("nueva")!!.followers)
        assertEquals(count + 1, store.me.followingCount)
        runCurrent()

        store.followFromProfile("nueva") // Siguiendo → unfollow at once, with Deshacer
        assertFalse(store.isFollowing("nueva"))
        assertEquals("Dejaste de seguir a @nueva", store.toast?.text)
        store.tapToast()
        assertTrue(store.isFollowing("nueva"))
        runCurrent()
        assertEquals(
            listOf("setFollowing nueva true", "setFollowing nueva false", "setFollowing nueva true"),
            h.api.callsOf("setFollowing"),
        )
        assertEquals(followers + 1, store.person("nueva")!!.followers)
    }

    @Test fun aFailedFollowRevertsAndRetryFollowsForReal() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.loadPerson("nueva")
        val count = store.me.followingCount
        h.api.failNext("setFollowing", KuraApiError.Server("500"))
        store.toggleFollow("nueva")
        runCurrent()
        assertFalse(store.isFollowing("nueva"))
        assertEquals(count, store.me.followingCount)
        assertEquals("No se pudo seguir a @nueva", store.toast?.text)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        store.tapToast()
        assertTrue(store.isFollowing("nueva"))
        runCurrent()
        assertTrue(store.isFollowing("nueva"))
        assertEquals(2, h.api.callsOf("setFollowing").size)
    }

    @Test fun blockMirrorsTheServerOnlyAfterItAnswered() = storeTest { h ->
        val store = h.store
        signedIn(h)
        assertTrue(store.isFollowing("qa_persona_06"))
        h.api.failNext("block", KuraApiError.Offline)
        assertFalse(store.block("qa_persona_06"))
        assertTrue("sin 204 no cambia nada", store.isFollowing("qa_persona_06"))
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        assertTrue(store.block("qa_persona_06"))
        assertFalse(store.isFollowing("qa_persona_06"))
        assertTrue(store.isBlocked("qa_persona_06"))
        assertEquals("Bloqueaste a @qa_persona_06", store.toast?.text)
    }
}
