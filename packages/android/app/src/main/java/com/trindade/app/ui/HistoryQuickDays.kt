package com.trindade.app.ui

import java.time.LocalDate

/**
 * Las cinco fechas anteriores que ofrece un histórico, o todas las que el archivo reportó.
 *
 * El archivo del servidor manda: sus fechas salen primero y en el orden en que llegan. Cuando tiene menos de cinco
 * -- tres días de producción son tres chips, y el requisito pide cinco -- las que faltan se completan con el
 * calendario, de la más reciente hacia atrás, sin repetir ninguna. Un día sin datos abre su estado vacío, que es
 * una respuesta; un día que no está en la fila no se puede ni consultar.
 *
 * Con [all] no se completa: «Todas as datas» es el archivo, y rellenarlo con días que no existen sería inventar
 * historia.
 */
fun historyQuickDays(today: String, dates: List<String>, all: Boolean, count: Int = 5): List<String> {
    val earlier = dates.distinct().filter { it != today }.sortedDescending()
    if (all) return earlier.sortedDescending()

    val shown = earlier.take(count).toMutableList()
    if (shown.size >= count) return shown

    // El día de planta es el techo del calendario: una fecha futura no es archivo.
    val anchor = runCatching { LocalDate.parse(today) }.getOrNull() ?: return shown.sortedDescending()
    var candidate = anchor.minusDays(1)
    while (shown.size < count) {
        val iso = candidate.toString()
        if (iso !in shown && iso != today) shown += iso
        candidate = candidate.minusDays(1)
    }
    // La fila se lee de la más reciente a la más vieja, aunque un día del archivo sea más viejo que los rellenos:
    // el archivo manda sobre qué se ofrece, el calendario sobre qué se completa, y el orden es siempre el mismo.
    return shown.sortedDescending()
}
