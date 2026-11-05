package com.trindade.app.reports

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.contract.models.MassasLaunchDayViewProductsInner
import com.trindade.app.contract.models.MassasReportDayView
import com.trindade.app.contract.models.MassasReportDayViewBalance
import com.trindade.app.contract.models.MassasReportDayViewOperatorsInner
import com.trindade.app.contract.models.MassasReportDayViewOperatorsInnerProductsInner
import com.trindade.app.ui.theme.TrindadeTheme
import java.math.BigDecimal
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Everyone who produced massas is in the day, and each of them says what they produced.
 *
 * The mirror is not one list per kind of operator. A worker with an account in Trindade and a worker the ERP
 * knows only by name are both production of the same day, and this card is the one place the operator reads the
 * day before filing the report: a list that drops one of them under-reports the shift, and a total with no
 * breakdown leaves the operator unable to tell whose thirty units they are looking at.
 *
 * The web already draws both: the per-operator products under each name and a collective summary of the day's
 * massas. These assertions are the same two, on the handset.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w375dp-h1200dp")
class ErpMovementsCardOperatorsTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: android.content.Context
        get() = ApplicationProvider.getApplicationContext()

    /** Two massas of the day, so the summary has more than one line to say. */
    private fun dayProducts(): List<MassasLaunchDayViewProductsInner> = listOf(
        MassasLaunchDayViewProductsInner(
            code = "1616",
            name = "MASSA TOKO",
            unitsPerBox = 10,
            totalBoxes = 5,
            totalUnits = 50,
            openBoxUnits = BigDecimal.ZERO,
        ),
        MassasLaunchDayViewProductsInner(
            code = "1045",
            name = "MASSA CASEIRA",
            unitsPerBox = 15,
            totalBoxes = 1,
            totalUnits = 12,
            openBoxUnits = BigDecimal("12"),
        ),
    )

    /**
     * The case the operator reported: a worker with an account, and one who is only in the mirror.
     *
     * The second one is the whole reason this file exists. Nothing in the card filters by `erpOnly` today, and
     * these assertions are what keeps that true when the block grows a breakdown and a summary.
     */
    private fun massasDay(): MassasReportDayView {
        val local = MassasReportDayViewOperatorsInner(
            operatorKey = "ana-paula",
            name = "Ana Paula",
            displayName = "Ana Paula",
            username = "ana.paula",
            boxes = BigDecimal("4"),
            units = BigDecimal("45"),
            openBoxUnits = BigDecimal.ZERO,
            products = listOf(
                MassasReportDayViewOperatorsInnerProductsInner(
                    code = "1616",
                    name = "MASSA TOKO",
                    boxes = BigDecimal("3"),
                    units = BigDecimal("30"),
                    openBoxUnits = BigDecimal.ZERO,
                ),
                MassasReportDayViewOperatorsInnerProductsInner(
                    code = "1045",
                    name = "MASSA CASEIRA",
                    boxes = BigDecimal("1"),
                    units = BigDecimal("15"),
                    openBoxUnits = BigDecimal.ZERO,
                ),
            ),
            erpOnly = false,
            onlyErp = false,
            entLans = emptyList(),
        )
        val erpOnly = MassasReportDayViewOperatorsInner(
            operatorKey = "beto-souza",
            name = "Beto Souza",
            displayName = "Beto Souza (só ERP)",
            username = null,
            boxes = BigDecimal("1"),
            units = BigDecimal("5"),
            openBoxUnits = BigDecimal.ZERO,
            products = listOf(
                MassasReportDayViewOperatorsInnerProductsInner(
                    code = "1616",
                    name = "MASSA TOKO",
                    boxes = BigDecimal("0"),
                    units = BigDecimal("5"),
                    openBoxUnits = BigDecimal.ZERO,
                ),
            ),
            erpOnly = true,
            onlyErp = true,
            entLans = listOf(BigDecimal("41200")),
        )
        return MassasReportDayView(
            date = "2026-11-04",
            operators = listOf(local, erpOnly),
            products = dayProducts(),
            totalBoxes = BigDecimal("5"),
            totalUnits = BigDecimal("50"),
            balance = MassasReportDayViewBalance(
                producedBoxes = BigDecimal("5"),
                producedUnits = BigDecimal("50"),
                registeredBoxes = BigDecimal("5"),
                registeredUnits = BigDecimal("50"),
                differenceUnits = BigDecimal.ZERO,
                reconciledSeats = BigDecimal("2"),
                pendingSeats = BigDecimal.ZERO,
            ),
            reconciledEntLans = listOf(BigDecimal("41200")),
        )
    }

    private fun drawCard() {
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(360.dp)) {
                    ErpMovementsCard(
                        massasDay = massasDay(),
                        receipts = null,
                        isSyncing = false,
                        onSync = {},
                    )
                }
            }
        }
    }

    @Test
    fun `every operator of the day is drawn, the one only the mirror knows included`() {
        drawCard()

        composeRule.onNodeWithText("Ana Paula", substring = true, useUnmergedTree = true).assertIsDisplayed()
        composeRule
            .onNodeWithText("Beto Souza (só ERP)", substring = true, useUnmergedTree = true)
            .assertIsDisplayed()
        // The count is the day's, not the list's: two names, two operators.
        composeRule
            .onNodeWithText(context.getString(R.string.report_massas_day_operators, 2))
            .assertIsDisplayed()
    }

    @Test
    fun `an operator says what it produced, product by product`() {
        drawCard()

        // The ERP-only operator's own line, inside its own block: the massa and the units of that line.
        composeRule
            .onNode(
                hasText("MASSA TOKO") and hasAnyAncestor(hasTestTag("report-massas-operator-beto-souza")),
                useUnmergedTree = true,
            )
            .assertIsDisplayed()
        composeRule
            .onNode(
                hasText("5 un") and hasAnyAncestor(hasTestTag("report-massas-operator-beto-souza")),
                useUnmergedTree = true,
            )
            .assertIsDisplayed()
        // And the local one carries its two products, not the other operator's.
        composeRule
            .onNode(
                hasText("MASSA CASEIRA") and hasAnyAncestor(hasTestTag("report-massas-operator-ana-paula")),
                useUnmergedTree = true,
            )
            .assertIsDisplayed()
        composeRule
            .onAllNodes(
                hasText("MASSA CASEIRA") and hasAnyAncestor(hasTestTag("report-massas-operator-beto-souza")),
                useUnmergedTree = true,
            )
            .assertCountEquals(0)
    }

    @Test
    fun `the day closes with the collective summary of its massas`() {
        drawCard()

        composeRule
            .onNodeWithText(context.getString(R.string.report_massas_summary))
            .assertIsDisplayed()
        // Both massas of the day, with the day's own units and not one operator's.
        composeRule
            .onNode(hasText("MASSA TOKO") and hasAnyAncestor(hasTestTag("report-massas-summary")), useUnmergedTree = true)
            .assertIsDisplayed()
        composeRule
            .onNode(hasText("50 un") and hasAnyAncestor(hasTestTag("report-massas-summary")), useUnmergedTree = true)
            .assertIsDisplayed()
    }
}
