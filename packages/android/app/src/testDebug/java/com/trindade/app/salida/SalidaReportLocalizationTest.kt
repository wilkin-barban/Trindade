package com.trindade.app.salida

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.reports.SalidaReportCard
import com.trindade.app.contract.models.SalidaReportDayView
import com.trindade.app.contract.models.SalidaReportDayViewOperatorsInner
import com.trindade.app.contract.models.SalidaReportOperatorProductsInner
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(sdk = [33], qualifiers = "es-rES-w390dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SalidaReportLocalizationTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun loadingLabelsUseSpanish() {
        composeRule.setContent {
            TrindadeTheme { SalidaReportCard(day = null, error = null) }
        }
        composeRule.onNodeWithText("SALIDAS / BAJA").assertExists()
        composeRule.onNodeWithText("Leyendo las salidas del día…").assertExists()
    }

    @Test
    fun erpProductNameIsNotTranslated() {
        val product = SalidaReportOperatorProductsInner(
            code = "9999", name = "AÇÚCAR DA EMPRESA", units = 2,
            block = SalidaReportOperatorProductsInner.Block.materiaMinusPrima,
        )
        val day = SalidaReportDayView(
            date = "2026-11-18", totalUnits = 2, movementCount = 1,
            operators = listOf(SalidaReportDayViewOperatorsInner(
                name = "Operador", username = "OPERADOR", units = 2,
                products = listOf(product), erpOnly = true,
            )),
        )
        composeRule.setContent { TrindadeTheme { SalidaReportCard(day = day, error = null) } }
        composeRule.onNodeWithText("- AÇÚCAR DA EMPRESA").assertExists()
        composeRule.onNodeWithText("👤 OPERADOR (solo ERP)").assertExists()
    }

    @Test
    fun readFailureUsesSpanish() {
        composeRule.setContent {
            TrindadeTheme { SalidaReportCard(day = null, error = "failure") }
        }
        composeRule.onNodeWithText("No se pudieron leer las salidas del día.").assertExists()
    }
}
