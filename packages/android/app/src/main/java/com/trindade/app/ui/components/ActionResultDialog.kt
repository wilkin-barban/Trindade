package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.trindade.app.R

/**
 * What a button answered, in a window the operator dismisses.
 *
 * Inline answers pushed the screen and looked like part of the form: a refusal below a button read as a field
 * of the form, and a success read as nothing at all once the operator scrolled past it. Every action that
 * answers -- an ERP sync, a saved report, a connection test -- says so here, with the same title, the same
 * tone and the same way out, so the answer is recognisable before it is read.
 *
 * The dialog belongs to the action that opened it and not to the screen's flow: it never closes by itself, and
 * the button that opened it is free again as soon as it does.
 */
@Composable
fun ActionResultDialog(
    message: String,
    isSuccess: Boolean,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    /**
     * One line per thing the answer is about, when it is about several.
     *
     * A batch refused row by row is a list, and the sentence alone can only say that something failed:
     * the rows are what the operator has to act on, so they are drawn under it, each one already named.
     */
    rows: List<String> = emptyList(),
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = modifier,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(text = if (isSuccess) "✅" else "❌")
                Text(
                    text = stringResource(
                        if (isSuccess) R.string.action_result_success else R.string.action_result_error,
                    ),
                    fontWeight = FontWeight.Bold,
                )
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = message, style = MaterialTheme.typography.bodyMedium)
                rows.forEach { row ->
                    Text(text = "• $row", style = MaterialTheme.typography.bodyMedium)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isSuccess) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                    contentColor = if (isSuccess) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onError
                    },
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp),
            ) {
                Text(
                    text = stringResource(R.string.action_result_close),
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                )
            }
        },
    )
}
