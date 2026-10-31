package com.trindade.app.admin

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Readiness is the three fields the ERP client uses.
 *
 * The operator code is a seat fallback the ERP resolves when a launch carries no operator of its own; it was
 * never part of "can this device talk to the plant", and the web never asked for it. The panel's action follows
 * the same rule, so a phone configured from the web without a code can still test and save.
 */
class IntegrationSettingsReadyTest {

    private fun state(
        wsUrl: String = "http://10.0.0.10:8080",
        username: String = "WILKIN",
        password: String = "pw",
        userCode: String = "",
    ) = IntegrationSettingsViewModel.UiState(
        wsUrl = wsUrl,
        username = username,
        password = password,
        userCode = userCode,
    )

    @Test
    fun `a configured bridge is ready with no operator code`() {
        assertTrue(state(userCode = "").ready)
        // And the stored code changes nothing either way: it is not one of the three.
        assertTrue(state(userCode = "1").ready)
    }

    @Test
    fun `the three fields the client uses are still required`() {
        assertFalse("sin dirección", state(wsUrl = "").ready)
        assertFalse("sin usuario", state(username = " ").ready)
        assertFalse("sin contraseña", state(password = "").ready)
    }
}
