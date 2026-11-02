package com.trindade.app.loading

import java.time.LocalDate
import java.time.ZoneId

/**
 * Today in São Paulo, not on the device.
 *
 * The schedule belongs to a day, and a phone with the wrong timezone would otherwise open the previous or
 * next day's grid -- showing an empty screen for a day that has entries, or worse, inviting an operator
 * to add one that already exists. The dashboard's card needs the same answer to choose between the grid
 * that is today's and the day it names, and one rule in one place is what keeps the two from disagreeing:
 * a second copy is a second answer at midnight, which is exactly when the screens are being used.
 *
 * Not covered by a test: asserting this needs a clock the callers accept as a parameter, which is a
 * change to the code rather than to the test. Recorded rather than papered over.
 */
fun saoPauloToday(): String = LocalDate.now(ZoneId.of("America/Sao_Paulo")).toString()

/**
 * Whether the day is in the past, which on a loading day is when it stops accepting writes.
 *
 * `date < today` and not `date != today`, which is the rule the server itself applies: a day before today
 * is history and is refused, and a day after it is still a draft that the routes accept. It takes `today`
 * as a parameter rather than reading the clock so the caller decides which day is being measured, which
 * is what lets the view model be tested against a fixed calendar.
 */
fun isClosedDay(date: String, today: String): Boolean = date < today
