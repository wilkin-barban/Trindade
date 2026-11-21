package com.trindade.app.loading

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/** Guards the Activity call sites, which the isolated Compose flow does not mount. */
class LoadingNavigationWiringTest {
    private val activity = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
        .flatMap { dir -> sequenceOf(File(dir, "src/main/java/com/trindade/app/MainActivity.kt"),
            File(dir, "packages/android/app/src/main/java/com/trindade/app/MainActivity.kt")) }
        .first { it.isFile }.readText()

    @Test
    fun `both schedule routes use the same save-to-share action`() {
        val tab = activity.substringAfter("Tab.LOADING -> {\n                                    BackHandler")
            .substringBefore("Tab.ADMIN ->")
        val overlay = activity.substringAfter("loadingDay != null -> {").substringBefore("else -> MainAppShell")
        assertTrue(tab.contains("onSaveDay = onSaveLoadingDay"))
        assertTrue(overlay.contains("onSaveDay = onSaveLoadingDay"))
    }

    @Test
    fun `opening history invalidates the grid before it can be reopened`() {
        val handler = activity.substringAfter("val onOpenLoadingHistory = {").substringBefore("}")
        assertTrue(handler.contains("loadingStale = true"))
        assertTrue(handler.contains("loadingHistoryOpen = true"))
        assertTrue(activity.contains("onOpenHistory = onOpenLoadingHistory"))
    }
}
