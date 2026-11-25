package com.trindade.app.salida

import android.app.Activity
import android.content.Intent
import android.content.ClipData
import android.net.Uri
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.aero.AeroErpClient
import com.trindade.app.aero.AeroMirrorPort
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.contract.models.SalidaCatalogResponse
import com.trindade.app.contract.models.SalidaCreateResponseMovement
import com.trindade.app.contract.models.SalidaHistoryResponse
import com.trindade.app.contract.models.SalidaHistoryResponseDaysInner
import com.trindade.app.contract.models.SalidaListResponse
import com.trindade.app.contract.models.SalidaMovementReconciliation
import com.trindade.app.contract.models.SalidaMovementPhotosInner
import com.trindade.app.network.SalidaApi
import com.trindade.app.ui.theme.TrindadeTheme
import java.lang.reflect.Proxy
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertEquals
import java.io.File
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import retrofit2.Response

@RunWith(AndroidJUnit4::class)
@Config(sdk = [33], qualifiers = "w390dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SalidaHistoryPhotoPickerTest {
    @get:Rule
    val composeRule = createComposeRule()

    private inline fun <reified T> unusedPort(): T = Proxy.newProxyInstance(
        T::class.java.classLoader,
        arrayOf(T::class.java),
    ) { _, method, _ -> error("Unexpected call to ${method.name}") } as T

    private data class Fixture(val viewModel: SalidaViewModel, val uploads: MutableList<Int>)

    private fun fixture(
        secondMovementPhotos: Int = 0,
        rejectAtServerLimit: Boolean = false,
        photoClient: OkHttpClient? = null,
        manyPhotos: Boolean = false,
    ): Fixture {
        val date = SalidaViewModel.saoPauloDate()
        fun movement(id: Int) = SalidaCreateResponseMovement(
            id = id,
            movementDate = date,
            userId = 1,
            username = "operator",
            displayName = "Operator",
            createdAt = "${date}T09:00:00.000Z",
            items = emptyList(),
            photos = if (id == 8) (1..secondMovementPhotos).map { photoId ->
                SalidaMovementPhotosInner(
                    id = photoId, filePath = "photo-$photoId.jpg", fileSize = 3,
                    mimeType = "image/jpeg", url = "file:///nonexistent-photo-$photoId",
                    publicUrl = "file:///nonexistent-photo-$photoId", createdAt = "${date}T09:00:00.000Z",
                )
            } else emptyList(),
            totalUnits = 1,
            reconciliation = SalidaMovementReconciliation(
                status = SalidaMovementReconciliation.Status.pending,
                entLans = emptyList(),
                matchedItemIds = emptyList(),
            ),
            erp = null,
        )
        val movements = if (manyPhotos) (1..40).map { id ->
            movement(id).copy(photos = listOf(SalidaMovementPhotosInner(
                id = id, filePath = "photo-$id.jpg", fileSize = 3, mimeType = "image/jpeg",
                url = "file:///nonexistent-photo-$id", publicUrl = "file:///nonexistent-photo-$id",
                createdAt = "${date}T09:00:00.000Z",
            )))
        } else listOf(movement(7), movement(8))
        val uploads = Collections.synchronizedList(mutableListOf<Int>())
        val api = Proxy.newProxyInstance(
            SalidaApi::class.java.classLoader,
            arrayOf(SalidaApi::class.java),
        ) { _, method, args ->
            when (method.name) {
                "catalog" -> Response.success(SalidaCatalogResponse(products = emptyList()))
                "day" -> Response.success(SalidaListResponse(date = date, movements = movements))
                "history" -> Response.success(SalidaHistoryResponse(days = listOf(
                    SalidaHistoryResponseDaysInner(date = date, totalUnits = movements.size, movements = movements),
                )))
                "uploadPhoto" -> {
                    uploads.add(args[0] as Int)
                    if (rejectAtServerLimit) {
                        Response.error<Any>(409, """{"code":"SALIDA_PHOTO_LIMIT","error":"Limite de 3 fotos por movimento atingido."}""".toResponseBody("application/json".toMediaType()))
                    } else {
                        Response.success(Unit)
                    }
                }
                else -> error("Unexpected call to ${method.name}")
            }
        } as SalidaApi
        val repository = SalidaRepository(
            api = api,
            erpClient = AeroErpClient(Json),
            settings = unusedPort<AeroSettingsPort>(),
            outbox = SalidaOutboxStore(ApplicationProvider.getApplicationContext()),
            audit = SalidaAudit(unusedPort<AeroMirrorPort>()),
            photoClient = photoClient,
        )
        val compressor = object : com.trindade.app.reports.PhotoCompressor {
            override suspend fun compressToJpeg(path: String): ByteArray? = File(path).readBytes()
        }
        return Fixture(SalidaViewModel(repository, compressor = compressor), uploads)
    }

    private fun scrollToMovement(id: Int) {
        composeRule.onNodeWithTag("salida-history-list").performScrollToNode(hasTestTag("salida-movement-$id"))
    }

    private fun clickMovementPhoto(id: Int) {
        scrollToMovement(id)
        composeRule.onAllNodes(
            hasTestTag("salida-photo-picker") and hasAnyAncestor(hasTestTag("salida-movement-$id")),
            useUnmergedTree = true,
        )[0].performClick()
        // Agregar una foto tiene dos puertas, como la web: estos casos recorren la del carrete.
        composeRule.onNodeWithTag("salida-photo-gallery").performClick()
    }

    @Test
    fun fortyPhotoCardsLoadAtMostTwelveBeforeScrolling() {
        val calls = AtomicInteger(0)
        val first = CountDownLatch(1)
        val thirteenth = CountDownLatch(13)
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            calls.incrementAndGet()
            first.countDown()
            thirteenth.countDown()
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1)
                .code(404).message("Not Found").body("".toResponseBody(null)).build()
        }.build()
        val fixture = fixture(photoClient = client, manyPhotos = true)
        composeRule.setContent {
            TrindadeTheme { SalidaHistoryScreen(viewModel = fixture.viewModel, viewerUsername = "operator") }
        }
        composeRule.waitUntil(timeoutMillis = 10_000) { fixture.viewModel.state.value.history.isNotEmpty() }
        composeRule.waitForIdle()
        org.junit.Assert.assertTrue("Debe cargar al menos la primera foto visible", first.await(10, TimeUnit.SECONDS))
        org.junit.Assert.assertFalse("No deben cargar más de 12 miniaturas antes de desplazar", thirteenth.await(2, TimeUnit.SECONDS))
        org.junit.Assert.assertTrue("Se cargaron ${calls.get()} miniaturas", calls.get() <= 12)
    }

    @Test
    fun secondMovementPhotoActionOpensSystemPicker() {
        val viewModel = fixture().viewModel
        lateinit var activity: Activity
        composeRule.setContent {
            activity = LocalContext.current as Activity
            TrindadeTheme { SalidaHistoryScreen(viewModel = viewModel, viewerUsername = "operator") }
        }
        composeRule.waitUntil(timeoutMillis = 10_000) { viewModel.state.value.history.isNotEmpty() }

        // Tocar la acción de la segunda tarjeta debe abrir el selector del sistema, no solo guardar su id.
        clickMovementPhoto(8)
        composeRule.waitForIdle()
        val launched: Intent? = shadowOf(activity).nextStartedActivity
        assertNotNull("La acción de foto del segundo movimiento debe abrir el selector", launched)
    }

    @Test
    fun movementWithThreePhotosDoesNotOfferAnotherPhoto() {
        val fixture = fixture(secondMovementPhotos = 3)
        composeRule.setContent {
            TrindadeTheme { SalidaHistoryScreen(viewModel = fixture.viewModel, viewerUsername = "operator") }
        }
        composeRule.waitUntil(timeoutMillis = 10_000) { fixture.viewModel.state.value.history.isNotEmpty() }
        // El segundo movimiento está compuesto, pero no ofrece selector con tres fotos.
        scrollToMovement(8)
        composeRule.onAllNodes(
            hasTestTag("salida-photo-picker") and hasAnyAncestor(hasTestTag("salida-movement-8")),
            useUnmergedTree = true,
        ).assertCountEquals(0)
    }

    @Test
    fun selectingMorePhotosThanRemainingCapacityDoesNotUploadAny() {
        val fixture = fixture(secondMovementPhotos = 2)
        lateinit var activity: ComponentActivity
        composeRule.setContent {
            activity = LocalContext.current as ComponentActivity
            TrindadeTheme { SalidaHistoryScreen(viewModel = fixture.viewModel, viewerUsername = "operator") }
        }
        composeRule.waitUntil(timeoutMillis = 10_000) { fixture.viewModel.state.value.history.isNotEmpty() }
        clickMovementPhoto(8)
        val selected = shadowOf(activity).nextStartedActivityForResult
        assertNotNull(selected)
        val first = Uri.fromFile(File(activity.cacheDir, "capacity-one.jpg").apply { writeBytes(byteArrayOf(1)) })
        val second = Uri.fromFile(File(activity.cacheDir, "capacity-two.jpg").apply { writeBytes(byteArrayOf(2)) })
        val clips = ClipData.newRawUri("photo", first).apply { addItem(ClipData.Item(second)) }
        composeRule.runOnIdle {
            activity.activityResultRegistry.dispatchResult(
                selected.requestCode, Activity.RESULT_OK, Intent().apply { clipData = clips },
            )
        }
        composeRule.waitUntil(timeoutMillis = 10_000) {
            shadowOf(Looper.getMainLooper()).idle()
            fixture.viewModel.state.value.notice != null
        }
        assertEquals(emptyList<Int>(), fixture.uploads.toList())
        val notice = fixture.viewModel.state.value.notice!!
        org.junit.Assert.assertTrue(notice.isError)
        assertEquals(com.trindade.app.R.string.salida_photo_limit_error, notice.localizedMessage?.resId)
    }

    @Test
    fun photoUsesBackendClientAndMissingImageIsExplained() {
        val paths = Collections.synchronizedList(mutableListOf<String>())
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            paths.add(chain.request().url.encodedPath)
            okhttp3.Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1)
                .code(404).message("Not Found").body("".toResponseBody(null)).build()
        }.build()
        val fixture = fixture(secondMovementPhotos = 1, photoClient = client)
        composeRule.setContent {
            TrindadeTheme { SalidaHistoryScreen(viewModel = fixture.viewModel, viewerUsername = "operator") }
        }
        composeRule.waitUntil(timeoutMillis = 10_000) { fixture.viewModel.state.value.history.isNotEmpty() }
        scrollToMovement(8)
        composeRule.waitUntil(timeoutMillis = 10_000) {
            shadowOf(Looper.getMainLooper()).idle()
            paths.isNotEmpty()
        }
        assertEquals(listOf("/api/salida/photos/1"), paths.toList())
        composeRule.waitUntil(timeoutMillis = 10_000) {
            shadowOf(Looper.getMainLooper()).idle()
            composeRule.onAllNodesWithText("Foto indisponível").fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun serverPhotoLimitRejectionExplainsTheLimit() {
        val fixture = fixture(rejectAtServerLimit = true)
        composeRule.setContent {
            TrindadeTheme { SalidaHistoryScreen(viewModel = fixture.viewModel, viewerUsername = "operator") }
        }
        composeRule.waitUntil(timeoutMillis = 10_000) { fixture.viewModel.state.value.history.isNotEmpty() }
        composeRule.runOnIdle { fixture.viewModel.attachPhoto(8, byteArrayOf(1, 2, 3)) }
        composeRule.waitUntil(timeoutMillis = 10_000) { fixture.uploads.isNotEmpty() }
        composeRule.waitUntil(timeoutMillis = 10_000) {
            shadowOf(Looper.getMainLooper()).idle()
            fixture.viewModel.state.value.notice != null
        }
        val notice = fixture.viewModel.state.value.notice!!
        org.junit.Assert.assertTrue(notice.isError)
        assertEquals(com.trindade.app.R.string.salida_photo_limit_error, notice.localizedMessage?.resId)
        composeRule.onNodeWithText(
            ApplicationProvider.getApplicationContext<android.content.Context>()
                .getString(com.trindade.app.R.string.salida_photo_limit_error),
        ).assertExists()
    }

    @Test
    @Config(qualifiers = "pt-rBR-w390dp-h800dp-xhdpi")
    fun photoUploadSuccessIsShownInPortuguese() {
        val fixture = fixture(secondMovementPhotos = 2)
        lateinit var activity: ComponentActivity
        composeRule.setContent {
            activity = LocalContext.current as ComponentActivity
            TrindadeTheme { SalidaHistoryScreen(viewModel = fixture.viewModel, viewerUsername = "operator") }
        }
        composeRule.waitUntil(timeoutMillis = 10_000) { fixture.viewModel.state.value.history.isNotEmpty() }
        clickMovementPhoto(8)
        val selected = shadowOf(activity).nextStartedActivityForResult
        assertNotNull(selected)
        val file = File(activity.cacheDir, "picker-success.jpg").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        composeRule.runOnIdle {
            activity.activityResultRegistry.dispatchResult(
                selected.requestCode, Activity.RESULT_OK, Intent().setData(Uri.fromFile(file)),
            )
        }
        composeRule.waitUntil(timeoutMillis = 10_000) { fixture.uploads.isNotEmpty() }
        assertEquals(listOf(8), fixture.uploads.toList())
        // El upload se registra en Dispatchers.IO antes de que su continuación vuelva al Main de Robolectric.
        // Avanzar explícitamente ese looper permite observar el estado posterior, no solo la llamada al fake.
        composeRule.waitUntil(timeoutMillis = 10_000) {
            shadowOf(Looper.getMainLooper()).idle()
            fixture.viewModel.state.value.notice != null
        }
        composeRule.onNodeWithText("Foto salva.").assertExists()
    }

    @Test
    fun pickerCancellationDoesNotUploadAndSelectedPhotoTargetsSecondMovement() {
        val fixture = fixture()
        lateinit var activity: ComponentActivity
        composeRule.setContent {
            activity = LocalContext.current as ComponentActivity
            TrindadeTheme { SalidaHistoryScreen(viewModel = fixture.viewModel, viewerUsername = "operator") }
        }
        composeRule.waitUntil(timeoutMillis = 10_000) { fixture.viewModel.state.value.history.isNotEmpty() }

        clickMovementPhoto(7)
        val cancelled = shadowOf(activity).nextStartedActivityForResult
        assertNotNull(cancelled)
        composeRule.runOnIdle {
            activity.activityResultRegistry.dispatchResult(cancelled.requestCode, Activity.RESULT_CANCELED, null)
        }
        composeRule.waitForIdle()
        assertEquals(emptyList<Int>(), fixture.uploads.toList())

        clickMovementPhoto(8)
        val selected = shadowOf(activity).nextStartedActivityForResult
        assertNotNull(selected)
        val file = File(activity.cacheDir, "picker-test.jpg").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        composeRule.runOnIdle {
            activity.activityResultRegistry.dispatchResult(
                selected.requestCode, Activity.RESULT_OK, Intent().setData(Uri.fromFile(file)),
            )
        }
        composeRule.waitUntil(timeoutMillis = 10_000) { fixture.uploads.isNotEmpty() }
        assertEquals(listOf(8), fixture.uploads.toList())
    }
}
