package com.trindade.app.reports

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.contract.models.SalidaReportDayView
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * La tarjeta de salidas dice el día vacío una sola vez.
 *
 * Montada sola -- en el Relatório -- lo dice por su cuenta; en el histórico, que tiene su propia tarjeta de estado
 * vacío con la acción al lado, se calla. Dos explicaciones del mismo vacío, una de ellas sin botón, se leen como
 * dos problemas distintos.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SalidaReportCardEmptyTextTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun emptyDay() = SalidaReportDayView(
        date = "2026-11-19",
        operators = emptyList(),
        totalUnits = 0,
        movementCount = 0,
    )

    @Test
    fun `the card alone explains the empty day`() {
        composeRule.setContent {
            TrindadeTheme { SalidaReportCard(day = emptyDay(), error = null) }
        }

        composeRule.onNodeWithText(context.getString(R.string.salida_none_this_day)).assertIsDisplayed()
    }

    @Test
    fun `with the history's own empty card, the sentence is not repeated`() {
        composeRule.setContent {
            TrindadeTheme { SalidaReportCard(day = emptyDay(), error = null, showEmptyText = false) }
        }

        composeRule.onNodeWithText(context.getString(R.string.salida_none_this_day)).assertDoesNotExist()
        // El título y el total de la tarjeta siguen.
        composeRule.onNodeWithText("SAÍDAS / BAIXA").assertIsDisplayed()
    }
}
