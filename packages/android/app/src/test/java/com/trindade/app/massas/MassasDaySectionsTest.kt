package com.trindade.app.massas

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The two lower sections of the launch screen read the unified day, not the local launches.
 *
 * This is a fact about the shipped screen, read from the source: the defect it guards against is a section
 * that keeps grouping `dayView.launches` after the table above was unified, so a seat that only the tablet
 * recorded loses its worker, its boxes and its place in the collective summary. The numbers themselves are
 * tested in [MassasUnifiedTest]; what cannot be asserted without a device is that the screen calls them.
 */
class MassasDaySectionsTest {

    private fun source(subpath: String): String {
        val candidates = listOf(
            File("src/main/java/com/trindade/app", subpath),
            File("app/src/main/java/com/trindade/app", subpath),
            File("packages/android/app/src/main/java/com/trindade/app", subpath),
        )
        return candidates.firstOrNull { it.exists() }?.readText()
            ?: error("Could not find source $subpath in candidates: $candidates")
    }

    private fun strings(subpath: String): String {
        val candidates = listOf(
            File("src/main/res", subpath),
            File("app/src/main/res", subpath),
            File("packages/android/app/src/main/res", subpath),
        )
        return candidates.firstOrNull { it.exists() }?.readText()
            ?: error("Could not find strings $subpath in candidates: $candidates")
    }

    @Test
    fun `both sections are fed by the unified rows`() {
        val screen = source("massas/MassasLaunchScreen.kt")

        assertTrue(
            "The worker filter must come from the rows, not from the local accounts",
            screen.contains("val operators = remember(rows) { massasUnifiedOperators(rows) }"),
        )
        assertTrue(
            "The collective summary must round once per product",
            screen.contains("val visibleSummary = remember(rows, selectedKey)"),
        )
        assertTrue(
            "The individual list must read the rows so an ERP-only seat has a line",
            screen.contains("val displayedRows = remember(rows, selectedKey)"),
        )
        assertTrue(
            "A row with an open box must say so",
            screen.contains("R.string.massas_open_box_note"),
        )
        assertTrue(
            "A seat nobody launched here is read-only in this section",
            screen.contains("R.string.massas_erp_only_read_only"),
        )

        // The old path is gone: keeping it would round each line and hide ERP-only workers.
        assertTrue(
            "The sections must not group the local launches again",
            !screen.contains("groupProductsFromLaunches("),
        )
        assertTrue(
            "The sections must not filter by account id",
            !screen.contains("selectedOperatorId"),
        )
    }

    @Test
    fun `the open box note exists in both locales`() {
        assertTrue(strings("values/strings.xml").contains("inclui 1 caixa aberta"))
        assertTrue(strings("values-es/strings.xml").contains("incluye 1 caja abierta"))
    }
}
