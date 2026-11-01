package com.trindade.app.share

import com.trindade.app.BuildConfig
import com.trindade.app.export.ShareManager
import com.trindade.app.network.SystemApi
import com.trindade.app.update.DownloadState
import com.trindade.app.update.UpdateDownloader
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The published APK, fetched and handed to the platform's share sheet.
 *
 * A seam of its own rather than three collaborators in the view model, because the screen asks one question
 * -- "hand the app over" -- and the answer involves a route, a file of some megabytes and a chooser. Keeping
 * that behind one call lets the screen be asserted on what it reports and lets this be asserted on where the
 * bytes come from.
 */
interface ApkSharer {
    /**
     * Fetches this deployment's APK and shares it.
     *
     * @param onProgress reports how far the download got, in whole percent, or null while it is too early
     * to say.
     * @return true when the chooser was launched.
     */
    suspend fun share(onProgress: (Int?) -> Unit = {}): Boolean
}

/**
 * The production [ApkSharer]: the address the API publishes, downloaded into the cache directory the
 * provider exposes, then shared as an installable package.
 *
 * The file comes from the backend rather than from the package this app was installed as. An installed
 * binary lives under `/data/app`, which `file_paths.xml` deliberately does not expose, and what the operator
 * wants to send is something the other phone can install -- the same bytes the updater would install here.
 */
@Singleton
class ServerApkSharer @Inject constructor(
    private val systemApi: SystemApi,
    private val downloader: UpdateDownloader,
    private val shareManager: ShareManager,
) : ApkSharer {

    override suspend fun share(onProgress: (Int?) -> Unit): Boolean {
        val location = location()
        var downloaded: java.io.File? = null
        downloader.downloadApk(location.url, location.fileName).collect { state ->
            when (state) {
                is DownloadState.Downloading -> onProgress(state.percent.takeIf { it > 0 })
                is DownloadState.Completed -> downloaded = state.file
                is DownloadState.Error, DownloadState.Idle -> Unit
            }
        }
        val file = downloaded ?: return false
        return shareManager.shareApk(file, APK_SHARE_TITLE)
    }

    /**
     * Where this deployment publishes its APK, and what to call the file once it is here.
     *
     * The release route is the authority: it answers with the address and the name of the build *this*
     * installation serves. When it does not answer, the fallback is the same path relative to the host this
     * build was compiled against -- a hardcoded host would send an operator to another plant's binary.
     */
    internal suspend fun location(): ApkLocation {
        val release = runCatching { systemApi.latestRelease() }.getOrNull()?.body()
        val url = release?.apkUrl?.takeIf { it.isNotBlank() }
            ?: (BuildConfig.API_BASE_URL.trimEnd('/') + "/api/app/download-apk")
        val name = release?.apkName?.trim()?.takeIf { it.isNotEmpty() } ?: DEFAULT_APK_NAME
        return ApkLocation(url = url, fileName = name)
    }
}

/** The address the APK is fetched from, and the name it takes on the way into the cache. */
data class ApkLocation(val url: String, val fileName: String)

/**
 * The [ApkSharer] a test or a preview gets when nothing was wired.
 *
 * It answers that it shared nothing, so a screen that is drawn without a backend reports a failure instead
 * of claiming it sent a file.
 */
object NoOpApkSharer : ApkSharer {
    override suspend fun share(onProgress: (Int?) -> Unit): Boolean = false
}

private const val APK_SHARE_TITLE = "Trindade APK"
private const val DEFAULT_APK_NAME = "trindade.apk"
