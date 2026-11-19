package com.trindade.app.reports

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Las fotos del reporte se eligen antes de guardarlo y se pueden quitar.
 *
 * El tope es el del servidor: cinco. Con las cinco puestas el botón de agregar queda deshabilitado, y quitar una
 * devuelve su índice para que la pantalla sepa cuál sacar.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class ReportPhotosSectionTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `a full report offers no more photos and each one can be removed`() {
        var removed = -1
        var added = 0
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                ReportPhotosSection(
                    pendingCount = MAX_PENDING_PHOTOS,
                    onAddPhotos = { added += 1 },
                    onRemovePhoto = { removed = it },
                )
            }
        }

        composeRule.onNodeWithText("Fotos (5/5)").assertIsDisplayed()
        composeRule.onNodeWithTag("report-photo-input").assertIsNotEnabled()

        composeRule.onAllNodesWithTag("remove-pending-photo-btn")[2].performClick()
        assertEquals(2, removed)
        assertEquals(0, added)
    }

    @Test
    fun `an empty report offers the picker`() {
        var added = 0
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                ReportPhotosSection(pendingCount = 0, onAddPhotos = { added += 1 }, onRemovePhoto = {})
            }
        }

        composeRule.onNodeWithText("Fotos (0/5)").assertIsDisplayed()
        composeRule.onNodeWithTag("report-photo-input").performClick()
        assertEquals(1, added)
        composeRule.onAllNodesWithTag("remove-pending-photo-btn").assertCountEquals(0)
    }
}
