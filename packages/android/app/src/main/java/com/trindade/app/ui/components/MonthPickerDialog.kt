package com.trindade.app.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.trindade.app.R
import com.trindade.app.ui.displayMonth
import com.trindade.app.ui.recentMonths
import java.time.LocalDate

/**
 * The twelve months behind a history's month filter, as a list rather than the platform's day picker.
 *
 * The platform picker answers a day, so using it to choose a month would ask for a value and then ignore
 * most of it; a control whose answer has no effect is a control that lies about what it does. The list is
 * computed once per opening rather than on every recomposition, and dropped when the dialog leaves the
 * composition -- which is what makes reopening it pick up a month that has since changed. It scrolls,
 * because twelve rows do not fit the dialog's slot on a short screen and an unscrollable list would hide
 * the older half of the year behind an invisible edge.
 */
@Composable
fun MonthPickerDialog(onDismiss: () -> Unit, onPick: (String) -> Unit) {
    val months = remember { recentMonths(LocalDate.now()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.history_month_picker_title)) },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 360.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                months.forEach { iso ->
                    TextButton(
                        onClick = { onPick(iso) },
                        modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp),
                    ) {
                        Text(displayMonth(iso), style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        },
        confirmButton = {
            AdminSecondaryButton(onClick = onDismiss, text = stringResource(R.string.loading_cancel))
        },
    )
}
