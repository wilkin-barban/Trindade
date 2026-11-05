package com.trindade.app.massas

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.trindade.app.network.MassaIndividualLaunch
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The row's trailing corner, which is where this remediation's case was visible.
 *
 * The two launches of that morning (113 and 114) had their seats in the plant's ERP and the operator was still
 * being offered Editar. The screen's branch order is what decides it: a reconciled row reads "conciliado" and
 * never draws the buttons, whatever `canEdit` answers. The first test is here so the second one cannot pass by
 * drawing nothing at all.
 */
@RunWith(RobolectricTestRunner::class)
class MassasLaunchRowActionsTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun launch(id: Int) = MassaIndividualLaunch(
        id = id,
        launchDate = "2026-11-04",
        productCode = "22",
        productName = "MASSA TOKO",
        boxes = 8,
        units = 120,
        userId = 2,
        username = "jaime",
        displayName = "JAIME",
        createdAt = "2026-11-04T10:00:00Z",
        updatedAt = "2026-11-04T10:00:00Z",
    )

    private fun render(state: MassasRowState, launch: MassaIndividualLaunch?, canEdit: Boolean) {
        composeRule.setContent {
            TrindadeTheme {
                MassasLaunchRowActions(
                    state = state,
                    launch = launch,
                    canEdit = { canEdit },
                    onEdit = {},
                    onDelete = {},
                )
            }
        }
    }

    @Test
    fun `a pending row the operator owns is offered for edit and delete`() {
        render(MassasRowState.PENDING_ERP, launch(113), canEdit = true)

        composeRule.onNodeWithText("Editar").assertIsDisplayed()
        composeRule.onNodeWithText("Excluir").assertIsDisplayed()
    }

    @Test
    fun `a reconciled row draws no edit and no delete, even if it were allowed to edit`() {
        // `canEdit = true` a propósito: el caso real era que el estado ya permite editar y el espejo, viejo,
        // decía pendiente. Acá el estado es el correcto y la rama de conciliado gana igual.
        render(MassasRowState.RECONCILED, launch(113), canEdit = true)

        composeRule.onNodeWithText("Editar").assertDoesNotExist()
        composeRule.onNodeWithText("Excluir").assertDoesNotExist()
        composeRule.onNodeWithText("Conciliado").assertIsDisplayed()
    }

    @Test
    fun `a seat nobody launched here is read only`() {
        render(MassasRowState.ERP_ONLY, launch = null, canEdit = true)

        composeRule.onNodeWithText("Editar").assertDoesNotExist()
        composeRule.onNodeWithText("Excluir").assertDoesNotExist()
    }
}
