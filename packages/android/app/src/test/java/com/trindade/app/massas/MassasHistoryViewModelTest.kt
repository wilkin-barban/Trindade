package com.trindade.app.massas

import com.trindade.app.network.MassaHistoryDay
import com.trindade.app.network.MassasApi
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

class MassasHistoryViewModelTest {

    private lateinit var server: MockWebServer
    private lateinit var retrofit: Retrofit
    private lateinit var viewModel: MassasHistoryViewModel

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
        retrofit = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
        val massasApi = retrofit.create(MassasApi::class.java)
        val massasRepository = MassasRepository(massasApi)

        viewModel = MassasHistoryViewModel(massasRepository)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    /**
     * A repository whose read the test holds open, so the two events the screen produces -- a load that is
     * still running and a person opening the help dialog -- can be interleaved in a fixed order instead of
     * by luck.
     */
    private class GatedRepository(
        api: MassasApi,
        private val entered: CompletableDeferred<Unit>,
        private val release: CompletableDeferred<Unit>,
    ) : MassasRepository(api) {
        override suspend fun history(): List<MassaHistoryDay>? {
            entered.complete(Unit)
            release.await()
            return listOf(MassaHistoryDay("2026-11-04", 1, 1, 10, 1))
        }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun `a load that finishes after the dialog was opened keeps the dialog open`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val entered = CompletableDeferred<Unit>()
            val release = CompletableDeferred<Unit>()
            val gated = GatedRepository(retrofit.create(MassasApi::class.java), entered, release)

            val viewModel = MassasHistoryViewModel(gated)
            // The constructor starts the load; this runs it up to the moment it reads from the network, so
            // the first state write has already happened when the person taps the button.
            runCurrent()
            entered.await()
            assertTrue(viewModel.state.value.isLoading)

            viewModel.toggleHelpDialog(true)

            release.complete(Unit)
            advanceUntilIdle()

            // The load finished after the tap and still left it standing: the two fields are updated by
            // different events and compose instead of overwriting each other.
            assertTrue(viewModel.state.value.showHelpDialog)
            assertFalse(viewModel.state.value.isLoading)
            assertEquals(1, viewModel.state.value.days.size)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun toggleHelpDialog_updatesState() {
        assertFalse(viewModel.state.value.showHelpDialog)
        viewModel.toggleHelpDialog(true)
        assertTrue(viewModel.state.value.showHelpDialog)
        viewModel.toggleHelpDialog(false)
        assertFalse(viewModel.state.value.showHelpDialog)
    }
}
