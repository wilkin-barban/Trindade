package com.trindade.app.ui.components

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.ui.theme.TrindadeTheme
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PhotoThumbnailsTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `when LocalPhotoByteLoader returns null RemoteThumbnail does not fall back to URL openStream`() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(200).setBody("ok"))
        server.start()
        try {
            val targetUrl = server.url("/photo.jpg").toString()
            val loaderCalls = AtomicInteger(0)
            composeRule.setContent {
                TrindadeTheme {
                    CompositionLocalProvider(
                        LocalPhotoByteLoader provides {
                            loaderCalls.incrementAndGet()
                            null
                        },
                    ) {
                        PhotoThumbnails(photos = listOf(targetUrl), testTagPrefix = "thumb")
                    }
                }
            }
            composeRule.waitUntil(3_000) { loaderCalls.get() == 1 }
            composeRule.waitForIdle()
            runBlocking { delay(50) }
            assertEquals(1, loaderCalls.get())
            assertEquals(0, server.requestCount)
        } finally {
            server.shutdown()
        }
    }
}
