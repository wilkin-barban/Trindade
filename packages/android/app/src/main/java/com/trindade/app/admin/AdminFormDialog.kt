package com.trindade.app.admin

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.trindade.app.R
import com.trindade.app.ui.components.AdminPrimaryButton
import com.trindade.app.ui.components.AdminSecondaryButton

/** The tag a test finds the modal by, so "is the form inside a dialog" is an assertion and not a guess. */
const val ADMIN_FORM_DIALOG_TAG: String = "admin-form-dialog"

/**
 * The one modal every administration tab fills its form into.
 *
 * It is drawn inside the screen's own composition rather than as a platform `Dialog`: an administration form is
 * all text fields, and a text field inside a dialog window never reports idle to the Compose test rule -- the
 * suite would hang for a minute per case instead of asserting anything. The contract the plant cares about is
 * kept anyway: the list stays behind a scrim, the form scrolls inside its own card, `Cancelar` closes without
 * saving, and every action is at least 44 dp.
 */
@Composable
fun AdminFormDialog(
    title: String,
    onDismiss: () -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
    submitLabel: String? = null,
    cancelLabel: String? = null,
    saving: Boolean = false,
    submitEnabled: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    val dismiss = { if (!saving) onDismiss() }
    BackHandler(enabled = true, onBack = dismiss)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.45f)),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 560.dp)
                .padding(16.dp)
                .testTag(ADMIN_FORM_DIALOG_TAG),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )

                // The body is the only part that scrolls: the title and the two actions stay where the thumb
                // already is, which is what makes a long form usable on a phone.
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    content = content,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AdminSecondaryButton(
                        onClick = dismiss,
                        text = cancelLabel ?: stringResource(R.string.admin_action_cancel),
                        enabled = !saving,
                        modifier = Modifier.weight(1f),
                    )
                    AdminPrimaryButton(
                        onClick = onSubmit,
                        text = submitLabel ?: stringResource(R.string.admin_action_save),
                        enabled = submitEnabled && !saving,
                        loading = saving,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
