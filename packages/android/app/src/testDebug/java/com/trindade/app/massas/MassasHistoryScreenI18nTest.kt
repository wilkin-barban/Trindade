package com.trindade.app.massas

import android.content.Context
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.network.MassaHistoryDay
import com.trindade.app.network.MassasApi
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import retrofit2.Retrofit

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "es-w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MassasHistoryScreenI18nTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun copy(id: Int): String = context.getString(id)

    private fun repository(days: List<MassaHistoryDay>): MassasRepository {
        val dummyApi = Retrofit.Builder().baseUrl("https://example.invalid/").build().create(MassasApi::class.java)
        return object : MassasRepository(dummyApi) {
            override suspend fun history(): List<MassaHistoryDay> = days
        }
    }

    @Test
    fun `spanish locale renders localized empty state and recent dates chip label`() {
        val vm = MassasHistoryViewModel(repository(emptyList()))
        composeRule.setContent {
            TrindadeTheme {
                MassasHistoryScreen(
                    viewModel = vm,
                    onSelectDate = {},
                    today = "2026-11-26",
                )
            }
        }
        composeRule.waitUntil(3_000) { !vm.state.value.isLoading }

        composeRule.onNodeWithText(copy(R.string.massas_history_empty)).assertIsDisplayed()

        composeRule.onNodeWithTag("massas-history-all").performScrollTo().performClick()
        composeRule.onNodeWithText(copy(R.string.massas_history_recent_dates)).assertIsDisplayed()
        composeRule.onAllNodesWithText("Últimas datas").assertCountEquals(0)
    }
}
