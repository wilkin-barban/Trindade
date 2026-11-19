package com.trindade.app.reports

import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.contract.models.SalidaReportDayView
import com.trindade.app.contract.models.SalidaReportDayViewOperatorsInner
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * La tarjeta de salidas es una sola, y se ve también antes de guardar.
 *
 * El formulario de creación declaraba las salidas del día en el texto del mensaje pero no las mostraba: el
 * operario firmaba un reporte con bajas que no había visto. La tarjeta es la misma del detalle.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class ReportSalidaBlockTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val day = SalidaReportDayView(
        date = "2026-11-18",
        operators = listOf(
            SalidaReportDayViewOperatorsInner(
                name = "Gustavo",
                username = "gustavo",
                units = 6,
                products = emptyList(),
                erpOnly = true,
            ),
            SalidaReportDayViewOperatorsInner(
                name = "Nicolas",
                username = "nicolas",
                units = 1,
                products = emptyList(),
                erpOnly = false,
            ),
        ),
        totalUnits = 7,
        movementCount = 1,
    )

    @Test
    fun `the block shows the day's operators and its total`() {
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                SalidaReportCard(day = day, error = null, modifier = androidx.compose.ui.Modifier.testTag("report-salida-block"))
            }
        }

        composeRule.onNodeWithTag("report-salida-block").assertIsDisplayed()
        // La cuenta que resolvió el servidor, no el nombre que escribió la empresa: gustavo, no GUSTAVO H.
        composeRule.onNodeWithText("👤 gustavo (só ERP)").assertIsDisplayed()
        composeRule.onNodeWithText("👤 nicolas").assertIsDisplayed()
    }
}
