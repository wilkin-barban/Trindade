package com.trindade.app.update

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ApkInstaller @Inject constructor(
    @ApplicationContext private val context: Context,
    private val permissionManager: InstallPermissionManager,
) {
    sealed interface InstallResult {
        data class Launched(val intent: Intent) : InstallResult
        data class PermissionRequired(val manageIntent: Intent) : InstallResult
        data class Error(val message: String) : InstallResult
    }

    /**
     * Builds the Intent to install an APK file using FileProvider.
     */
    fun createInstallIntent(apkFile: File): Intent {
        val authority = "${context.packageName}.fileprovider"
        val contentUri: Uri = FileProvider.getUriForFile(context, authority, apkFile)

        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(contentUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    /**
     * Triggers the package installation if permission is granted, or returns [InstallResult.PermissionRequired].
     */
    fun installApk(apkFile: File): InstallResult {
        if (!apkFile.exists() || apkFile.length() == 0L) {
            return InstallResult.Error("Arquivo APK inválido ou não encontrado")
        }

        if (!permissionManager.canRequestPackageInstalls()) {
            val manageIntent = permissionManager.createManageUnknownAppSourcesIntent().apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            runCatching { context.startActivity(manageIntent) }
            return InstallResult.PermissionRequired(manageIntent)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val sessionResult = runCatching {
                val packageInstaller = context.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                    setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                }
                val sessionId = packageInstaller.createSession(params)
                packageInstaller.openSession(sessionId).use { session ->
                    apkFile.inputStream().use { input ->
                        session.openWrite("package", 0, apkFile.length()).use { output ->
                            input.copyTo(output)
                            session.fsync(output)
                        }
                    }
                    val intent = Intent(context, UpdateReceiver::class.java).apply {
                        action = "com.trindade.app.ACTION_INSTALL_COMMIT"
                    }
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                    val pendingIntent = PendingIntent.getBroadcast(context, sessionId, intent, flags)
                    session.commit(pendingIntent.intentSender)
                }
                InstallResult.Launched(createInstallIntent(apkFile))
            }
            if (sessionResult.isSuccess) {
                return sessionResult.getOrThrow()
            }
        }

        return try {
            val intent = createInstallIntent(apkFile)
            context.startActivity(intent)
            InstallResult.Launched(intent)
        } catch (e: Exception) {
            InstallResult.Error(e.message ?: "Erro ao disparar instalador")
        }
    }
}
