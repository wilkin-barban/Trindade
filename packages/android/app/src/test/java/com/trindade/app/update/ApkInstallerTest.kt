package com.trindade.app.update

import android.content.Context
import android.content.ContextWrapper
import android.content.ComponentName
import android.content.pm.PackageInstaller
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.MainActivity
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(sdk = [Build.VERSION_CODES.O])
class ApkInstallerTest {

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private lateinit var permissionManager: InstallPermissionManager
    private lateinit var installer: ApkInstaller
    private lateinit var testApk: File

    @Before
    fun setUp() {
        clearFileProviderCache()
        permissionManager = InstallPermissionManager(context)
        installer = ApkInstaller(context, permissionManager)
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        testApk = File(dir, "test.apk").apply {
            writeBytes("mock-apk-content".toByteArray())
        }
    }

    @After
    fun tearDown() {
        clearFileProviderCache()
        if (::testApk.isInitialized && testApk.exists()) {
            testApk.delete()
        }
    }

    private fun clearFileProviderCache() {
        try {
            val sCacheField = androidx.core.content.FileProvider::class.java.getDeclaredField("sCache")
            sCacheField.isAccessible = true
            (sCacheField.get(null) as? MutableMap<*, *>)?.clear()
        } catch (_: Throwable) {
        }
    }

    @Test
    fun `createInstallIntent builds ACTION_VIEW with package archive type and permissions`() {
        val intent = installer.createInstallIntent(testApk)

        assertEquals(Intent.ACTION_VIEW, intent.action)
        assertEquals("application/vnd.android.package-archive", intent.type)
        assertTrue((intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0)
        assertTrue((intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK) != 0)
        assertNotNull(intent.data)
        assertTrue(intent.data.toString().startsWith("content://${context.packageName}.fileprovider/updates/"))
    }

    @Test
    fun `installApk returns Error when file does not exist`() {
        val missing = File(context.cacheDir, "missing.apk")
        val result = installer.installApk(missing)

        assertTrue(result is ApkInstaller.InstallResult.Error)
    }

    @Test
    fun `installApk returns PermissionRequired when permission is not granted`() {
        shadowOf(context.packageManager).setCanRequestPackageInstalls(false)
        val result = installer.installApk(testApk)

        assertTrue(result is ApkInstaller.InstallResult.PermissionRequired)
        val permResult = result as ApkInstaller.InstallResult.PermissionRequired
        assertEquals(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, permResult.manageIntent.action)
    }

    @Test
    fun `installApk launches intent when install permission is available`() {
        shadowOf(context.packageManager).setCanRequestPackageInstalls(true)
        val result = installer.installApk(testApk)

        assertTrue(result is ApkInstaller.InstallResult.Launched)
        val nextIntent = shadowOf(ApplicationProvider.getApplicationContext<Context>() as android.app.Application).nextStartedActivity
        assertNotNull(nextIntent)
        assertEquals(Intent.ACTION_VIEW, nextIntent.action)
    }

    @Test
    fun `installApk opens the system installer directly instead of going through a package session`() {
        shadowOf(context.packageManager).setCanRequestPackageInstalls(true)

        val result = installer.installApk(testApk)

        assertTrue(result is ApkInstaller.InstallResult.Launched)
        val launched = shadowOf(ApplicationProvider.getApplicationContext<Context>() as android.app.Application).nextStartedActivity
        assertEquals(Intent.ACTION_VIEW, launched.action)
        assertEquals("application/vnd.android.package-archive", launched.type)
    }

    @Test
    @Config(sdk = [34])
    fun `on android 14 the installer still opens in the foreground from the tap`() {
        shadowOf(context.packageManager).setCanRequestPackageInstalls(true)

        val result = installer.installApk(testApk)

        // La sesión de PackageInstaller delegaba en el receptor, y en Android 14 el sistema bloquea ese
        // startActivity en segundo plano: el resultado era un viaje que no mostraba nada.
        assertTrue(result is ApkInstaller.InstallResult.Launched)
        val launched = shadowOf(ApplicationProvider.getApplicationContext<Context>() as android.app.Application).nextStartedActivity
        assertEquals(Intent.ACTION_VIEW, launched.action)
        assertTrue((launched.flags and Intent.FLAG_ACTIVITY_NEW_TASK) != 0)
    }

    @Test
    fun `installApk reports an error instead of crashing when the installer cannot be opened`() {
        shadowOf(context.packageManager).setCanRequestPackageInstalls(true)
        val blockedContext = object : ContextWrapper(context) {
            override fun startActivity(intent: Intent) { throw SecurityException("blocked") }
        }

        val result = ApkInstaller(blockedContext, permissionManager).installApk(testApk)

        assertTrue(result is ApkInstaller.InstallResult.Error)
    }

    @Test
    @Config(sdk = [33])
    fun `pending package install opens the system confirmation in a new task`() {
        val confirmation = Intent("android.intent.action.CONFIRM_INSTALL")
        val callback = Intent("com.trindade.app.ACTION_INSTALL_COMMIT")
            .putExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_PENDING_USER_ACTION)
            .putExtra(Intent.EXTRA_INTENT, confirmation)

        UpdateReceiver().onReceive(context, callback)

        val launched = shadowOf(ApplicationProvider.getApplicationContext<Context>() as android.app.Application).nextStartedActivity
        assertNotNull(launched)
        assertEquals(confirmation.action, launched.action)
        assertTrue((launched.flags and Intent.FLAG_ACTIVITY_NEW_TASK) != 0)
    }

    @Test
    fun `blocked confirmation does not crash the receiver`() {
        val blockedContext = object : ContextWrapper(context) {
            override fun startActivity(intent: Intent) { throw SecurityException("blocked") }
        }
        val callback = Intent("com.trindade.app.ACTION_INSTALL_COMMIT")
            .putExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_PENDING_USER_ACTION)
            .putExtra(Intent.EXTRA_INTENT, Intent("android.intent.action.CONFIRM_INSTALL"))

        UpdateReceiver().onReceive(blockedContext, callback)
    }

    @Test
    fun `update receiver is not exported to other applications`() {
        val info = context.packageManager.getReceiverInfo(ComponentName(context, UpdateReceiver::class.java), 0)
        assertTrue(!info.exported)
    }

    @Test
    fun `UpdateReceiver on MY_PACKAGE_REPLACED intent relaunches MainActivity`() {
        val receiver = UpdateReceiver()
        val intent = Intent(Intent.ACTION_MY_PACKAGE_REPLACED)

        receiver.onReceive(context, intent)

        val nextIntent = shadowOf(ApplicationProvider.getApplicationContext<Context>() as android.app.Application).nextStartedActivity
        assertNotNull(nextIntent)
        assertEquals(MainActivity::class.java.name, nextIntent.component?.className)
        assertTrue((nextIntent.flags and Intent.FLAG_ACTIVITY_NEW_TASK) != 0)
        assertTrue((nextIntent.flags and Intent.FLAG_ACTIVITY_CLEAR_TOP) != 0)
    }
}
