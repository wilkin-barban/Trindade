package com.trindade.app.salida

import android.content.Context
import androidx.core.content.edit
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RuntimeEnvironment

@RunWith(AndroidJUnit4::class)
class SalidaOutboxStoreTest {

    private lateinit var context: Context
    private lateinit var store: SalidaOutboxStore

    private fun payload(code: String, quantity: Int, date: String = "2026-11-26") =
        SalidaErpPayload.payload(SalidaLine(code, quantity), date, "wilkin")!!

    @Before
    fun setUp() {
        context = RuntimeEnvironment.getApplication()
        context.getSharedPreferences("trindade_salida_outbox", Context.MODE_PRIVATE)
            .edit(commit = true) { clear() }
        store = SalidaOutboxStore(context)
    }

    @Test
    fun `saves and loads separate outboxes per movementId without overwriting`() {
        val first = SalidaOutbox(
            movementId = 12,
            date = "2026-11-26",
            trips = listOf(listOf(payload("1357", 2))),
        )
        val second = SalidaOutbox(
            movementId = 13,
            date = "2026-11-26",
            trips = listOf(listOf(payload("1356", 4))),
        )

        store.save(first)
        store.save(second)

        assertEquals(listOf("001357"), store.loadFor(12)?.pendingTrips?.flatten()?.map { it.PRO_COD })
        assertEquals(listOf("001356"), store.loadFor(13)?.pendingTrips?.flatten()?.map { it.PRO_COD })

        store.clearFor(12)
        assertNull(store.loadFor(12))
        assertNotNull(store.loadFor(13))
    }

    @Test
    fun `loadFor and clearFor remain compatible with legacy pending key`() {
        val legacy = SalidaOutbox(
            movementId = 9,
            date = "2026-11-25",
            trips = listOf(listOf(payload("1900", 1, "2026-11-25"))),
        )
        context.getSharedPreferences("trindade_salida_outbox", Context.MODE_PRIVATE)
            .edit(commit = true) { putString("pending", SalidaOutboxStore.encode(legacy)) }

        assertEquals(9, store.load()?.movementId)
        assertEquals(9, store.loadFor(9)?.movementId)
        assertNull(store.loadFor(10))

        store.clearFor(9)
        assertNull(store.loadFor(9))
        assertNull(store.load())
    }
}
