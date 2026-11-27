package com.trindade.app.reports

import android.content.Context
import com.trindade.app.BuildConfig
import com.trindade.app.di.NetworkModule.BackendClient
import com.trindade.app.di.NetworkModule.PublicFileClient
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.security.MessageDigest
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.Buffer

/** Upper bound for downloaded share/thumbnail images, matching upload safety bounds (5 MiB). */
private const val MAX_DOWNLOAD_PHOTO_BYTES: Long = 5L * 1024 * 1024
private const val SHARE_PHOTO_TTL_MS: Long = 24L * 60 * 60 * 1000

/** Ordered candidate URLs for one photo (`publicUrl` first, authenticated `url` fallback when present). */
internal fun photoCandidateUrls(publicUrl: String?, url: String?): List<String> =
    listOfNotNull(publicUrl?.takeIf { it.isNotBlank() }, url?.takeIf { it.isNotBlank() }).distinct()

internal data class DownloadedPhotoBytes(
    val bytes: ByteArray,
    val extension: String,
)

/**
 * Resolves relative URLs against [apiBaseUrl] and routes requests to [backendClient] (with redirects
 * disabled) only when hitting `/api/...` on the backend's own origin; everything else uses the
 * unauthenticated [publicClient] so bearer tokens never leak to external hosts or redirects.
 */
internal object PhotoDownloadTransport {
    fun normalizeBase(apiBaseUrl: String): HttpUrl? =
        apiBaseUrl.toHttpUrlOrNull()?.let { base ->
            base.newBuilder()
                .encodedPath(base.encodedPath.trimEnd('/') + "/")
                .query(null)
                .fragment(null)
                .build()
        }

    fun resolveUrl(rawUrl: String, normalizedBase: HttpUrl?): HttpUrl? {
        val trimmed = rawUrl.trim()
        if (trimmed.isEmpty()) return null
        if (trimmed.startsWith("http://", ignoreCase = true) || trimmed.startsWith("https://", ignoreCase = true)) {
            return trimmed.toHttpUrlOrNull()
        }
        if (trimmed.contains("://") || trimmed.startsWith("file:", ignoreCase = true)) {
            return null
        }
        return normalizedBase?.resolve(trimmed.trimStart('/'))
    }

    fun isAuthenticatedBackendTarget(target: HttpUrl, normalizedBase: HttpUrl?): Boolean {
        if (normalizedBase == null) return false
        val sameOrigin =
            target.scheme == normalizedBase.scheme &&
                target.host.equals(normalizedBase.host, ignoreCase = true) &&
                target.port == normalizedBase.port
        if (!sameOrigin) return false
        val apiPrefix = normalizedBase.encodedPath + "api/"
        return target.encodedPath.startsWith(apiPrefix) || target.encodedPath.startsWith("/api/")
    }

    suspend fun fetchBytes(
        rawUrl: String,
        apiBaseUrl: String,
        backendClient: OkHttpClient,
        publicClient: OkHttpClient,
    ): DownloadedPhotoBytes? = withContext(Dispatchers.IO) {
        val normalizedBase = normalizeBase(apiBaseUrl)
        val resolved = resolveUrl(rawUrl, normalizedBase) ?: return@withContext null
        val client = if (isAuthenticatedBackendTarget(resolved, normalizedBase)) {
            backendClient.newBuilder().followRedirects(false).followSslRedirects(false).build()
        } else {
            publicClient
        }
        runCatching {
            val request = Request.Builder().url(resolved).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val body = response.body
                if (body.contentLength() > MAX_DOWNLOAD_PHOTO_BYTES) return@use null
                val source = body.source()
                val buffer = Buffer()
                var total = 0L
                while (true) {
                    val read = source.read(buffer, minOf(8192L, MAX_DOWNLOAD_PHOTO_BYTES + 1 - total))
                    if (read == -1L) break
                    total += read
                    if (total > MAX_DOWNLOAD_PHOTO_BYTES) return@use null
                }
                val bytes = buffer.readByteArray()
                if (bytes.isEmpty()) return@use null
                DownloadedPhotoBytes(
                    bytes = bytes,
                    extension = detectExtension(response.header("Content-Type"), resolved.encodedPath),
                )
            }
        }.getOrNull()
    }

    private fun detectExtension(contentType: String?, path: String): String {
        val mime = contentType?.substringBefore(';')?.trim()?.lowercase()
        return when (mime) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            "image/heic" -> "heic"
            "image/heif" -> "heif"
            "image/gif" -> "gif"
            "image/jpeg", "image/jpg" -> "jpg"
            else -> when (path.substringAfterLast('.', "").lowercase()) {
                "png", "webp", "heic", "heif", "gif" -> path.substringAfterLast('.', "").lowercase()
                else -> "jpg"
            }
        }
    }
}

/**
 * Las fotos de un reporte o salida, como archivos que la hoja nativa puede mandar con el texto.
 */
interface ReportPhotoFiles {
    /** Descarga cada URL a la caché exportable y devuelve las que llegaron; las que fallan se omiten. */
    suspend fun download(urls: List<String>): List<File>

    /**
     * Descarga cada foto probando sus URLs candidatas en orden (p. ej. `publicUrl` y respaldo autenticado `url`).
     */
    suspend fun downloadWithFallbacks(candidates: List<List<String>>): List<File> =
        download(candidates.mapNotNull { options -> options.firstOrNull { it.isNotBlank() } })
}

/**
 * Descarga segura hacia `cacheDir/exports/share-photos`, dentro de las rutas expuestas por `file_paths.xml`.
 */
class HttpReportPhotoFiles internal constructor(
    private val context: Context,
    private val backendClient: OkHttpClient,
    private val publicClient: OkHttpClient,
    private val apiBaseUrl: String,
) : ReportPhotoFiles {

    @Inject
    constructor(
        @ApplicationContext context: Context,
        @BackendClient backendClient: OkHttpClient,
        @PublicFileClient publicClient: OkHttpClient,
    ) : this(context, backendClient, publicClient, BuildConfig.API_BASE_URL)

    override suspend fun download(urls: List<String>): List<File> =
        downloadWithFallbacks(urls.mapNotNull { url -> url.takeIf { it.isNotBlank() }?.let(::listOf) })

    override suspend fun downloadWithFallbacks(candidates: List<List<String>>): List<File> =
        withContext(Dispatchers.IO) {
            val directory = File(context.cacheDir, "exports/share-photos").apply { mkdirs() }
            pruneExpiredFiles(directory)
            candidates.mapNotNull { candidateUrls ->
                downloadFirstAvailable(directory, candidateUrls)
            }
        }

    private suspend fun downloadFirstAvailable(directory: File, urls: List<String>): File? {
        for (rawUrl in urls) {
            if (rawUrl.isBlank()) continue
            val downloaded = PhotoDownloadTransport.fetchBytes(rawUrl, apiBaseUrl, backendClient, publicClient)
                ?: continue
            val target = File(directory, "share-${sha256Prefix(rawUrl)}.${downloaded.extension}")
            val temp = File(directory, "${target.name}.tmp")
            val saved = runCatching {
                temp.writeBytes(downloaded.bytes)
                if (target.exists()) target.delete()
                if (!temp.renameTo(target)) temp.copyTo(target, overwrite = true).also { temp.delete() }
                target.takeIf { it.exists() && it.length() > 0L }
            }.getOrElse {
                temp.delete()
                null
            }
            if (saved != null) return saved
        }
        return null
    }

    private fun pruneExpiredFiles(directory: File) {
        val cutoff = System.currentTimeMillis() - SHARE_PHOTO_TTL_MS
        directory.listFiles()?.forEach { file ->
            if (file.isFile && file.lastModified() < cutoff) {
                file.delete()
            }
        }
    }

    private fun sha256Prefix(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return digest.take(12).joinToString("") { byte -> "%02x".format(byte) }
    }
}
