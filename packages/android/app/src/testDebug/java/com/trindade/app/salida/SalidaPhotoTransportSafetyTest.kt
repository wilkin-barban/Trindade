package com.trindade.app.salida

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.BuildConfig
import com.trindade.app.aero.AeroErpClient
import com.trindade.app.aero.AeroMirrorPort
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.network.SalidaApi
import java.lang.reflect.Proxy
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(sdk = [33])
class SalidaPhotoTransportSafetyTest {
    private inline fun <reified T> unusedPort(): T = Proxy.newProxyInstance(
        T::class.java.classLoader, arrayOf(T::class.java),
    ) { _, method, _ -> error("Unexpected call to ${method.name}") } as T

    private fun repository(client: OkHttpClient) = SalidaRepository(
        api = unusedPort<SalidaApi>(),
        erpClient = AeroErpClient(Json),
        settings = unusedPort<AeroSettingsPort>(),
        outbox = SalidaOutboxStore(ApplicationProvider.getApplicationContext<Context>()),
        audit = SalidaAudit(unusedPort<AeroMirrorPort>()),
        photoClient = client,
    )

    @Test
    fun literalPhotoUrlPreservesRootPathWithoutQueryOrFragment() = runBlocking {
        val base = BuildConfig.API_BASE_URL.toHttpUrl()
        org.junit.Assume.assumeTrue(base.host == "example.test" && base.encodedPath.trimEnd('/') == "/root")
        var requested: String? = null
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            requested = chain.request().url.toString()
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1)
                .code(404).message("Not Found").body("".toResponseBody(null)).build()
        }.build()
        assertNull(repository(client).photoBytes(7))
        // Ejecutar con las cuatro bases /root con y sin barra, con query o fragmento (ver comandos del handoff).
        assertEquals("http://example.test/root/api/salida/photos/7", requested)
    }

    @Test
    fun noMoreThanThreePhotoRequestsAreInFlight() = runBlocking {
        val active = AtomicInteger(0)
        val peak = AtomicInteger(0)
        val firstThree = CountDownLatch(3)
        val fourth = CountDownLatch(4)
        val release = CountDownLatch(1)
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            val current = active.incrementAndGet()
            peak.updateAndGet { previous -> maxOf(previous, current) }
            firstThree.countDown()
            fourth.countDown()
            try {
                check(release.await(10, TimeUnit.SECONDS)) { "La prueba no liberó las peticiones" }
                okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1)
                    .code(404).message("Not Found").body("".toResponseBody(null)).build()
            } finally {
                active.decrementAndGet()
            }
        }.build()
        val repository = repository(client)
        val jobs = (1..12).map { id -> async(Dispatchers.IO) { repository.photoBytes(id) } }
        try {
            assertTrue("Deben iniciarse tres cargas", firstThree.await(10, TimeUnit.SECONDS))
            assertFalse("No debe iniciarse una cuarta carga mientras hay tres en vuelo", fourth.await(1, TimeUnit.SECONDS))
            assertTrue("El máximo de cargas simultáneas debe ser tres", peak.get() <= 3)
        } finally {
            release.countDown()
            jobs.awaitAll()
        }
    }

    @Test
    fun photoUrlResolvesAgainstConfiguredBaseWithoutQueryOrFragment() = runBlocking {
        var requested: okhttp3.HttpUrl? = null
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            requested = chain.request().url
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1)
                .code(404).message("Not Found").body("".toResponseBody(null)).build()
        }.build()
        assertNull(repository(client).photoBytes(7))
        val base = BuildConfig.API_BASE_URL.toHttpUrl()
        val expected = base.newBuilder().encodedPath(base.encodedPath.trimEnd('/') + "/api/salida/photos/7")
            .query(null).fragment(null).build()
        assertEquals(expected, requested)
        assertNull(requested!!.query)
        assertNull(requested!!.fragment)
    }

    @Test
    fun transportAcceptsExactlyFiveMebibytes() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val bytes = ByteArray(5 * 1024 * 1024) { 1 }
            server.enqueue(MockResponse().setResponseCode(200).setBody(Buffer().write(bytes)))
            val client = OkHttpClient.Builder().addInterceptor { chain ->
                chain.proceed(chain.request().newBuilder().url(server.url(chain.request().url.encodedPath)).build())
            }.build()
            // Es un test del límite del transporte; la validación de imagen corresponde al decodificador.
            assertEquals(bytes.size, repository(client).photoBytes(7)?.size)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun oversizedPhotoResponseIsRejected() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val bytes = ByteArray(5 * 1024 * 1024 + 1) { 1 }
            server.enqueue(MockResponse().setResponseCode(200).setBody(Buffer().write(bytes)))
            val client = OkHttpClient.Builder().addInterceptor { chain ->
                val local = server.url(chain.request().url.encodedPath)
                chain.proceed(chain.request().newBuilder().url(local).build())
            }.build()
            assertNull("Una respuesta mayor a 5 MiB no debe cargarse", repository(client).photoBytes(7))
            assertEquals(1, server.requestCount)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun chunkedOversizedPhotoResponseIsRejected() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val bytes = ByteArray(5 * 1024 * 1024 + 1) { 1 }
            server.enqueue(MockResponse().setResponseCode(200).setChunkedBody(Buffer().write(bytes), 8192))
            val client = OkHttpClient.Builder().addInterceptor { chain ->
                chain.proceed(chain.request().newBuilder().url(server.url(chain.request().url.encodedPath)).build())
            }.build()
            assertNull("El límite también se aplica sin Content-Length", repository(client).photoBytes(7))
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun sameOriginRedirectIsNotFollowed() = runBlocking {
        val origin = MockWebServer()
        origin.start()
        try {
            origin.enqueue(MockResponse().setResponseCode(302).setHeader("Location", origin.url("/next")))
            origin.enqueue(MockResponse().setResponseCode(200).setBody("not an image"))
            val client = OkHttpClient.Builder().addInterceptor { chain ->
                chain.proceed(chain.request().newBuilder()
                    .url(origin.url(chain.request().url.encodedPath))
                    .header("Authorization", "Bearer test-only").build())
            }.build()
            assertNull(repository(client).photoBytes(7))
            assertEquals("Bearer test-only", origin.takeRequest().getHeader("Authorization"))
            assertNull("No se debe seguir redirección en el mismo origen", origin.takeRequest(1, java.util.concurrent.TimeUnit.SECONDS))
        } finally {
            origin.shutdown()
        }
    }

    @Test
    fun redirectAfterAuthenticationRetryIsNotFollowed() = runBlocking {
        val origin = MockWebServer()
        origin.start()
        try {
            origin.enqueue(MockResponse().setResponseCode(401))
            origin.enqueue(MockResponse().setResponseCode(302).setHeader("Location", origin.url("/next")))
            origin.enqueue(MockResponse().setResponseCode(200).setBody("not an image"))
            val client = OkHttpClient.Builder()
                .addInterceptor { chain ->
                    chain.proceed(chain.request().newBuilder().url(origin.url(chain.request().url.encodedPath)).build())
                }
                .addInterceptor { chain ->
                    val first = chain.proceed(chain.request())
                    if (first.code == 401) {
                        first.close()
                        chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer test-only").build())
                    } else first
                }.build()
            assertNull(repository(client).photoBytes(7))
            assertNull(origin.takeRequest().getHeader("Authorization"))
            assertEquals("Bearer test-only", origin.takeRequest().getHeader("Authorization"))
            assertNull("El reintento tampoco debe seguir redirecciones", origin.takeRequest(1, java.util.concurrent.TimeUnit.SECONDS))
        } finally {
            origin.shutdown()
        }
    }

    @Test
    fun crossOriginRedirectDoesNotSendAuthorizationToOtherOrigin() = runBlocking {
        val origin = MockWebServer()
        val other = MockWebServer()
        origin.start()
        other.start()
        try {
            origin.enqueue(MockResponse().setResponseCode(302).setHeader("Location", other.url("/foreign")))
            other.enqueue(MockResponse().setResponseCode(200).setBody("not an image"))
            val client = OkHttpClient.Builder().addInterceptor { chain ->
                val request = chain.request().newBuilder()
                    .url(origin.url(chain.request().url.encodedPath))
                    .header("Authorization", "Bearer test-only")
                    .build()
                chain.proceed(request)
            }.build()
            repository(client).photoBytes(7)
            assertEquals("Bearer test-only", origin.takeRequest().getHeader("Authorization"))
            val redirected = other.takeRequest(1, java.util.concurrent.TimeUnit.SECONDS)
            assertNull("La miniatura no debe seguir redirecciones a otro origen", redirected)
        } finally {
            origin.shutdown()
            other.shutdown()
        }
    }
}
