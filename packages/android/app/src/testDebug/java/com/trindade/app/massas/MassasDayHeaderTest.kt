package com.trindade.app.massas

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The date header owns the day's one refresh.
 *
 * The complaint behind this header was duplication: a "Atualizar agora" button on the date row and a whole
 * card underneath doing the same thing with a second label. These tests pin the replacement -- one action,
 * labeled as the ERP sync, next to the date it refreshes, carrying the spinner while it runs and the last
 * read time under it -- and the absence of the old label, so the redundancy cannot come back unnoticed.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [28], qualifiers = "w375dp-h800dp")
class MassasDayHeaderTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun draw(
        syncedAt: String? = null,
        isSyncing: Boolean = false,
        onSync: () -> Unit = {},
    ) {
        composeRule.setContent {
            TrindadeTheme {
                MassasDayHeader(
                    date = "2025-10-30",
                    syncedAt = syncedAt,
                    isSyncing = isSyncing,
                    onSync = onSync,
                )
            }
        }
    }

    @Test
    fun `the date carries one sync action and no second refresh`() {
        draw()

        composeRule.onNodeWithText(string(R.string.massas_sync_erp)).assertIsDisplayed()
        assertEquals(
            1,
            composeRule.onAllNodesWithTag(MASSAS_SYNC_TAG).fetchSemanticsNodes().size,
        )
        // The old label lived on this very row; if it returns, the row has two refreshes again.
        listOf("Atualizar agora", "Actualizar ahora").forEach { old ->
            assertEquals(
                0,
                composeRule.onAllNodesWithText(old, substring = true).fetchSemanticsNodes().size,
            )
        }
        composeRule.onNodeWithTag(MASSAS_SYNC_TAG).assertIsEnabled()
    }

    @Test
    fun `a running sync spins and withholds the action`() {
        draw(isSyncing = true)

        composeRule.onNodeWithTag(MASSAS_SYNC_SPINNER_TAG).assertIsDisplayed()
        composeRule.onNodeWithTag(MASSAS_SYNC_TAG).assertIsNotEnabled()
    }

    @Test
    fun `the last read of the day is readable under the date`() {
        draw(syncedAt = "30/10 18:12")

        composeRule.onNodeWithText(string(R.string.massas_synced_at, "30/10 18:12")).assertIsDisplayed()
    }

    @Test
    fun `a day never read from the erp says so instead of showing nothing`() {
        draw(syncedAt = null)

        composeRule.onNodeWithText(string(R.string.massas_never_synced)).assertIsDisplayed()
    }

    private fun string(resId: Int, vararg args: Any): String =
        androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
            .getString(resId, *args)
}
