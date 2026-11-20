package com.trindade.app.network

import com.trindade.app.contract.models.SalidaCatalogResponse
import com.trindade.app.contract.models.SalidaCreateRequest
import com.trindade.app.contract.models.SalidaCreateRequestItemsInner
import com.trindade.app.contract.models.SalidaCreateResponse
import com.trindade.app.contract.models.SalidaErpResultRequest
import com.trindade.app.contract.models.SalidaErpResultResponse
import com.trindade.app.contract.models.SalidaHistoryResponse
import com.trindade.app.contract.models.SalidaPhotoResponse
import com.trindade.app.contract.models.SalidaListResponse
import com.trindade.app.salida.SalidaLine
import com.trindade.app.salida.SalidaSelection
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * La superficie de la baja, como la usa este cliente.
 *
 * Escrita a mano como [com.trindade.app.network.ReportsApi], y por la misma razón: un cliente generado
 * expondría cada operación y fijaría formas de llamada que pertenecen a esta pantalla. Cada método
 * devuelve [Response] para que quien llama distinga un rechazo de una ausencia.
 *
 * La autoridad es el servidor: la baja está abierta a cualquier cuenta autenticada desde que la beta
 * terminó, y el invitado conserva su regla de solo lectura del lado del servidor.
 */
interface SalidaApi {

    /** Los diecinueve productos con su bloque, en el orden en que la pantalla los dibuja. */
    @GET("api/salida/catalog")
    suspend fun catalog(): Response<SalidaCatalogResponse>

    /** La baja queda en Trindade antes de salir hacia el ERP. */
    @POST("api/salida")
    suspend fun create(@Body body: SalidaCreateRequest): Response<SalidaCreateResponse>

    /** Las bajas de un día, que es lo que dibuja el lanzamiento al abrirse. */
    @GET("api/salida")
    suspend fun day(@Query("date") date: String): Response<SalidaListResponse>

    /** Los días con sus movimientos, del más nuevo al más viejo. */
    @GET("api/salida/history")
    suspend fun history(): Response<SalidaHistoryResponse>

    /** El veredicto del viaje al ERP, que el servidor guarda con la auditoría. */
    @POST("api/salida/{id}/erp-result")
    suspend fun recordErpResult(
        @Path("id") id: Int,
        @Body body: SalidaErpResultRequest,
    ): Response<SalidaErpResultResponse>

    /** Las fotos del movimiento, hasta tres. */
    @GET("api/salida/{id}/photos")
    suspend fun photos(@Path("id") id: Int): Response<com.trindade.app.contract.models.PhotosResponse>

    @Multipart
    @POST("api/salida/{id}/photos")
    suspend fun uploadPhoto(
        @Path("id") id: Int,
        @Part file: MultipartBody.Part,
    ): Response<SalidaPhotoResponse>

    /** Retira un borrador que el ERP todavía no confirmó. El servidor decide; la pantalla sólo ofrece. */
    @DELETE("api/salida/{movementId}")
    suspend fun deleteMovement(@Path("movementId") movementId: Int): Response<Unit>

    @DELETE("api/salida/photos/{photoId}")
    suspend fun deletePhoto(@Path("photoId") photoId: Int): Response<Unit>
}

/** El cuerpo del alta, armado desde la selección de la pantalla. */
fun SalidaSelection.toCreateRequest(): SalidaCreateRequest = SalidaCreateRequest(
    items = lines.map { SalidaCreateRequestItemsInner(code = it.code, quantity = it.quantity) },
)
