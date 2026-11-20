import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getSaoPauloDateString } from '../../utils/date.js';
import { activeScheduleBatchDate, activeScheduleDate } from './active-schedule.js';
import { GUEST_USERNAME } from '../../guest-user.js';
import { isAdmin } from '../history-permissions.js';
import { dayReceipts } from '../reports/receipts.service.js';

interface CountRow {
  count: number;
}

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/summary',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const db = fastify.db;
      const today = getSaoPauloDateString();
      const tomorrow = getSaoPauloDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));
      // The day the card is about, which is not always tomorrow: see `activeScheduleDate`.
      const activeDate = activeScheduleDate();
      const activeBatchDate = activeScheduleBatchDate();

      const reportsToday = db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM reports
           WHERE report_date = ? AND is_active = 1`
        )
        .get(today) as CountRow;

      const latestReport = db
        .prepare(
          `SELECT id, user_id FROM reports
           WHERE report_date = ? AND is_active = 1
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(today) as { id: number } | undefined;

      const schedulesTomorrow = db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM loading_schedules
           WHERE schedule_date = ? AND is_active = 1`
        )
        .get(tomorrow) as CountRow;

      // A batch is stored under the day it is prepared and loaded on the next loading day, so the entries
      // that belong to the day being loaded are its batch's. A loading day with no batch -- one the calendar
      // never loads -- has none, and zero is the honest answer rather than the rows of the day itself.
      const schedulesActive =
        activeBatchDate === null
          ? { count: 0 }
          : (db
              .prepare(
                `SELECT COUNT(*) AS count
                 FROM loading_schedules
                 WHERE schedule_date = ? AND is_active = 1`
              )
              .get(activeBatchDate) as CountRow);

      // El dueño del lote activo: la tarjeta ofrece Editar sólo a quien lo preparó o a un administrador.
      const activeScheduleOwner =
        activeBatchDate === null
          ? null
          : ((db
              .prepare(
                `SELECT user_id
                 FROM loading_schedules
                 WHERE schedule_date = ? AND is_active = 1
                 ORDER BY id ASC
                 LIMIT 1`
              )
              .get(activeBatchDate) as { user_id?: number } | undefined)?.user_id ?? null);

      const activeUsers = db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM users
           WHERE is_active = 1 AND username != ?`
        )
        .get(GUEST_USERNAME) as CountRow;

      const reportsTotal = db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM reports
           WHERE is_active = 1`
        )
        .get() as CountRow;

      const schedulesTotal = db
        .prepare(
          `SELECT COUNT(DISTINCT schedule_date) AS count
           FROM loading_schedules
           WHERE is_active = 1`
        )
        .get() as CountRow;

      const higieneDone = db
        .prepare(
          `SELECT COUNT(DISTINCT ri.task_id) AS count
           FROM report_items ri
           JOIN reports r ON ri.report_id = r.id
           JOIN report_tasks rt ON ri.task_id = rt.id
           WHERE r.report_date = ? AND r.is_active = 1 AND rt.category_id = 1 AND ri.checked = 1`
        )
        .get(today) as CountRow;

      const higieneTotal = db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM report_tasks
           WHERE category_id = 1 AND is_active = 1`
        )
        .get() as CountRow;

      // La recepción ya no es la lista de tareas de una categoría: es lo que el ERP registró, contado por producto
      // distinto -- el grupo pregunta cuántas mercaderías llegaron, no cuántas líneas tiene el espejo.
      // `recepcionSynced` separa "no llegó nada" de "nadie miró": un cero sin sincronización no dice nada.
      const receipts = dayReceipts(db, today);
      const recepcionDone = new Set(receipts.receipts.map((receipt) => receipt.productCode)).size;
      const recepcionSynced = receipts.migrated && receipts.syncedAt !== null;

      // Editar es del dueño o del administrador **hoy**, y sólo hoy: el pasado es inmutable. Lo decide el
      // servidor y la UI sólo lo refleja; el resumen es de hoy por definición, así que el día no hay que
      // compararlo otra vez.
      const actor = request.user!;
      const isAdminToday = isAdmin({ sub: actor.sub, role: actor.role });
      const activeScheduleCanEdit =
        activeScheduleOwner !== null && (isAdminToday || activeScheduleOwner === actor.sub);
      const latestReportCanEdit =
        latestReport !== undefined &&
        (isAdminToday || (latestReport as { user_id?: number }).user_id === actor.sub);

      return reply.send({
        reportsToday: reportsToday.count,
        schedulesTomorrow: schedulesTomorrow.count,
        activeScheduleDate: activeDate,
        activeScheduleBatchDate: activeBatchDate,
        activeScheduleCount: schedulesActive.count,
        activeUsers: activeUsers.count,
        reportsTotal: reportsTotal.count,
        schedulesTotal: schedulesTotal.count,
        latestReportId: latestReport?.id || null,
        latestReportCanEdit,
        activeScheduleCanEdit,
        higieneDone: higieneDone.count,
        higieneTotal: higieneTotal.count,
        recepcionDone,
        recepcionSynced,
      });
    }
  );
}
