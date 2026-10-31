package com.trindade.app.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.clickable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.trindade.app.R
import com.trindade.app.ui.components.ActionResultDialog
import com.trindade.app.ui.components.AdminPrimaryButton
import com.trindade.app.ui.components.AdminSecondaryButton

/**
 * The ERP integration, in the panel and not behind a tap.
 *
 * The section is a fixed card: it is the one place where the plant's address and the operator's own credentials
 * live, and hiding it behind a collapse made the one screen that explains an integration failure the hardest one
 * to open. There is no create action here -- the integration is one row, not a list.
 *
 * The address is shown to everyone and editable only by the owner; the credentials are editable by whoever is
 * holding the phone, because they are theirs.
 */
/** The card with its ViewModel attached. */
@Composable
fun AdminIntegrationCard(
    modifier: Modifier = Modifier,
    viewModel: IntegrationSettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(Unit) { viewModel.load() }

    AdminIntegrationCard(
        state = state,
        onWsUrlChange = viewModel::setWsUrl,
        onUsernameChange = viewModel::setUsername,
        onPasswordChange = viewModel::setPassword,
        onTest = viewModel::test,
        onSave = viewModel::save,
        onDismissMessage = viewModel::clearMessage,
        modifier = modifier,
    )
}

/**
 * The card itself, drawn from what the form holds.
 *
 * The state is a parameter rather than read from the view model so the two answers this card owes can be
 * asserted without a network: the three fields it asks for, and the dialog that reports what the last action
 * said.
 */
@Composable
fun AdminIntegrationCard(
    state: IntegrationSettingsViewModel.UiState,
    onWsUrlChange: (String) -> Unit,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onTest: () -> Unit,
    onSave: () -> Unit,
    onDismissMessage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var passwordVisible by remember { mutableStateOf(false) }

    // The answer to a test or a save, in a window rather than under the buttons: the card is the one screen
    // that explains an integration failure, and a sentence that grows the card moves the fields the operator
    // is about to correct.
    state.message?.let { message ->
        ActionResultDialog(
            message = message,
            isSuccess = !state.messageIsError,
            onDismiss = onDismissMessage,
        )
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = stringResource(R.string.admin_integration_title),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            )
            Text(
                text = stringResource(R.string.admin_integration_ws_url),
                style = MaterialTheme.typography.labelLarge,
            )
            OutlinedTextField(
                value = state.wsUrl,
                onValueChange = onWsUrlChange,
                singleLine = true,
                enabled = state.permissions.canEditWsUrl,
                modifier = Modifier.fillMaxWidth(),
            )
            if (!state.permissions.canEditWsUrl) {
                Text(
                    text = stringResource(R.string.admin_integration_locked),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            OutlinedTextField(
                value = state.username,
                onValueChange = onUsernameChange,
                label = { Text(stringResource(R.string.admin_integration_username)) },
                singleLine = true,
                enabled = state.permissions.canEditCredentials,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.password,
                onValueChange = onPasswordChange,
                label = { Text(stringResource(R.string.admin_integration_password)) },
                singleLine = true,
                enabled = state.permissions.canEditCredentials,
                visualTransformation = if (passwordVisible) {
                    androidx.compose.ui.text.input.VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                trailingIcon = {
                    Text(
                        text = if (passwordVisible) "•••" else "👁",
                        modifier = Modifier
                            .padding(end = 12.dp)
                            .clickable { passwordVisible = !passwordVisible },
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AdminSecondaryButton(
                    text = stringResource(R.string.admin_integration_test),
                    onClick = onTest,
                    enabled = !state.isTesting && state.ready,
                )
                AdminPrimaryButton(
                    text = stringResource(R.string.admin_integration_save),
                    onClick = onSave,
                    enabled = state.ready,
                )
            }
        }
    }
}
