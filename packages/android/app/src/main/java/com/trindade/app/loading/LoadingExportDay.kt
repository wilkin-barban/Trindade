package com.trindade.app.loading

import java.time.DayOfWeek
import java.time.LocalDate

/**
 * El día que anuncia el texto del Horario para un lote: el siguiente, o el lunes cuando el lote es de un viernes.
 *
 * Es la regla de `nextLoadingDateString` en `packages/backend/src/modules/loading/loading.export.service.ts`, y
 * existe acá por una razón concreta: la tarjeta de compartir muestra el texto del servidor, y ese texto fecha el
 * **cargamento**, no el lote. Con la fecha del lote en el subtítulo, el 18/11/2026 se leía arriba y
 * «Quinta-feira • 19/11/2026» abajo, en la misma tarjeta.
 *
 * No es el `loading_date` del historial: ese lo calcula el servidor como el propio día del lote cuando cae en
 * viernes, y la regla del texto manda ese lote al lunes. Son dos fechas distintas y la que la tarjeta tiene que
 * decir es la del texto que muestra.
 *
 * Se replica porque el export solo se pide por la fecha del lote y no devuelve la etiqueta por separado; el test de
 * esta función fija los siete días de la semana, viernes incluido.
 */
fun exportLoadingDay(batchDate: String): String {
    val batch = LocalDate.parse(batchDate)
    val loading = if (batch.dayOfWeek == DayOfWeek.FRIDAY) batch.plusDays(3) else batch.plusDays(1)
    return loading.toString()
}
