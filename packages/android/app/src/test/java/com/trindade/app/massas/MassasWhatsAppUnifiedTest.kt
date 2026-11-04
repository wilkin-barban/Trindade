package com.trindade.app.massas

import com.trindade.app.network.MassaIndividualLaunch
import com.trindade.app.network.MassaProductTotal
import com.trindade.app.network.MassasLaunchDayView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The WhatsApp summary of the day, built the way the table is built.
 *
 * The plant records boxes on the company tablet and Trindade records the ones launched here. A worker who only
 * exists in the ERP used to be missing from the message, and with him his massas; now the message reads the
 * unified rows, so both sources travel, deduplicated once, and a supply never does.
 */
class MassasWhatsAppUnifiedTest {

    private fun catalogue() = listOf(
        MassaProductTotal(code = "1045", name = "MASSA CASEIRA", unitsPerBox = 10, totalBoxes = 0, totalUnits = 0),
        MassaProductTotal(code = "1616", name = "MASSA TOKO", unitsPerBox = 10, totalBoxes = 0, totalUnits = 0),
    )

    private fun day() = MassasLaunchDayView(
        date = "2026-06-12",
        products = catalogue(),
        launches = emptyList(),
        totalBoxes = 0,
        totalUnits = 0,
    )

    private fun row(
        state: MassasRowState,
        operator: String,
        code: String,
        name: String,
        units: Int,
        unitsPerBox: Int,
    ) = MassasUnifiedRow(
        key = "$state-$operator-$code",
        state = state,
        operatorName = operator,
        operatorKey = operator.lowercase(),
        productCode = code,
        productName = name,
        boxes = if (unitsPerBox > 0) (units + unitsPerBox - 1) / unitsPerBox else 0,
        units = units,
        launchIds = if (state == MassasRowState.ERP_ONLY) emptyList() else listOf(1),
        entLans = if (state == MassasRowState.ERP_ONLY) listOf(51101) else emptyList(),
        importable = false,
        tabletAcked = false,
        unitsPerBox = unitsPerBox,
        openBoxUnits = if (unitsPerBox > 0) units % unitsPerBox else 0,
    )

    @Test
    fun `an ERP-only worker travels in the message marked So ERP`() {
        val rows = listOf(
            row(MassasRowState.ERP_ONLY, "Jaime", "1045", "MASSA CASEIRA", 20, 10),
            row(MassasRowState.ERP_ONLY, "Jaime", "1616", "MASSA TOKO", 10, 10),
        )

        val message = formatMassasWhatsAppMessage(day(), rows)

        assertTrue(message, message.contains("👤 *Jaime (só ERP):*"))
        assertTrue(message, message.contains("• CASEIRA: 20 un (2 cx)"))
        assertTrue(message, message.contains("• TOKO: 10 un (1 cx)"))
        assertTrue(message, message.contains("*Resumo Coletivo:*"))
        assertTrue(message, message.contains("*Por Trabalhador:*"))
    }

    @Test
    fun `a supply never enters the message, even when its description says MASSA`() {
        val rows = listOf(
            row(MassasRowState.ERP_ONLY, "Jaime", "1045", "MASSA CASEIRA", 10, 10),
            // Not one of the ten: the description must not talk the message into calling it a massa.
            row(MassasRowState.ERP_ONLY, "Jaime", "000777", "MASSA P PIZZA KIT", 4, 10),
        )

        val message = formatMassasWhatsAppMessage(day(), rows)

        assertTrue(message, message.contains("• CASEIRA: 10 un (1 cx)"))
        assertFalse(message, message.contains("PIZZA"))
    }

    @Test
    fun `a reconciled launch is counted once and is not marked So ERP`() {
        val rows = listOf(row(MassasRowState.RECONCILED, "Jaime", "1045", "MASSA CASEIRA", 20, 10))

        val message = formatMassasWhatsAppMessage(day(), rows)

        assertTrue(message, message.contains("👤 *Jaime:*"))
        assertFalse(message, message.contains("só ERP"))
        val workerSection = message.substringAfter("*Por Trabalhador:*")
        assertEquals(1, workerSection.lines().count { it.contains("CASEIRA") })
    }

    @Test
    fun `without rows the message keeps reading the local launches`() {
        val launch = MassaIndividualLaunch(
            id = 1,
            launchDate = "2026-06-12",
            productCode = "1045",
            productName = "MASSA CASEIRA",
            boxes = 2,
            units = 20,
            userId = 7,
            username = "jaime",
            displayName = "Jaime",
        )
        val view = day().copy(
            products = listOf(
                MassaProductTotal(code = "1045", name = "MASSA CASEIRA", unitsPerBox = 10, totalBoxes = 2, totalUnits = 20),
            ),
            launches = listOf(launch),
            totalBoxes = 2,
            totalUnits = 20,
        )

        val message = formatMassasWhatsAppMessage(view)

        assertTrue(message, message.contains("👤 *Jaime:*"))
        assertTrue(message, message.contains("• CASEIRA: 20 un (2 cx)"))
    }
}
