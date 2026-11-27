package com.trindade.app.reports

import android.content.Context
import androidx.core.content.FileProvider
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HttpReportPhotoFilesTest {

    private lateinit var context: Context
    private lateinit var backendServer: MockWebServer
    private lateinit var publicServer: MockWebServer

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        backendServer = MockWebServer()
        publicServer = MockWebServer()
        backendServer.start()
        publicServer.start()
        File(context.cacheDir, "exports/share-photos").deleteRecursively()
        clearFileProviderCache()
    }

    @After
    fun tearDown() {
        backendServer.shutdown()
        publicServer.shutdown()
        File(context.cacheDir, "exports/share-photos").deleteRecursively()
        clearFileProviderCache()
    }

    private fun clearFileProviderCache() {
        runCatching {
            val field = FileProvider::class.java.getDeclaredField("sCache")
            field.isAccessible = true
            (field.get(null) as? MutableMap<*, *>)?.clear()
        }
    }

    @Test
    fun `downloads land inside exports share-photos for FileProvider and detect PNG extension`() = runTest {
        val pngBytes = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 1, 2, 3)
        publicServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "image/png")
                .setBody(Buffer().write(pngBytes)),
        )
        val backendClient = OkHttpClient.Builder()
            .addInterceptor { chain ->
                chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer secret-jwt").build())
            }
            .build()
        val publicClient = OkHttpClient()
        val downloader = HttpReportPhotoFiles(
            context = context,
            backendClient = backendClient,
            publicClient = publicClient,
            apiBaseUrl = backendServer.url("/").toString(),
        )

        val files = downloader.download(listOf(publicServer.url("/p/tok1").toString()))

        assertEquals(1, files.size)
        val file = files.single()
        assertTrue(file.canonicalPath.contains("/exports/share-photos/"))
        assertTrue(file.name.endsWith(".png"))
        assertEquals(pngBytes.toList(), file.readBytes().toList())

        // Third-party/public URL must never receive the backend JWT header.
        val req = publicServer.takeRequest()
        assertEquals(null, req.getHeader("Authorization"))

        // FileProvider resolves the cached file URI cleanly without throwing IllegalArgumentException.
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        assertTrue(uri.toString().startsWith("content://"))
    }

    @Test
    fun `expired publicUrl falls back to relative authenticated api route without leaking JWT externally`() = runTest {
        val jpegBytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte())
        publicServer.enqueue(MockResponse().setResponseCode(404))
        backendServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "image/jpeg")
                .setBody(Buffer().write(jpegBytes)),
        )

        val backendClient = OkHttpClient.Builder()
            .addInterceptor { chain ->
                chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer secret-jwt").build())
            }
            .build()
        val downloader = HttpReportPhotoFiles(
            context = context,
            backendClient = backendClient,
            publicClient = OkHttpClient(),
            apiBaseUrl = backendServer.url("/").toString(),
        )

        val files = downloader.downloadWithFallbacks(
            listOf(listOf(publicServer.url("/p/expired").toString(), "/api/reports/photos/77")),
        )

        assertEquals(1, files.size)
        assertTrue(files.single().name.endsWith(".jpg"))
        assertEquals(jpegBytes.toList(), files.single().readBytes().toList())

        val publicReq = publicServer.takeRequest()
        assertEquals(null, publicReq.getHeader("Authorization"))
        val backendReq = backendServer.takeRequest()
        assertEquals("/api/reports/photos/77", backendReq.path)
        assertEquals("Bearer secret-jwt", backendReq.getHeader("Authorization"))
    }

    @Test
    fun `backend client refuses cross-origin redirect on authenticated download`() = runTest {
        backendServer.enqueue(
            MockResponse()
                .setResponseCode(302)
                .setHeader("Location", publicServer.url("/evil").toString()),
        )
        publicServer.enqueue(MockResponse().setResponseCode(200).setBody("leaked"))

        val backendClient = OkHttpClient.Builder()
            .addInterceptor { chain ->
                chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer secret-jwt").build())
            }
            .build()
        val downloader = HttpReportPhotoFiles(
            context = context,
            backendClient = backendClient,
            publicClient = OkHttpClient(),
            apiBaseUrl = backendServer.url("/").toString(),
        )

        val files = downloader.download(listOf("/api/reports/photos/99"))

        assertTrue(files.isEmpty())
        assertEquals(0, publicServer.requestCount)
        assertFalse(File(context.cacheDir, "exports/share-photos").listFiles().orEmpty().any { it.length() > 0 })
    }
}
