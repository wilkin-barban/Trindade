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
import java.time.LocalDate

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
 * Las [count] fechas anteriores a [today], de la más reciente a la más vieja.
 *
 * La lista del histórico recorta las fechas que el servidor devolvió -- ahí se consulta qué se produjo. La
 * vista de un día no hizo esa lectura: abre *un* día del archivo, y lo que necesita es poder caminar hacia
 * atrás. Por eso ofrece el calendario, no el listado: cinco días existan o no en el historial. Un día sin
 * lanzamientos tiene su estado vacío, que es una respuesta; esconderlo sería afirmar que ese día no ocurrió.
 */
fun massasHistoryCalendarDays(today: String, count: Int = 5): List<String> {
    val day = LocalDate.parse(today)
    return (1..count).map { offset -> day.minusDays(offset.toLong()).toString() }
}

/**
 * El encabezado del día del Histórico de Massas: volver, el nombre del archivo y sus fechas rápidas.
 *
 * La vista de día nació como una subpantalla del lanzamiento y por eso conservaba su barra: el "Voltar" sólo
 * aparecía en un día pasado, y con hoy abierto desde el archivo el único camino de vuelta era el botón físico
 * del teléfono. Esta pieza dice lo que la pantalla es -- Histórico de Massas -- y pone a mano lo que la web
 * pone a mano: hoy, las cinco fechas anteriores y el archivo completo.
 *
 * Vive fuera de `MassasLaunchScreen` para poder probarse sin su ViewModel: es una decisión sobre qué se ve y
 * a dónde lleva cada toque, y esa decisión no necesita el día leído para ser cierta.
 */
@Composable
fun MassasHistoryDayHeader(
    today: String,
    selectedDate: String,
    onBack: () -> Unit,
    onSelectDate: (String) -> Unit,
    onOpenList: () -> Unit,
    modifier: Modifier = Modifier,
    onHelp: (() -> Unit)? = null,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HistoryHeader(
            // El nombre del archivo, no el del módulo: quien entró desde el histórico está leyendo el
            // histórico, y la pestaña que lo trajo no cambia eso.
            title = stringResource(R.string.massas_history_title),
            onBack = onBack,
            onHelp = onHelp,
        )
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = selectedDate == today,
                onClick = { onSelectDate(today) },
                label = { Text(MASSAS_HISTORY_TODAY_LABEL) },
                modifier = Modifier.defaultMinSize(minHeight = 44.dp).testTag(MASSAS_HISTORY_DAY_TODAY_TAG),
            )
            massasHistoryCalendarDays(today).forEach { date ->
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
                label = { Text(MASSAS_HISTORY_ALL_LABEL) },
                modifier = Modifier.defaultMinSize(minHeight = 44.dp).testTag(MASSAS_HISTORY_DAY_ALL_TAG),
            )
        }
    }
}
