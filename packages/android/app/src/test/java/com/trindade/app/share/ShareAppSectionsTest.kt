package com.trindade.app.share

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The blocks of Compartilhar App, and the width rule they now share with the rest of the app.
 *
 * A `Card` with no modifier is as wide as what is inside it, so the WhatsApp field, the message preview and
 * the platform picker each came out a different width on the same screen -- and the preview, whose content is
 * one short paragraph, came out narrower than the field above it. The screen draws its blocks as sections now,
 * which are full width by construction. This test keeps it that way: a raw `Card` belongs in a component, not
 * in a screen that stacks blocks.
 */
class ShareAppSectionsTest {

    private val source: String by lazy {
        val file = File("src/main/java/com/trindade/app/share/ShareAppScreen.kt")
        assertTrue("ShareAppScreen.kt must be readable from the module directory", file.exists())
        file.readText()
    }

    @Test
    fun `compartilhar app draws its blocks as sections`() {
        assertFalse(
            "a raw Card in this screen is as wide as its content; stack SectionCard instead",
            Regex("""\bCard\s*\(""").containsMatchIn(source),
        )
        assertTrue(source.contains("SectionCard {"))
    }

    @Test
    fun `every block of the screen is a section`() {
        val blocks = Regex("""SectionCard\s*\{""").findAll(source).count()
        assertTrue("the screen stacks its platform, credentials and preview blocks as sections, saw $blocks", blocks >= 3)
    }
}
