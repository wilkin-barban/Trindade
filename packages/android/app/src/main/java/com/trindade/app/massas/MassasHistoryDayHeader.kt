package com.trindade.app.massas

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.trindade.app.R
import com.trindade.app.ui.components.HistoryHeader

/** El chip del día de planta, que no se repite entre las fechas anteriores. */
const val MASSAS_HISTORY_TODAY_LABEL: String = "Hoje"

/** El chip que abre el archivo completo, en la lista y en el día. */
const val MASSAS_HISTORY_ALL_LABEL: String = "Todas as datas"

/** Las cinco fechas de la vista de día, para que un test las encuentre sin leer la pantalla. */
fun massasHistoryDayChipTag(date: String): String = "massas-history-day-chip-$date"

/** El chip de hoy. */
const val MASSAS_HISTORY_DAY_TODAY_TAG: String = "massas-history-day-today"

/** El chip que vuelve al archivo de fechas. */
const val MASSAS_HISTORY_DAY_ALL_TAG: String = "massas-history-day-all"

/**
 * El encabezado del día del Histórico de Massas: volver, el nombre del archivo y sus fechas rápidas.
 *
 * La vista de día nació como una subpantalla del lanzamiento y por eso conservaba su barra: el "Voltar" sólo
 * aparecía en un día pasado, y con hoy abierto desde el archivo el único camino de vuelta era el botón físico
 * del teléfono. Esta pieza dice lo que la pantalla es -- Histórico de Massas -- y pone a mano lo que la web
 * pone a mano: hoy, las cinco fechas anteriores **que el archivo reportó** y el archivo completo.
 *
 * Las fechas son las del servidor y no el calendario: la web dibuja sus chips desde `/massas-launch/history`, y
 * un chip de un día que la planta no produjo llevaría a una pantalla vacía que el archivo nunca ofreció. El
 * recorte es la misma regla de la lista -- hoy aparte, cinco anteriores -- para que las dos superficies no
 * ofrezcan fechas distintas.
 *
 * Vive fuera de `MassasLaunchScreen` para poder probarse sin su ViewModel: es una decisión sobre qué se ve y
 * a dónde lleva cada toque, y esa decisión no necesita el día leído para ser cierta.
 */
@Composable
fun MassasHistoryDayHeader(
    today: String,
    selectedDate: String,
    /** Las fechas que `/massas-launch/history` reportó, de la más reciente a la más vieja. */
    historyDates: List<String>,
    onSelectDate: (String) -> Unit,
    onOpenList: () -> Unit,
    modifier: Modifier = Modifier,
    onHelp: (() -> Unit)? = null,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HistoryHeader(
            // El nombre del archivo, no el del módulo: quien entró desde el histórico está leyendo el
            // histórico, y la pestaña que lo trajo no cambia eso. Sin «Voltar»: la navegación es la barra
            // superior y «Todas as datas» es la vuelta al archivo.
            title = stringResource(R.string.massas_history_title),
            onHelp = onHelp,
        )
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = selectedDate == today,
                onClick = { onSelectDate(today) },
                label = { Text(stringResource(R.string.massas_history_today)) },
                modifier = Modifier.defaultMinSize(minHeight = 44.dp).testTag(MASSAS_HISTORY_DAY_TODAY_TAG),
            )
            // Hoy siempre se dibuja -- el archivo puede no haber devuelto todavía el día de planta -- y las
            // anteriores son las que el servidor conoce, con el mismo recorte de cinco que la lista.
            massasHistoryShownDays(today, historyDates, all = false).forEach { date ->
                FilterChip(
                    selected = selectedDate == date,
                    onClick = { onSelectDate(date) },
                    label = { Text(brazilianDate(date)) },
                    modifier = Modifier.defaultMinSize(minHeight = 44.dp).testTag(massasHistoryDayChipTag(date)),
                )
            }
            FilterChip(
                selected = false,
                onClick = onOpenList,
                label = { Text(stringResource(R.string.massas_history_all_dates)) },
                modifier = Modifier.defaultMinSize(minHeight = 44.dp).testTag(MASSAS_HISTORY_DAY_ALL_TAG),
            )
        }
    }
}
