package com.trindade.app.salida

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Las fotos del día van arriba del texto, como en el Relatório.
 *
 * La miniaturas dicen qué viaja con el mensaje; el botón general ahora las adjunta de verdad y, sin fotos, el bloque
 * se dibuja igual con su prévia y su acción.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class SalidaWhatsAppShareTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `thumbnails sit above the preview text`() {
        composeRule.setContent {
            TrindadeTheme {
                SalidaWhatsAppShare(
                    text = "Salidas del día",
                    phone = "",
                    onPhoneChange = {},
                    walletLink = "https://wa.me/55",
                    onOpenWhatsApp = {},
                    photos = listOf("https://example.test/1.jpg", "https://example.test/2.jpg"),
                )
            }
        }

        composeRule.onNodeWithTag("salida-share-photos").assertIsDisplayed()
        val photo = composeRule.onNodeWithTag("salida-share-photo-0").getUnclippedBoundsInRoot()
        val text = composeRule.onNodeWithTag("salida-preview-message").getUnclippedBoundsInRoot()
        assertTrue("la miniatura va arriba del texto", photo.bottom <= text.top)
    }

    @Test
    fun `without photos the card keeps its preview and action`() {
        composeRule.setContent {
            TrindadeTheme {
                SalidaWhatsAppShare(
                    text = "",
                    phone = "",
                    onPhoneChange = {},
                    walletLink = null,
                    onOpenWhatsApp = {},
                )
            }
        }

        composeRule.onNodeWithTag("salida-preview-message").assertIsDisplayed()
        // Sin texto no hay nada que compartir: la acción queda deshabilitada, sin romperse.
        composeRule.onNodeWithTag("salida-share-day").assertIsNotEnabled()
    }
}
