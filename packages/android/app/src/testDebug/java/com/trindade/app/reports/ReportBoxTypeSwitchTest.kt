package com.trindade.app.reports

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.contract.models.CategoriesResponseCategoriesInner
import com.trindade.app.contract.models.ProductsResponse
import com.trindade.app.contract.models.ReportCategoryTasksInner
import com.trindade.app.ui.theme.TrindadeTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The switches that decide which box types a report mounts.
 *
 * "Montagem das Caixas" is the one section of this endpoint that nests children -- `Caixas pequenas` and
 * `Caixas Assai` -- and the operator does not always mount both, so the section carries one switch per
 * type and a type that is off cannot be marked. The switches are found by their own label rather than by
 * position, because the form draws task checkboxes in the same tree and a bare `isToggleable()` would be
 * an assertion about whichever control came first.
 *
 * The two claims this file exists for are a pair: a type that is off has to refuse the tap (so the body
 * cannot claim boxes nobody mounted) and the other type has to keep accepting one in the same form (so
 * switching one off does not switch the section off). A test that only asserted the disabled chips would
 * pass just as well on a form that had stopped drawing the section at all.
 */
@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReportBoxTypeSwitchTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun category(
        id: Int,
        namePt: String,
        parentCategoryId: Int? = null,
        categoryType: CategoriesResponseCategoriesInner.CategoryType =
            CategoriesResponseCategoriesInner.CategoryType.check,
        tasks: List<ReportCategoryTasksInner> = emptyList(),
    ) = CategoriesResponseCategoriesInner(
        id = id,
        parentCategoryId = parentCategoryId,
        namePt = namePt,
        nameEs = namePt,
        sortOrder = id,
        categoryType = categoryType,
        tasks = tasks,
    )

    private fun productTask(
        id: Int,
        categoryId: Int,
        namePt: String,
        taskType: ReportCategoryTasksInner.TaskType,
    ) = ReportCategoryTasksInner(
        id = id,
        categoryId = categoryId,
        namePt = namePt,
        nameEs = namePt,
        taskType = taskType,
        temperatureReadings = 0,
    )

    /** The two box types of the section, with one product each so a chip can be found by its name. */
    private val pequenas = category(
        id = 9,
        namePt = "Caixas pequenas",
        parentCategoryId = 8,
        categoryType = CategoriesResponseCategoriesInner.CategoryType.check_normal,
        tasks = listOf(
            productTask(58, 9, "Caixas do dia", ReportCategoryTasksInner.TaskType.check_normal),
        ),
    )
    private val assai = category(
        id = 10,
        namePt = "Caixas Assai",
        parentCategoryId = 8,
        categoryType = CategoriesResponseCategoriesInner.CategoryType.check_assai,
        tasks = listOf(
            productTask(61, 10, "Caixas Assai do dia", ReportCategoryTasksInner.TaskType.check_assai),
        ),
    )
    private val montagem = category(id = 8, namePt = "Montagem das Caixas")

    private val offers = ProductsResponse(
        assai = listOf(ProductsResponse.Assai.Rolo_2kg),
        normal = listOf(ProductsResponse.Normal.Nhoque_400g),
    )

    private fun render(
        form: ReportFormState,
        readOnly: Boolean = false,
        onBoxTypeChange: (Int, Boolean) -> Unit = { _, _ -> },
        onProductToggle: (Int, String, Boolean) -> Unit = { _, _, _ -> },
    ) {
        composeRule.setContent {
            TrindadeTheme {
                Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                    CategoryForm(
                        category = montagem,
                        children = listOf(pequenas, assai),
                        form = form,
                        readOnly = readOnly,
                        onCheckChange = { _, _ -> },
                        onProductToggle = onProductToggle,
                        onTemperatureChange = { _, _, _ -> },
                        onBoxTypeChange = onBoxTypeChange,
                    )
                }
            }
        }
    }

    /**
     * The switch row of one box type, found by the name it draws.
     *
     * The label is merged into the row's own node, which is the one that carries the toggle state and
     * the 48 dp target, so the text is also what a screen reader announces as the switch's name.
     */
    private fun switchOf(name: String) = composeRule.onNodeWithText(name)

    @Test
    fun `each box type has its own switch, and both are on before the operator answers`() {
        render(ReportFormState(offers = offers))

        switchOf("Caixas pequenas").performScrollTo().assertIsDisplayed().assertIsOn()
        switchOf("Caixas Assai").performScrollTo().assertIsDisplayed().assertIsOn()
    }

    @Test
    fun `switching a type off reports the category it belongs to and leaves the other type markable`() {
        val reported = mutableListOf<Pair<Int, Boolean>>()
        render(ReportFormState(offers = offers), onBoxTypeChange = { id, enabled -> reported += id to enabled })

        switchOf("Caixas Assai").performScrollTo().performClick()
        composeRule.waitForIdle()

        assertEquals(listOf(10 to false), reported)

        // The other type is still a type of this report: its switch is on and nothing under it is greyed.
        switchOf("Caixas pequenas").performScrollTo().assertIsOn()
    }

    /**
     * The claim the switch exists for: a type that is off cannot report a box.
     *
     * The two chips are tapped in the same form so the difference between them is the switch alone. The
     * disabled one is found by the product's own name, which is the label the chip draws.
     */
    @Test
    fun `a type switched off reports nothing when its product is tapped, and the other type still does`() {
        val reported = mutableListOf<Triple<Int, String, Boolean>>()
        render(
            form = ReportFormState(offers = offers, disabledBoxTypeIds = setOf(10)),
            onProductToggle = { taskId, product, chosen -> reported += Triple(taskId, product, chosen) },
        )

        switchOf("Caixas Assai").performScrollTo().assertIsOff()
        composeRule.onNodeWithText("Rolo 2kg").performScrollTo().performClick()
        composeRule.waitForIdle()

        assertEquals("A box type switched off must report no box", emptyList<Triple<Int, String, Boolean>>(), reported)

        composeRule.onNodeWithText("Nhoque 400g").performScrollTo().performClick()
        composeRule.waitForIdle()

        assertEquals(listOf(Triple(58, "Nhoque 400g", true)), reported)
    }

    @Test
    fun `a report that may not be edited cannot switch a type back on`() {
        render(ReportFormState(offers = offers, disabledBoxTypeIds = setOf(10)), readOnly = true)

        switchOf("Caixas Assai").performScrollTo().assertIsOff().assertIsNotEnabled()
    }
}
