import { z } from 'zod';

/**
 * The operational dashboard summary.
 *
 * Every count is computed server-side, and the date-based ones use the São Paulo day rather than the
 * device's: `reportsToday` counts today's reports, `schedulesTomorrow` tomorrow's loading entries.
 *
 * `activeScheduleDate` and `activeScheduleCount` are the operational window's answer -- which loading day
 * an operator is working on right now and how many entries it has -- which is today's schedule until ten
 * in the morning and the next loading day from then on. A batch is stored under the day it is prepared and
 * loaded on the following loading day, so the count is of the batch's entries and
 * `activeScheduleBatchDate` names that batch: it is the date to hand to the loading export to get the text
 * for the day the card is showing, and null on a day no batch announces (a Saturday).
 *
 * `schedulesTomorrow` is the older field and counts what it always counted: the entries stored for
 * tomorrow's date, which under the convention above is tomorrow's batch, loaded the day after.
 * `latestReportId` is the newest active report for today, or null when there is none.
 *
 * `higieneDone`/`higieneTotal` is the checklist of the day: how many of its tasks are checked. `recepcionDone`
 * is the number of **distinct products** the ERP's mirror says were received today -- the reception is a fishing
 * list of goods, not a checklist of tasks, and the old `recepcionTotal` was the count of a category's tasks, a
 * denominator that no longer existed. `recepcionSynced` says whether the day was read from the ERP at all, because
 * "nothing arrived" and "nobody looked" are different sentences and a zero cannot tell them apart.
 */
export const DashboardSummarySchema = z
  .object({
    reportsToday: z.number().int(),
    schedulesTomorrow: z.number().int(),
    activeScheduleDate: z.string(),
    activeScheduleBatchDate: z.string().nullable(),
    activeScheduleCount: z.number().int(),
    activeUsers: z.number().int(),
    reportsTotal: z.number().int(),
    schedulesTotal: z.number().int(),
    latestReportId: z.number().int().nullable(),
    /**
     * Si el actor puede editar el último reporte de hoy.
     *
     * Lo decide el servidor: dueño o administrador, y sólo mientras el día es hoy. La tarjeta del dashboard lo
     * refleja y no lo calcula.
     */
    latestReportCanEdit: z.boolean(),
    /** Si el actor puede editar el lote de carga que la tarjeta está mostrando: dueño o administrador. */
    activeScheduleCanEdit: z.boolean(),
    higieneDone: z.number().int(),
    higieneTotal: z.number().int(),
    /** Productos distintos recibidos hoy según el espejo del ERP; 0 cuando el día no se sincronizó. */
    recepcionDone: z.number().int(),
    /** Si el día se leyó del ERP. Sin esto, un 0 se lee como «no llegó nada» cuando nadie miró. */
    recepcionSynced: z.boolean(),
  })
  .strict();

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
