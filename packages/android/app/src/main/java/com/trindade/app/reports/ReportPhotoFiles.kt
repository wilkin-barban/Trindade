package com.trindade.app.reports

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.net.URL
import java.security.MessageDigest
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Las fotos de un reporte, como archivos que la hoja nativa puede mandar con el texto.
 *
 * La tarjeta de compartir ya las dibuja como miniaturas; esto las baja para que viajen de verdad. Se usa la URL
 * pública, que no necesita sesión: una privada obligaría a llevar el token hasta el cargador, y una foto que no se
 * puede bajar no puede impedir que el mensaje salga.
 *
 * Es una clase abierta para que un test la sustituya sin red: el ViewModel la recibe opcional, y sin una las fotos
 * simplemente no viajan.
 */
interface ReportPhotoFiles {
    /** Descarga cada URL a `cacheDir` y devuelve las que llegaron; las que fallan se omiten. */
    suspend fun download(urls: List<String>): List<File>
}

/**
 * La implementación de Android: archivos en `cacheDir`, en IO.
 *
 * Se enlaza como interfaz para que el ViewModel pueda probarse sin contexto ni red, igual que el compresor de fotos.
 */
class HttpReportPhotoFiles @Inject constructor(
    @ApplicationContext private val context: Context,
) : ReportPhotoFiles {
    override suspend fun download(urls: List<String>): List<File> = withContext(Dispatchers.IO) {
        urls.mapNotNull { url ->
            runCatching {
                val target = File(context.cacheDir, "share-photo-${url.hashCode()}.jpg")
                if (!target.exists() || target.length() == 0L) {
                    URL(url).openStream().use { input -> target.outputStream().use { output -> input.copyTo(output) } }
                }
                target.takeIf { it.length() > 0 }
            }.getOrNull()
        }
    }
}
