package com.trindade.app.reports

import com.trindade.app.contract.models.ReportHistoryResponse
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The history row as it arrives over the wire, decoded with the client's own configuration.
 *
 * The screen tests build the DTO directly, so they prove what is drawn once the flags are in hand and
 * nothing about whether the flags survive the trip. This test starts from the body the backend really
 * answers -- copied from production -- and pins the whole path: key names, the nullable booleans the
 * document declares as optional, and the rule that decides each action from them. Without it a wrong
 * `@SerialName`, or a field the contract stops emitting, would look exactly like a permission the
 * server withheld, which is the failure that made the missing reactivate unreadable from the outside.
 */
class ReportsHistoryDecodeTest {

    // Same configuration as the Retrofit converter: unknown keys are ignored, absent ones keep their
    // declared default, which for these five flags is null -- not permission.
    private val json = Json { ignoreUnknownKeys = true }

    /** A retired report of a past day, as the backend serves it after the erasing rule was narrowed. */
    private val retiredPastReport = """
        {
          "items": [
            {
              "id": 69,
              "turno": "tarde",
              "report_date": "2026-10-30",
              "notes": "Tudo separado e tudo fechado",
              "created_at": "2026-10-30 21:50:17",
              "isActive": false,
              "isClosedDay": false,
              "readOnly": true,
              "canEdit": false,
              "canDeactivate": false,
              "canDelete": false,
              "canActivate": true,
              "user": { "id": 1, "display_name": "Wilkin" }
            }
          ],
          "pagination": { "page": 1, "pageSize": 2, "total": 1, "totalPages": 1 }
        }
    """.trimIndent()

    @Test
    fun `a retired report of a past day keeps its activate flag and loses every other action`() {
        val item = json.decodeFromString<ReportHistoryResponse>(retiredPastReport).items.single()

        assertTrue("the row is retired", item.isActive == false)
        assertTrue("decoding keeps canActivate", item.canActivate == true)
        assertTrue("reactivate is offered", offersActivate(item))
        assertFalse("a past day cannot be erased", offersDelete(item))
        assertFalse("a retired row cannot be retired again", offersDeactivate(item))
    }

    @Test
    fun `an active report of a past day offers retiring and never erasing`() {
        // The same body with the state flipped, which is what an administrator sees on a day the
        // plant already reported: the server keeps retiring open and withholds erasing.
        val body = retiredPastReport
            .replace("\"isActive\": false", "\"isActive\": true")
            .replace("\"canDeactivate\": false", "\"canDeactivate\": true")
            .replace("\"canActivate\": true", "\"canActivate\": false")

        val item = json.decodeFromString<ReportHistoryResponse>(body).items.single()

        assertTrue("retiring a live report of a past day stays available", offersDeactivate(item))
        assertFalse("reactivating a live report is not an action", offersActivate(item))
        assertFalse("erasing stays closed on a past day", offersDelete(item))
    }

    @Test
    fun `an absent flag is not a permission`() {
        // The document declares the five as optional, so a body without them has to decode and draw
        // no action rather than fail or default to allowed.
        val body = """
            {
              "items": [
                {
                  "id": 70,
                  "turno": "noite",
                  "report_date": "2026-11-02",
                  "notes": null,
                  "created_at": "2026-11-02 09:00:00",
                  "isActive": true,
                  "readOnly": false,
                  "user": { "id": 1, "display_name": "Wilkin" }
                }
              ],
              "pagination": { "page": 1, "pageSize": 2, "total": 1, "totalPages": 1 }
            }
        """.trimIndent()

        val item = json.decodeFromString<ReportHistoryResponse>(body).items.single()

        assertEquals(null, item.canActivate)
        assertFalse(offersActivate(item))
        assertFalse(offersDeactivate(item))
        assertFalse(offersDelete(item))
    }
}
