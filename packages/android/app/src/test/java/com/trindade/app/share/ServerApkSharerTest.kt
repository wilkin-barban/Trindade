package com.trindade.app.share

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.BuildConfig
import com.trindade.app.contract.models.DashboardSummary
import com.trindade.app.contract.models.LatestReleaseResponse
import com.trindade.app.contract.models.UserOptionsResponse
import com.trindade.app.contract.models.HealthResponse
import com.trindade.app.export.NoOpShareManager
import com.trindade.app.network.SystemApi
import com.trindade.app.update.UpdateDownloader
import java.io.IOException
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import retrofit2.Response

/**
 * Where the APK that Compartilhar App hands over comes from.
 *
 * Two things matter and both are regressions already paid for once: the address is the one *this*
 * deployment publishes, not a host baked into the binary, and the name is the one the release route reports
 * so the other phone gets a file it recognises instead of `download.bin`.
 */
@RunWith(AndroidJUnit4::class)
class ServerApkSharerTest {

    private val downloader = UpdateDownloader(OkHttpClient(), ApplicationProvider.getApplicationContext())

    private fun sharer(api: SystemApi) = ServerApkSharer(api, downloader, NoOpShareManager)

    @Test
    fun `the release route decides the address and the name`() = runTest {
        val api = FakeSystemApi(
            response = Response.success(
                release(apkUrl = "https://trindademasas.duckdns.org/api/app/download-apk", apkName = "trindade-0.7.0.apk"),
            ),
        )

        val location = sharer(api).location()

        assertEquals("https://trindademasas.duckdns.org/api/app/download-apk", location.url)
        assertEquals("trindade-0.7.0.apk", location.fileName)
    }

    @Test
    fun `an unreachable release route falls back to this build's own host, never to one baked in`() = runTest {
        val api = FakeSystemApi(failure = IOException("offline"))

        val location = sharer(api).location()

        assertTrue(
            "The fallback must be this deployment's host, saw ${location.url}",
            location.url.startsWith(BuildConfig.API_BASE_URL.trimEnd('/')),
        )
        assertTrue(location.url.endsWith("/api/app/download-apk"))
        assertEquals("trindade.apk", location.fileName)
    }

    @Test
    fun `a release route that answers without an address still yields this build's APK`() = runTest {
        val api = FakeSystemApi(
            response = Response.success(
                release(apkUrl = " ", apkName = ""),
            ),
        )

        val location = sharer(api).location()

        assertTrue(location.url.endsWith("/api/app/download-apk"))
        assertEquals("trindade.apk", location.fileName)
    }
}

private fun release(apkUrl: String, apkName: String) = LatestReleaseResponse(
    version = "0.7.0",
    apkUrl = apkUrl,
    apkName = apkName,
    apkSize = null,
    buildNumber = null,
    publishedAt = null,
    webUrl = "https://trindademasas.duckdns.org",
)

private class FakeSystemApi(
    private val response: Response<LatestReleaseResponse>? = null,
    private val failure: Throwable? = null,
) : SystemApi {
    override suspend fun latestRelease(): Response<LatestReleaseResponse> {
        failure?.let { throw it }
        return response ?: Response.error(500, "boom".toResponseBody(null))
    }

    override suspend fun dashboardSummary(): Response<DashboardSummary> = Response.error(500, "unused".toResponseBody(null))

    override suspend fun userOptions(): Response<UserOptionsResponse> = Response.error(500, "unused".toResponseBody(null))

    override suspend fun health(): Response<HealthResponse> = Response.error(500, "unused".toResponseBody(null))
}
