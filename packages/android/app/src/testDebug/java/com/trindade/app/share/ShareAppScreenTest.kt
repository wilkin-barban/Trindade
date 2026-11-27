package com.trindade.app.share

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.admin.UsersRepository
import com.trindade.app.auth.AuthRepository
import com.trindade.app.auth.TokenStore
import com.trindade.app.contract.models.AdminCategoriesResponse
import com.trindade.app.contract.models.AdminCategoryResponse
import com.trindade.app.contract.models.AdminDriverResponse
import com.trindade.app.contract.models.AdminDriversResponse
import com.trindade.app.contract.models.AdminTaskResponse
import com.trindade.app.contract.models.AdminTasksResponse
import com.trindade.app.contract.models.AdminUserResponse
import com.trindade.app.contract.models.AdminUserResponseUser
import com.trindade.app.contract.models.AdminUsersResponse
import com.trindade.app.contract.models.AdminVehicleResponse
import com.trindade.app.contract.models.AdminVehiclesResponse
import com.trindade.app.contract.models.ChangePasswordRequest
import com.trindade.app.contract.models.CreateAdminCategoryRequest
import com.trindade.app.contract.models.CreateAdminDriverRequest
import com.trindade.app.contract.models.CreateAdminTaskRequest
import com.trindade.app.contract.models.CreateAdminVehicleRequest
import com.trindade.app.contract.models.LoginRequest
import com.trindade.app.contract.models.LoginResponse
import com.trindade.app.contract.models.LogoutRequest
import com.trindade.app.contract.models.ProfileResponse
import com.trindade.app.contract.models.ProfileResponseUser
import com.trindade.app.contract.models.RefreshRequest
import com.trindade.app.contract.models.RefreshResponse
import com.trindade.app.contract.models.RegisterRequest
import com.trindade.app.contract.models.RegisterResponse
import com.trindade.app.contract.models.SetupStatusResponse
import com.trindade.app.contract.models.TimeSlotsResponse
import com.trindade.app.contract.models.UpdateProfileRequest
import com.trindade.app.contract.models.UpdateTimeSlotsRequest
import com.trindade.app.network.AdminApi
import com.trindade.app.network.AuthApi
import com.trindade.app.ui.theme.TrindadeTheme
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import retrofit2.Response

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w400dp-h1000dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ShareAppScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private fun str(id: Int): String = context.getString(id)

    private fun viewModel(
        apkSharer: ApkSharer = FakeScreenApkSharer(true),
    ): ShareAppViewModel {
        val adminApi = ScreenFakeAdminApi()
        val authRepo = AuthRepository(ScreenFakeAuthApi(), ScreenFakeTokenStore("Administrador"), Json)
        return ShareAppViewModel(authRepo, UsersRepository(adminApi), apkSharer)
    }

    @Test
    fun `registering operator shows success inside modal ActionResultDialog instead of inline text`() {
        val vm = viewModel()
        composeRule.setContent {
            TrindadeTheme { ShareAppScreen(viewModel = vm) }
        }

        composeRule.onNodeWithText(str(R.string.share_display_name)).performScrollTo().performTextInput("Pedro")
        composeRule.onNodeWithText(str(R.string.share_create_button)).performScrollTo().performClick()

        composeRule.onNode(isDialog()).assertIsDisplayed()
        composeRule.onNodeWithText(str(R.string.action_result_success)).assertIsDisplayed()
        composeRule.onNodeWithText(str(R.string.share_create_success)).assertIsDisplayed()

        composeRule.onNodeWithText(str(R.string.action_result_close)).performClick()
        composeRule.onNode(isDialog()).assertDoesNotExist()
        composeRule.onAllNodesWithText(str(R.string.share_create_success)).assertCountEquals(0)
    }

    @Test
    fun `validation error on register operator opens error ActionResultDialog instead of inline text`() {
        val vm = viewModel()
        composeRule.setContent {
            TrindadeTheme { ShareAppScreen(viewModel = vm) }
        }

        composeRule.onNodeWithText(str(R.string.share_create_button)).performScrollTo().performClick()

        composeRule.onNode(isDialog()).assertIsDisplayed()
        composeRule.onNodeWithText(str(R.string.action_result_error)).assertIsDisplayed()
        composeRule.onNodeWithText(str(R.string.share_create_name_required)).assertIsDisplayed()

        composeRule.onNodeWithText(str(R.string.action_result_close)).performClick()
        composeRule.onAllNodesWithText(str(R.string.share_create_name_required)).assertCountEquals(0)
    }

    @Test
    fun `failed APK share opens error ActionResultDialog instead of inline text`() {
        val vm = viewModel(apkSharer = FakeScreenApkSharer(false))
        composeRule.setContent {
            TrindadeTheme { ShareAppScreen(viewModel = vm) }
        }

        composeRule.onNodeWithText(str(R.string.share_send_apk)).performScrollTo().performClick()

        composeRule.onNode(isDialog()).assertIsDisplayed()
        composeRule.onNodeWithText(str(R.string.action_result_error)).assertIsDisplayed()
        composeRule.onNodeWithText(str(R.string.share_apk_failed)).assertIsDisplayed()

        composeRule.onNodeWithText(str(R.string.action_result_close)).performClick()
        composeRule.onAllNodesWithText(str(R.string.share_apk_failed)).assertCountEquals(0)
    }

    @Test
    fun `sending to WhatsApp never renders opening WhatsApp note and launches cleanly`() {
        val vm = viewModel()
        vm.onIncludeCredentialsToggle(false)
        vm.onPhoneChange("11999998888")
        composeRule.setContent {
            TrindadeTheme { ShareAppScreen(viewModel = vm) }
        }

        composeRule.onNodeWithText(str(R.string.share_send_whatsapp)).performScrollTo().performClick()

        composeRule.onAllNodesWithText(str(R.string.share_note_opening_whatsapp)).assertCountEquals(0)
        composeRule.onNode(isDialog()).assertDoesNotExist()
    }

    @Test
    fun `sending to WhatsApp opens error ActionResultDialog when startActivity throws`() {
        val vm = viewModel()
        vm.onIncludeCredentialsToggle(false)
        vm.onPhoneChange("11999998888")
        val failingContext = object : ContextWrapper(context) {
            override fun startActivity(intent: Intent?) {
                throw ActivityNotFoundException("no handler")
            }
        }
        composeRule.setContent {
            CompositionLocalProvider(LocalContext provides failingContext) {
                TrindadeTheme { ShareAppScreen(viewModel = vm) }
            }
        }

        composeRule.onNodeWithText(str(R.string.share_send_whatsapp)).performScrollTo().performClick()

        composeRule.onNode(isDialog()).assertIsDisplayed()
        composeRule.onNodeWithText(str(R.string.action_result_error)).assertIsDisplayed()
        composeRule.onNodeWithText(str(R.string.open_app_failed)).assertIsDisplayed()
    }
}

private class FakeScreenApkSharer(private val result: Boolean) : ApkSharer {
    override suspend fun share(onProgress: (Int?) -> Unit): Boolean = result
}

private class ScreenFakeAdminApi : AdminApi {
    private val rows = listOf(AdminUserResponseUser(1, "ana.admin", "Ana Admin", 1, "Administrador", 1, "now"))
    override suspend fun users(): Response<AdminUsersResponse> = Response.success(AdminUsersResponse(rows))
    override suspend fun createUser(body: JsonObject): Response<AdminUserResponse> = Response.success(AdminUserResponse(rows.first()))
    override suspend fun updateUser(id: Int, body: JsonObject): Response<AdminUserResponse> = Response.success(AdminUserResponse(rows.first()))
    override suspend fun deleteUser(id: Int): Response<Unit> = error("unused")
    override suspend fun categories(): Response<AdminCategoriesResponse> = error("unused")
    override suspend fun createCategory(body: CreateAdminCategoryRequest): Response<AdminCategoryResponse> = error("unused")
    override suspend fun updateCategory(id: Int, body: JsonObject): Response<AdminCategoryResponse> = error("unused")
    override suspend fun deleteCategory(id: Int): Response<Unit> = error("unused")
    override suspend fun drivers(): Response<AdminDriversResponse> = error("unused")
    override suspend fun createDriver(body: CreateAdminDriverRequest): Response<AdminDriverResponse> = error("unused")
    override suspend fun updateDriver(id: Int, body: JsonObject): Response<AdminDriverResponse> = error("unused")
    override suspend fun tasks(): Response<AdminTasksResponse> = error("unused")
    override suspend fun createTask(body: CreateAdminTaskRequest): Response<AdminTaskResponse> = error("unused")
    override suspend fun updateTask(id: Int, body: JsonObject): Response<AdminTaskResponse> = error("unused")
    override suspend fun deleteTask(id: Int): Response<Unit> = error("unused")
    override suspend fun timeSlots(): Response<TimeSlotsResponse> = error("unused")
    override suspend fun updateTimeSlots(body: UpdateTimeSlotsRequest): Response<TimeSlotsResponse> = error("unused")
    override suspend fun vehicles(): Response<AdminVehiclesResponse> = error("unused")
    override suspend fun createVehicle(body: CreateAdminVehicleRequest): Response<AdminVehicleResponse> = error("unused")
    override suspend fun updateVehicle(id: Int, body: JsonObject): Response<AdminVehicleResponse> = error("unused")
    override suspend fun deleteVehicle(id: Int): Response<Unit> = error("unused")
}

private class ScreenFakeAuthApi : AuthApi {
    override suspend fun profile(): Response<ProfileResponse> = Response.success(
        ProfileResponse(user = ProfileResponseUser(1, "ana.admin", "Ana Admin", "Administrador")),
    )
    override suspend fun me(): Response<ProfileResponse> = profile()
    override suspend fun login(body: LoginRequest): Response<LoginResponse> = error("unused")
    override suspend fun refresh(body: RefreshRequest): Response<RefreshResponse> = error("unused")
    override suspend fun logout(body: LogoutRequest): Response<Unit> = error("unused")
    override suspend fun updateProfile(body: UpdateProfileRequest): Response<ProfileResponse> = error("unused")
    override suspend fun changePassword(body: ChangePasswordRequest): Response<Unit> = error("unused")
    override suspend fun register(body: RegisterRequest): Response<RegisterResponse> = error("unused")
    override suspend fun setupStatus(): Response<SetupStatusResponse> = error("unused")
}

private class ScreenFakeTokenStore(private val roleName: String) : TokenStore {
    override fun accessToken(): String = "token"
    override fun refreshToken(): String = "refresh"
    override fun role(): String = roleName
    override fun save(accessToken: String, refreshToken: String) {}
    override fun saveRole(role: String) {}
    override fun clear() {}
}
