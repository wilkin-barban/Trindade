package com.trindade.app.aero

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * La cola de lo que la planta todavía no tiene.
 *
 * Cada caso es una forma en la que el trabajo pendiente se pierde o se duplica: una cola vieja que dispara en el
 * turno siguiente, un producto con una cantidad inventada, un lote que abre más de ocho pestañas, un reintento
 * que encola dos veces la misma caja.
 */
class AeroQueueTest {

    private fun item(
        launchId: Int = 7,
        code: String = "001045",
        quantity: Double = 30.0,
        date: String = "2026-02-10",
    ) = AeroQueueItem(
        productCode = code,
        productName = "MASSA CASEIRA",
        quantity = quantity,
        operatorName = "JAIME",
        launchIds = listOf(launchId),
        date = date,
    )

    @Test
    fun `una cola guardada se lee igual después de cerrar la app`() {
        val now = 1_700_000_000_000L
        val queue = AeroQueue(createdAt = now, date = "2026-02-10", items = listOf(item(), item(8, "001046")))

        val read = readAeroQueue(encodeAeroQueue(queue), now + 60_000)

        assertNotNull(read)
        assertEquals(listOf(7, 8), read!!.items.flatMap { it.launchIds })
        assertEquals("001046", read.items[1].productCode)
        assertEquals(30.0, read.items[0].quantity, 0.0)
    }

    @Test
    fun `una cola de ayer no dispara en el turno de hoy`() {
        val now = 1_700_000_000_000L
        val queue = AeroQueue(createdAt = now, date = "2026-02-10", items = listOf(item()))

        // Ocho horas es el turno; un minuto más y lo que queda es basura, no trabajo.
        assertNotNull(readAeroQueue(encodeAeroQueue(queue), now + AERO_QUEUE_TTL_MS))
        assertNull(readAeroQueue(encodeAeroQueue(queue), now + AERO_QUEUE_TTL_MS + 60_000))
    }

    @Test
    fun `un reloj que salta para atrás no hace disparar una cola`() {
        // Un teléfono con la hora cambiada no puede convertir un pendiente en trabajo eterno: una marca futura es
        // una marca que no se entiende, y lo que no se entiende no se manda.
        val now = 1_700_000_000_000L
        val queue = AeroQueue(createdAt = now, date = "2026-02-10", items = listOf(item()))

        assertNull(readAeroQueue(encodeAeroQueue(queue), now - 60_000))
    }

    @Test
    fun `una entrada sin cantidad no se manda`() {
        // Ni siquiera entra: una cantidad inventada se convierte en un asiento que la fábrica no puede
        // conciliar, y una sola entrada rota haría fallar la escritura de todo el lote.
        val queue = AeroQueue(createdAt = 1_700_000_000_000L, date = "2026-02-10")
            .enqueue(item())
            .enqueue(item(9, quantity = 0.0))
            .enqueue(item(10, code = ""))
            .enqueue(item(11, quantity = Double.NaN))

        assertEquals("solo la entrada completa sobrevive", listOf(7), queue.items.flatMap { it.launchIds })
        assertEquals(listOf(7), readAeroQueue(encodeAeroQueue(queue), 1_700_000_000_000L)!!.items.flatMap { it.launchIds })
    }

    @Test
    fun `una cola sin nada válido se lee como vacía`() {
        val now = 1_700_000_000_000L
        val queue = AeroQueue(createdAt = now, date = "2026-02-10", items = listOf(item(quantity = -1.0)))

        assertNull(readAeroQueue(encodeAeroQueue(queue), now))
    }

    @Test
    fun `un texto que no es una cola se descarta en vez de repararse`() {
        assertNull(readAeroQueue("{}"))
        assertNull(readAeroQueue("no es json"))
        assertNull(readAeroQueue(""))
        assertNull(readAeroQueue(null))
    }

    /**
     * Una cola vencida no es lo mismo que no tener nada pendiente.
     *
     * El store la borraba y devolvía null, que el teléfono leía como "no hay trabajo": la caja que la planta
     * nunca vio desaparecía del registro y del log a la vez. La lectura tiene que decir qué se descartó y por
     * qué, con los lanzamientos que se pierden, para que quede una línea.
     */
    @Test
    fun `una cola vencida se descarta diciendo qué llevaba`() {
        val now = 1_700_000_000_000L
        val queue = AeroQueue(createdAt = now, date = "2026-02-10", items = listOf(item(7), item(8, "001046")))

        val read = readAeroQueueResult(encodeAeroQueue(queue), now + AERO_QUEUE_TTL_MS + 60_000)

        val rejected = read as AeroQueueRead.Rejected
        assertEquals(AeroQueueRejection.EXPIRED, rejected.reason)
        assertEquals("2026-02-10", rejected.date)
        assertEquals(listOf(7, 8), rejected.items.flatMap { it.launchIds })
    }

    @Test
    fun `un texto que no es una cola se descarta como malformado, no como vacío`() {
        val malformed = readAeroQueueResult("no es json", 1_700_000_000_000L)

        assertEquals(AeroQueueRejection.MALFORMED, (malformed as AeroQueueRead.Rejected).reason)
        assertTrue(malformed.items.isEmpty())
    }

    @Test
    fun `una cola fresca se entrega como pendiente`() {
        val now = 1_700_000_000_000L
        val queue = AeroQueue(createdAt = now, date = "2026-02-10", items = listOf(item()))

        val read = readAeroQueueResult(encodeAeroQueue(queue), now + 60_000)

        assertEquals(queue, (read as AeroQueueRead.Pending).queue)
    }

    @Test
    fun `sin nada guardado no hay rechazo que registrar`() {
        assertEquals(AeroQueueRead.Empty, readAeroQueueResult(null, 1_700_000_000_000L))
        assertEquals(AeroQueueRead.Empty, readAeroQueueResult("", 1_700_000_000_000L))
    }

    @Test
    fun `un lote viaja de a ocho y el resto queda esperando`() {
        val now = 1_700_000_000_000L
        val queue = AeroQueue(
            createdAt = now,
            date = "2026-02-10",
            items = (1..10).map { item(it) },
        )

        val (batch, rest) = queue.takeBatch()

        assertEquals(AERO_QUEUE_BATCH, batch.size)
        assertEquals(listOf(1, 2, 3, 4, 5, 6, 7, 8), batch.flatMap { it.launchIds })
        assertEquals(listOf(9, 10), rest.items.flatMap { it.launchIds })
    }

    @Test
    fun `veinte pendientes se drenan en tres tandas de ocho, ocho y cuatro`() {
        // La cola se drena entera al abrir el día: una sola tanda dejaba dieciséis asientos esperando al
        // próximo arranque de la app, y el operario que ya volvió al Wi-Fi de la planta los veía pendientes.
        val queue = AeroQueue(
            createdAt = 1_700_000_000_000L,
            date = "2026-02-10",
            items = (1..20).map { item(it) },
        )

        assertEquals(listOf(8, 8, 4), queue.drainBatches().map { it.size })
        assertEquals((1..20).toList(), queue.drainBatches().flatten().flatMap { it.launchIds })
    }

    @Test
    fun `una cola vacía no produce ninguna tanda`() {
        // Sin esto el drenaje devolvería una tanda vacía y el envío contaría un viaje que nunca ocurrió.
        val queue = AeroQueue(createdAt = 1_700_000_000_000L, date = "2026-02-10")

        assertTrue(queue.drainBatches().isEmpty())
    }

    @Test
    fun `una cola más corta que la tanda viaja en una sola`() {
        val queue = AeroQueue(
            createdAt = 1_700_000_000_000L,
            date = "2026-02-10",
            items = (1..3).map { item(it) },
        )

        assertEquals(listOf(3), queue.drainBatches().map { it.size })
    }

    @Test
    fun `encolar el mismo lanzamiento otra vez no lo duplica`() {
        // El reintento de una fila y la apertura del día pueden encolar el mismo asiento: la cola es un conjunto
        // de trabajo pendiente, no un registro de intentos.
        val queue = AeroQueue(createdAt = 1_700_000_000_000L, date = "2026-02-10")
            .enqueue(item(7, quantity = 30.0))
            .enqueue(item(7, quantity = 30.0))

        assertEquals(1, queue.items.size)
        assertEquals(listOf(7), queue.items.single().launchIds)
    }

    @Test
    fun `lo que la planta tomó sale de la cola`() {
        val queue = AeroQueue(createdAt = 1_700_000_000_000L, date = "2026-02-10")
            .enqueue(item(7))
            .enqueue(item(8, "001046"))

        val settled = queue.settle(listOf(7))

        assertEquals(listOf(8), settled.items.flatMap { it.launchIds })
        assertTrue(settled.settle(listOf(8)).isEmpty)
    }
}
