package com.trindade.app.salida

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * El día sin salidas del Historial de Salidas: la frase, la puerta al lanzamiento y el bloque de WhatsApp.
 *
 * La web monta el estado vacío **y** `SalidaWhatsAppShare` con la prévia vacía y el envío deshabilitado, porque
 * un bloque que desaparece deja al operario sin saber si el día no tuvo salidas o si la pantalla no cargó. En
 * Android el `return@Column` del día vacío se llevaba el bloque puesto; esto fija que las dos cosas se dibujen,
 * que el envío no se pueda tocar sin texto y que el pasado siga sin la acción de lanzar.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SalidaHistoryEmptyDayTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int, vararg args: Any): String = context.getString(id, *args)

    private fun render(isToday: Boolean, shareText: String = "", walletLink: String? = null) {
        composeRule.setContent {
            TrindadeTheme {
                SalidaHistoryEmptyDay(
                    isToday = isToday,
                    onLaunch = {},
                    shareText = shareText,
                    phone = "",
                    onPhoneChange = {},
                    walletLink = walletLink,
                    onOpenWhatsApp = {},
                )
            }
        }
    }

    @Test
    fun `today states the empty day and keeps the share block with its preview and a disabled send`() {
        var launched = 0
        composeRule.setContent {
            TrindadeTheme {
                SalidaHistoryEmptyDay(
                    isToday = true,
                    onLaunch = { launched++ },
                    shareText = "",
                    phone = "",
                    onPhoneChange = {},
                    walletLink = null,
                    onOpenWhatsApp = {},
                )
            }
        }

        composeRule.onNodeWithText(copy(R.string.salida_history_empty_today)).assertIsDisplayed()
        // La tarjeta explica el vacío una sola vez, con su icono y su ayuda.
        composeRule.onNodeWithTag("salida-history-empty").assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.salida_history_empty_hint)).assertIsDisplayed()
        composeRule.onNodeWithTag("salida-empty-cta").assertIsDisplayed()

        // El bloque de compartir está, con su nombre y la prévia vacía, como en la web.
        composeRule.onNodeWithTag("salida-whatsapp-share-card").assertExists()
        composeRule.onNodeWithText(copy(R.string.salida_share_title)).assertExists()
        composeRule.onNodeWithText(copy(R.string.salida_none_this_day)).assertExists()
        composeRule.onNodeWithTag("salida-share-day").assertIsNotEnabled()

        composeRule.onNodeWithTag("salida-empty-cta").performClick()
        composeRule.waitForIdle()
        assertEquals(1, launched)
    }

    @Test
    fun `a past empty day keeps the sentence and the block, and offers no launch`() {
        render(isToday = false)

        composeRule.onNodeWithText(copy(R.string.salida_history_empty_past)).assertIsDisplayed()
        composeRule.onNodeWithTag("salida-history-empty").assertIsDisplayed()
        composeRule.onNodeWithText(copy(R.string.salida_history_empty_hint)).assertIsDisplayed()
        composeRule.onNodeWithTag("salida-empty-cta").assertDoesNotExist()
        composeRule.onNodeWithTag("salida-whatsapp-share-card").assertExists()
        composeRule.onNodeWithTag("salida-share-day").assertIsNotEnabled()
    }

    @Test
    fun `the share block keeps the 44dp a finger needs at the plant's width`() {
        render(isToday = true)

        for (tag in listOf("salida-empty-cta", "salida-share-day")) {
            val node = composeRule.onNodeWithTag(tag).assertExists()
            val bounds = node.getUnclippedBoundsInRoot()
            assertTrue(
                "'$tag' must be at least 44dp tall at 390dp but was ${bounds.bottom - bounds.top}",
                bounds.bottom - bounds.top >= 44.dp,
            )
        }
    }
}
