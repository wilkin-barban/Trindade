package com.trindade.app.reports

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.trindade.app.R
import java.io.File
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.launch

private val pickedPhotoSequence = AtomicLong(0L)

/**
 * Copia una URI de galería a un archivo temporal propio en caché con nombre único por selección.
 */
internal fun stagePickedPhoto(
    context: Context,
    uri: Uri,
    prefix: String = "report-",
): String? = runCatching {
    val target = File(
        context.cacheDir,
        "$prefix${System.currentTimeMillis()}-${pickedPhotoSequence.incrementAndGet()}.jpg",
    )
    val copied = context.contentResolver.openInputStream(uri)?.use { input ->
        target.outputStream().use { output -> input.copyTo(output) }
    } ?: return null
    if (copied <= 0L) {
        target.delete()
        return null
    }
    target.absolutePath
}.getOrNull()

/**
 * Diálogo compartido para elegir entre sacar una foto con la cámara o seleccionar de la galería.
 */
@Composable
fun PhotoSourceChooserDialog(
    title: String,
    prompt: String,
    onTakePhoto: () -> Unit,
    onPickFromGallery: () -> Unit,
    onDismiss: () -> Unit,
    cameraButtonTag: String = "report-photo-camera",
    galleryButtonTag: String = "report-photo-gallery",
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(prompt) },
        confirmButton = {
            TextButton(
                onClick = onTakePhoto,
                modifier = Modifier
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag(cameraButtonTag),
            ) {
                Text(stringResource(R.string.salida_photo_take))
            }
        },
        dismissButton = {
            TextButton(
                onClick = onPickFromGallery,
                modifier = Modifier
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag(galleryButtonTag),
            ) {
                Text(stringResource(R.string.salida_photo_gallery))
            }
        },
    )
}

/**
 * Selector reutilizable con dos puertas (cámara por `TakePicture` + galería) que devuelve la acción
 * para abrir el diálogo compartido.
 */
@Composable
fun rememberDualPhotoPicker(
    title: String,
    prompt: String,
    maxGalleryItems: Int = 1,
    cameraButtonTag: String = "report-photo-camera",
    galleryButtonTag: String = "report-photo-gallery",
    onCameraCaptured: (File) -> Unit,
    onGalleryPicked: (List<Uri>) -> Unit,
): () -> Unit {
    val context = LocalContext.current
    var showChooser by remember { mutableStateOf(false) }
    var pendingCapture by remember { mutableStateOf<File?>(null) }

    val capturePhoto = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { saved ->
        val file = pendingCapture
        pendingCapture = null
        if (saved && file != null) onCameraCaptured(file)
    }

    val pickSingle = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) onGalleryPicked(listOf(uri))
    }

    val pickMultiple = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(maxGalleryItems.coerceAtLeast(2)),
    ) { uris ->
        if (uris.isNotEmpty()) onGalleryPicked(uris.take(maxGalleryItems))
    }

    if (showChooser) {
        PhotoSourceChooserDialog(
            title = title,
            prompt = prompt,
            cameraButtonTag = cameraButtonTag,
            galleryButtonTag = galleryButtonTag,
            onTakePhoto = {
                showChooser = false
                val file = newCaptureFile(context)
                pendingCapture = file
                capturePhoto.launch(
                    FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file),
                )
            },
            onPickFromGallery = {
                showChooser = false
                val request = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                if (maxGalleryItems <= 1) {
                    pickSingle.launch(request)
                } else {
                    pickMultiple.launch(request)
                }
            },
            onDismiss = { showChooser = false },
        )
    }

    return { showChooser = true }
}

/**
 * Selector dual Cámara + Galería compartido por creación y edición de reportes: captura o copia a caché,
 * comprime a JPEG y entrega cada foto comprimida al callback.
 */
@Composable
fun rememberCompressedReportPhotoPicker(
    maxPhotos: Int = MAX_PENDING_PHOTOS,
    onCompressed: (ByteArray) -> Unit,
): () -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val compressor = remember { AndroidPhotoCompressor() }
    return rememberDualPhotoPicker(
        title = stringResource(R.string.report_photo_chooser_title),
        prompt = stringResource(R.string.salida_photo_add),
        maxGalleryItems = maxPhotos,
        onCameraCaptured = { file ->
            scope.launch {
                val jpeg = compressor.compressToJpeg(file.absolutePath)
                if (jpeg != null) onCompressed(jpeg)
            }
        },
        onGalleryPicked = { uris ->
            uris.take(maxPhotos).forEach { uri ->
                scope.launch {
                    val staged = stagePickedPhoto(context, uri, prefix = "report-")
                    val jpeg = staged?.let { compressor.compressToJpeg(it) }
                    if (jpeg != null) onCompressed(jpeg)
                }
            }
        },
    )
}
