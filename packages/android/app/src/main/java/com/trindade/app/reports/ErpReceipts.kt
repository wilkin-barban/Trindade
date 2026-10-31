package com.trindade.app.reports

import com.trindade.app.contract.models.CategoriesResponseCategoriesInner

/**
 * The day Recebimento stopped being a checklist.
 *
 * The ERP's own receipts became a mirror the app reads, so ticking supplies by hand would put two records of
 * the same delivery into one report. It is a date and not a flag: reports of the days before it keep the ticks
 * they were filed with, because the plant's history is not rewritten by a later feature.
 *
 * Both values mirror the web (`ERP_RECEIPT_CATEGORY_ID`, `ERP_RECEIPT_SINCE` in `lib/receipts.ts`) and the
 * backend, which is what makes the three surfaces agree on the same day.
 */
const val ERP_RECEIPT_CATEGORY_ID = 4

const val ERP_RECEIPT_SINCE = "2026-10-29"

/** Whether a report dated [date] takes its Recebimento section from the mirror. */
fun usesErpReceipts(date: String): Boolean = date >= ERP_RECEIPT_SINCE

/**
 * The categories the form answers on [date].
 *
 * Recebimento and everything under it drop out once the mirror covers the day, and they drop out here rather
 * than in the drawing: the same list answers the validation that decides whether the report can be saved, so a
 * hidden section can neither be drawn nor demanded.
 */
fun reportFormCategories(
    categories: List<CategoriesResponseCategoriesInner>,
    date: String,
): List<CategoriesResponseCategoriesInner> {
    if (!usesErpReceipts(date)) return categories
    return categories.filter {
        it.id != ERP_RECEIPT_CATEGORY_ID && it.parentCategoryId != ERP_RECEIPT_CATEGORY_ID
    }
}
