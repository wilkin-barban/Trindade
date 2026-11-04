package com.trindade.app.reports

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.assertIsDisplayed
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
import com.trindade.app.contract.models.ReportReceipts
import com.trindade.app.contract.models.ReportReceiptsReceiptsInner
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.math.BigDecimal

/**
 * Masas and insumos are two blocks with two lists.
 *
 * The card shares one sync action, but not one list: the massas block renders the day's massas products and the
 * insumos block renders the mirrored receipts. The fixture is the exact case the audit named -- a supply whose
 * description starts with "MASSA P PIZZA" but whose code is not one of the ten, beside a real massa -- and the
 * assertion is about the block each line belongs to, not about the order of a flat list.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w375dp-h1200dp")
class ErpMovementsCardBlocksTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: android.content.Context
        get() = ApplicationProvider.getApplicationContext()

    private fun massasDay(): MassasReportDayView {
        val massa = MassasLaunchDayViewProductsInner(
            code = "1616",
            name = "MASSA TOKO",
            unitsPerBox = 10,
            totalBoxes = 3,
            totalUnits = 30,
            openBoxUnits = BigDecimal.ZERO,
        )
        val operatorProduct = MassasReportDayViewOperatorsInnerProductsInner(
            code = "1616",
            name = "MASSA TOKO",
            boxes = BigDecimal("3"),
            units = BigDecimal("30"),
            openBoxUnits = BigDecimal.ZERO,
        )
        val operator = MassasReportDayViewOperatorsInner(
            operatorKey = "JAIME",
            name = "Jaime",
            displayName = "Jaime",
            username = null,
            boxes = BigDecimal("3"),
            units = BigDecimal("30"),
            openBoxUnits = BigDecimal.ZERO,
            products = listOf(operatorProduct),
            erpOnly = true,
            onlyErp = true,
            entLans = listOf(BigDecimal("41101")),
        )
        return MassasReportDayView(
            date = "2026-11-04",
            operators = listOf(operator),
            products = listOf(massa),
            totalBoxes = BigDecimal("3"),
            totalUnits = BigDecimal("30"),
            balance = MassasReportDayViewBalance(
                producedBoxes = BigDecimal("3"),
                producedUnits = BigDecimal("30"),
                registeredBoxes = BigDecimal("3"),
                registeredUnits = BigDecimal("30"),
                differenceUnits = BigDecimal.ZERO,
                reconciledSeats = BigDecimal.ONE,
                pendingSeats = BigDecimal.ZERO,
            ),
            reconciledEntLans = listOf(BigDecimal("41101")),
        )
    }

    private fun receipts(): ReportReceipts = ReportReceipts(
        date = "2026-11-04",
        migrated = true,
        syncedAt = "2026-11-04T12:00:00.000Z",
        receipts = listOf(
            ReportReceiptsReceiptsInner(
                entLan = 41102,
                // Not one of the ten codes: the description must not make it a massa.
                productCode = "000777",
                productDesc = "MASSA P PIZZA KIT",
                quantity = BigDecimal("2"),
                operatorName = "Jaime",
                entryDate = "2026-11-04",
            ),
        ),
    )

    private fun drawCard() {
        composeRule.setContent {
            TrindadeTheme {
                Box(modifier = Modifier.width(360.dp)) {
                    ErpMovementsCard(
                        massasDay = massasDay(),
                        receipts = receipts(),
                        isSyncing = false,
                        onSync = {},
                    )
                }
            }
        }
    }

    @Test
    fun `a MASSA P PIZZA supply is not drawn in the massas block`() {
        drawCard()

        // The day's production belongs to the massas block: the worker line with his boxes and units...
        composeRule
            .onNodeWithText("3 cx · 30 un", substring = true, useUnmergedTree = true)
            .assert(hasAnyAncestor(hasTestTag("report-massas-block")))
        // ...and the supply, described like a massa but with a foreign code, does not.
        composeRule
            .onNodeWithText("MASSA P PIZZA KIT", substring = true, useUnmergedTree = true)
            .assert(!hasAnyAncestor(hasTestTag("report-massas-block")))
    }

    @Test
    fun `the supply is drawn in the insumos block, and the massa is not`() {
        drawCard()

        composeRule
            .onNodeWithText("MASSA P PIZZA KIT", substring = true, useUnmergedTree = true)
            .assert(hasAnyAncestor(hasTestTag("report-receipts-block")))
        composeRule
            .onNodeWithText("3 cx · 30 un", substring = true, useUnmergedTree = true)
            .assert(!hasAnyAncestor(hasTestTag("report-receipts-block")))
    }

    @Test
    fun `the insumos block says it holds products that are not massas`() {
        drawCard()

        composeRule
            .onNodeWithText(context.getString(R.string.report_receipts_title))
            .assertIsDisplayed()
        composeRule
            .onNodeWithText(context.getString(R.string.report_receipts_subtitle))
            .assertIsDisplayed()
    }
}
