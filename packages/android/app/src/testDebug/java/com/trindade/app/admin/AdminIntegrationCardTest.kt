package com.trindade.app.admin

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import com.trindade.app.aero.AeroErpClient
import com.trindade.app.aero.AeroReachability
import com.trindade.app.aero.AeroSettings
import com.trindade.app.auth.AuthRepository
import com.trindade.app.auth.TokenStore
import com.trindade.app.contract.models.ChangePasswordRequest
import com.trindade.app.contract.models.LoginRequest
import com.trindade.app.contract.models.LoginResponse
import com.trindade.app.contract.models.LogoutRequest
import com.trindade.app.contract.models.ProfileResponse
import com.trindade.app.contract.models.RefreshRequest
import com.trindade.app.contract.models.RefreshResponse
import com.trindade.app.contract.models.RegisterRequest
import com.trindade.app.contract.models.RegisterResponse
import com.trindade.app.contract.models.SetupStatusResponse
import com.trindade.app.contract.models.SuccessResponse
import com.trindade.app.contract.models.UpdateProfileRequest
import com.trindade.app.massas.FakeSettingsPort
import com.trindade.app.network.AuthApi
import com.trindade.app.ui.theme.TrindadeTheme
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import retrofit2.Response

/**
 * The integration the panel asks for, and only that.
 *
 * The web has always asked for the address, the user and the password; the phone also asked for an "operator
 * code" the ERP uses as a seat fallback. Two screens describing one integration have to describe the same one,
 * so these tests pin the three fields, the absence of the fourth and the rule that made the fourth optional in
 * the first place: the action is ready without it.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [28], qualifiers = "w375dp-h800dp")
class AdminIntegrationCardTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private class FakeTokenStore : TokenStore {
        override fun accessToken(): String? = "token"
        override fun refreshToken(): String? = "refresh"
        override fun role(): String? = "admin"
        override fun save(accessToken: String, refreshToken: String) {}
        override fun saveRole(role: String) {}
        override fun clear() {}
    }

    private class FakeAuthApi : AuthApi {
        override suspend fun login(body: LoginRequest) = Response.error<LoginResponse>(500, "".toResponseBody())
        override suspend fun refresh(body: RefreshRequest) = Response.error<RefreshResponse>(500, "".toResponseBody())
        override suspend fun logout(body: LogoutRequest) =
            Response.success(SuccessResponse(SuccessResponse.Success.`true`))
        override suspend fun me() = Response.error<ProfileResponse>(500, "".toResponseBody())
        override suspend fun profile() = Response.error<ProfileResponse>(500, "".toResponseBody())
        override suspend fun updateProfile(body: UpdateProfileRequest) =
            Response.error<ProfileResponse>(500, "".toResponseBody())
        override suspend fun changePassword(body: ChangePasswordRequest) =
            Response.success(SuccessResponse(SuccessResponse.Success.`true`))
        override suspend fun setupStatus() = Response.error<SetupStatusResponse>(500, "".toResponseBody())
        override suspend fun register(body: RegisterRequest) =
            Response.error<RegisterResponse>(500, "".toResponseBody())
    }

    private fun render() {
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
        val store = FakeSettingsPort(
            AeroSettings(wsUrl = "http://10.0.0.10:8080", username = "WILKIN", password = "pw", userCode = "1"),
        )
        val viewModel = IntegrationSettingsViewModel(
            store = store,
            client = AeroErpClient(json),
            reachability = AeroReachability(context),
            authRepository = AuthRepository(FakeAuthApi(), FakeTokenStore(), json),
        )
        composeRule.setContent {
            TrindadeTheme {
                AdminIntegrationCard(viewModel = viewModel)
            }
        }
    }

    @Test
    fun `the integration asks for the address, the user and the password, and nothing else`() {
        render()

        composeRule.onNodeWithText(string(R.string.admin_integration_username)).assertIsDisplayed()
        composeRule.onNodeWithText(string(R.string.admin_integration_password)).assertIsDisplayed()
        composeRule.onNodeWithText(string(R.string.admin_integration_ws_url)).assertIsDisplayed()
        // The fourth field is the one the web never had: "Código do usuário" in Portuguese, "Código del
        // usuario" in Spanish, so the check is on the prefix both share.
        assertEquals(
            0,
            composeRule.onAllNodesWithText("Código d", substring = true).fetchSemanticsNodes().size,
        )
    }

    private fun string(resId: Int, vararg args: Any): String = context.getString(resId, *args)
}
