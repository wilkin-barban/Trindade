package com.trindade.app.ui

import android.content.Context
import android.content.res.Configuration
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Locale

/**
 * The counted sentences a history prints, in the form the count asks for.
 *
 * The card that read "1 produtos lançados · 1 operadores" was not wrong about the numbers; it was a fixed
 * plural wearing a number, which is only invisible while the number happens to be greater than one. The day
 * that closes with a single product is exactly the day an operator reads the line twice, so the singular is
 * the case worth stating.
 */
@RunWith(AndroidJUnit4::class)
class HistoryPluralsTest {

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun Context.quantity(id: Int, count: Int): String =
        resources.getQuantityString(id, count, count)

    @Test
    fun `one loading is a carregamento and several are carregamentos`() {
        assertEquals("1 carregamento", context.quantity(R.plurals.loading_history_loadings, 1))
        assertEquals("3 carregamentos", context.quantity(R.plurals.loading_history_loadings, 3))
    }

    @Test
    fun `a day of one product and one operator is written in the singular`() {
        assertEquals("1 produto lançado", context.quantity(R.plurals.massas_history_products, 1))
        assertEquals("2 produtos lançados", context.quantity(R.plurals.massas_history_products, 2))
        assertEquals("1 operador", context.quantity(R.plurals.massas_history_operators, 1))
        assertEquals("2 operadores", context.quantity(R.plurals.massas_history_operators, 2))
        assertEquals("1 caixa", context.quantity(R.plurals.massas_history_boxes, 1))
        assertEquals("279 caixas", context.quantity(R.plurals.massas_history_boxes, 279))
        assertEquals("1 unidade", context.quantity(R.plurals.massas_history_units, 1))
        assertEquals("2790 unidades", context.quantity(R.plurals.massas_history_units, 2790))
        assertEquals("1 dia registrado", context.quantity(R.plurals.massas_history_days_count, 1))
        assertEquals("8 dias registrados", context.quantity(R.plurals.massas_history_days_count, 8))
    }

    @Test
    fun `the spanish histories count in spanish`() {
        val es = context.createConfigurationContext(
            Configuration(context.resources.configuration).apply {
                setLocale(Locale.forLanguageTag("es"))
            },
        )
        assertEquals("1 carga", es.quantity(R.plurals.loading_history_loadings, 1))
        assertEquals("3 cargas", es.quantity(R.plurals.loading_history_loadings, 3))
        assertEquals("1 día registrado", es.quantity(R.plurals.massas_history_days_count, 1))
        assertEquals("2 operadores", es.quantity(R.plurals.massas_history_operators, 2))
    }
}
