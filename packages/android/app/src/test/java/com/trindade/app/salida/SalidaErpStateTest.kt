package com.trindade.app.salida

import com.trindade.app.contract.models.SalidaReportDayView
import com.trindade.app.contract.models.SalidaReportDayViewOperatorsInner
import com.trindade.app.contract.models.SalidaReportOperatorProductsInner
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Qué cuenta como un día con algo que compartir, y cuándo un fallo de lectura es una frase.
 *
 * El archivo mezcla dos fuentes: lo que se lanzó en Trindade y lo que el ERP registró. Un día que sólo tiene lo
 * segundo no es un día vacío -- tiene operarios y productos que el grupo espera leer -- y un fallo de la última
 * lectura no borra el día que ya estaba en pantalla.
 */
class SalidaErpStateTest {

    private fun product(units: Int) = SalidaReportOperatorProductsInner(
        code = "2500",
        name = "GORDURA",
        block = SalidaReportOperatorProductsInner.Block.materiaMinusPrima,
        units = units,
    )

    private fun operator(units: List<Int>) = SalidaReportDayViewOperatorsInner(
        name = "Vinícius R",
        username = "vinicius",
        units = units.sum(),
        products = units.map { product(it) },
        erpOnly = true,
    )

    private fun day(vararg units: List<Int>) = SalidaReportDayView(
        date = "2026-11-19",
        operators = units.map { operator(it) },
        totalUnits = units.sumOf { it.sum() },
        movementCount = units.size,
    )

    @Test
    fun `an erp-only day has something to share`() {
        assertTrue(salidaHasShareableData(movements = 0, erpOperators = day(listOf(7)).operators))
    }

    @Test
    fun `a day with erp operators but no units has nothing`() {
        assertFalse(salidaHasShareableData(movements = 0, erpOperators = day(listOf(0)).operators))
        assertFalse(salidaHasShareableData(movements = 0, erpOperators = emptyList()))
    }

    @Test
    fun `local movements are enough on their own`() {
        assertTrue(salidaHasShareableData(movements = 2, erpOperators = emptyList()))
    }
}
