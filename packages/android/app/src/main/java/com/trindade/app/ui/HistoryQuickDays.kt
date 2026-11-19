package com.trindade.app.ui

import java.time.LocalDate

/**
 * Las fechas rápidas de un histórico, y el archivo completo cuando se piden todas.
 *
 * Los cinco chips son **siempre las cinco fechas de calendario inmediatamente anteriores a hoy** (hoy-1 … hoy-5,
 * hoy aparte), no las cinco primeras del archivo. La verificación en planta lo dejó claro: con un archivo de
 * 18, 17, 16, 13 y 12/11, tomar las cinco del archivo se saltaba el 15 y el 14 -- las dos fechas pasadas más
 * recientes que faltaban -- y ofrecía en su lugar días más viejos, que es lo contrario de lo que el operario
 * espera de una fila que dice «fechas anteriores». Un día del calendario sin producción abre su estado vacío, que
 * es una respuesta; un día ausente no se puede ni pedir.
 *
 * «Todas as datas» es el archivo: lo que el servidor reportó, de la más reciente a la más vieja, sin hoy y sin
 * relleno. Ahí viven los días que quedan fuera de la ventana.
 */
fun historyQuickDays(today: String, dates: List<String>, all: Boolean, count: Int = 5): List<String> {
    val earlier = dates.distinct().filter { it != today }.sortedDescending()
    if (all) return earlier

    val anchor = runCatching { LocalDate.parse(today) }.getOrNull() ?: return emptyList()
    return (1..count).map { offset -> anchor.minusDays(offset.toLong()).toString() }
}
