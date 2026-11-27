package com.trindade.app.ui.components

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URL

/** Optional origin-safe thumbnail loader supplied by the host Activity; falls back to URL stream in unit tests. */
val LocalPhotoByteLoader = staticCompositionLocalOf<(suspend (String) -> ByteArray?)?> { null }

/** El tamaño de una miniatura: el mismo en todas las superficies de compartir. */
val PhotoThumbnailSize = 56.dp

/**
 * Las fotos que viajan con un mensaje, como miniaturas de solo lectura.
 *
 * No hay librería de imágenes en la app y no se agrega una por esto: la miniatura se decodifica con
 * `BitmapFactory` a partir de la URL pública de la foto, en un hilo de IO, y mientras no está -- o si falla -- queda
 * un rectángulo del color de la superficie. Nunca es un botón: la tarjeta comparte, y borrar fotos es de su pantalla.
 *
 * La lista se dibuja en una fila con scroll horizontal: tres o cuatro fotos entran en un teléfono, y una fila que
 * envolviera empujaría el texto hacia abajo justo donde el operario va a leerlo.
 */
@Composable
fun PhotoThumbnails(
    photos: List<String>,
    modifier: Modifier = Modifier,
    testTagPrefix: String,
) {
    if (photos.isEmpty()) return

    LazyRow(
        modifier = modifier.testTag("$testTagPrefix-photos"),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        itemsIndexed(photos) { index, url ->
            RemoteThumbnail(url = url, tag = "$testTagPrefix-photo-$index")
        }
    }
}

/**
 * Una miniatura, con la imagen si el dispositivo pudo leerla y un rectángulo si no.
 *
 * La lectura es best-effort a propósito: una foto que no carga no puede romper el mensaje que la acompaña, y un
 * test sin red ve el rectángulo, que es lo que el operario vería en el peor caso.
 */
@Composable
private fun RemoteThumbnail(url: String, tag: String) {
    val byteLoader = LocalPhotoByteLoader.current
    var bitmap by remember(url, byteLoader) { mutableStateOf<ImageBitmap?>(null) }

    LaunchedEffect(url, byteLoader) {
        bitmap = withContext(Dispatchers.IO) {
            runCatching {
                if (byteLoader != null) {
                    val bytes = byteLoader.invoke(url) ?: return@runCatching null
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                } else {
                    URL(url).openStream().use { stream -> BitmapFactory.decodeStream(stream)?.asImageBitmap() }
                }
            }.getOrNull()
        }
    }

    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier = Modifier
            .size(PhotoThumbnailSize)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .testTag(tag),
    ) {
        bitmap?.let { image ->
            Image(
                bitmap = image,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(PhotoThumbnailSize),
            )
        }
    }
}
