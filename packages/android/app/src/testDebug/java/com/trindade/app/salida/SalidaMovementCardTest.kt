package com.trindade.app.salida

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaMovementItemsInner
import com.trindade.app.contract.models.SalidaMovementPhotosInner
import com.trindade.app.contract.models.SalidaMovementReconciliation
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * La tarjeta del movimiento lleva su evidencia y sus acciones.
 *
 * Las fotos viven en el movimiento, no en el día: se agregan, se borran y se comparten desde la tarjeta a la que
 * pertenecen, con los testIDs que la directiva nombra.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
class SalidaMovementCardTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun movement(photos: List<SalidaMovementPhotosInner>) = SalidaCreateResponseMovement(
        id = 7,
        movementDate = "2026-11-18",
        userId = 1,
        username = "wilkin",
        displayName = "Wilkin",
        createdAt = "2026-11-18T09:00:00.000Z",
        items = listOf(
            SalidaMovementItemsInner(
                id = 1,
                productCode = "1356",
                productName = "EMBALAG. DISCO 400g",
                block = SalidaMovementItemsInner.Block.embalagens,
                quantity = 600,
                position = 0,
            ),
        ),
        photos = photos,
        totalUnits = 600,
        reconciliation = SalidaMovementReconciliation(
            status = SalidaMovementReconciliation.Status.pending,
            entLans = emptyList(),
            matchedItemIds = emptyList(),
        ),
        erp = null,
    )

    private fun photo(id: Int, path: String) = SalidaMovementPhotosInner(
        id = id,
        filePath = path,
        fileSize = 1024,
        mimeType = "image/jpeg",
        url = "/api/salida/photos/$id",
        publicUrl = "https://trindademasas.duckdns.org/p/$id",
        createdAt = "2026-11-18T10:00:00.000Z",
    )

    @Test
    fun `the card shows its photos and offers to add more, delete one and share`() {
        var deleted = 0
        var shared = 0
        var added = 0
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                SalidaMovementCard(
                    movement = movement(
                        listOf(
                            photo(91, "/p/uno.jpg"),
                            photo(92, "/p/dos.jpg"),
                        ),
                    ),
                    onAddPhoto = { added += 1 },
                    onDeletePhoto = { deleted = it },
                    onShare = { shared += 1 },
                )
            }
        }

        composeRule.onNodeWithTag("salida-photos-7").assertIsDisplayed()
        composeRule.onNodeWithText("Fotos (2)").assertIsDisplayed()

        composeRule.onNodeWithTag("salida-share-7").performClick()
        assertEquals(1, shared)

        composeRule.onNodeWithTag("salida-photo-picker").performClick()
        assertEquals(1, added)

        composeRule.onAllNodesWithText("Borrar foto")[1].performClick()
        assertEquals(92, deleted)
    }

    @Test
    fun `a movement without photos shows no photo block but still offers the picker`() {
        composeRule.setContent {
            com.trindade.app.ui.theme.TrindadeTheme {
                SalidaMovementCard(movement = movement(emptyList()), onAddPhoto = {}, onDeletePhoto = {}, onShare = {})
            }
        }

        composeRule.onNodeWithTag("salida-photos-7").assertDoesNotExist()
        composeRule.onNodeWithTag("salida-photo-picker").assertIsDisplayed()
    }
}
