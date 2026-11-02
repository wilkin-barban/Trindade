import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createReport, updateReport } from './reports.command.service.js';
import { getReport } from './reports.query.service.js';
import { closeReportDatabases, completeTemperatures, setupReportsDb } from './reports-test-helper.js';

afterEach(closeReportDatabases);

describe('reports command service characterization', () => {
  it('persists Spanish notes through local translation without provider requests', async (t) => {
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      requests += 1;
      throw new Error('Network forbidden');
    });
    const db = setupReportsDb();
    const report = await createReport(db, 1, {
      turno: 'tarde', notes: 'Producto pendiente xyz', items: [],
      temperatures: completeTemperatures(db),
    });
    assert.equal(report.notes, 'Produto pendente xyz');
    const updated = await updateReport(db, report.id, { notes: 'Todo pendiente abc' }, { sub: 1, role: 'Administrador' });
    assert.ok(!('error' in updated));
    if (!('error' in updated)) assert.equal(updated.notes, 'Tudo pendente abc');
    assert.equal(requests, 0);
  });
  it('creates selected products with the complete required temperature set and rejects duplicates', async () => {
    const db = setupReportsDb();
    const taskId = (db.prepare("SELECT id FROM report_tasks WHERE category_id = 1 LIMIT 1").get() as { id: number }).id;
    const body = { turno: 'tarde' as const, items: [{ taskId, checked: true, selectedProducts: ['Item A'] }], temperatures: completeTemperatures(db) };
    const report = await createReport(db, 1, body);
    assert.deepEqual(report.items[0].selectedProducts, ['Item A']);
    await assert.rejects(createReport(db, 1, body), { message: 'reportAlreadyExists' });
  });

  /**
   * A report records the day, so the day's "no" is a row and not an absence.
   *
   * The body a client now sends carries one entry per task, marked or not; the command keeps the unmarked ones
   * as `checked = 0` on create and on update. Reading the report back is what a person and the export do, so
   * that is where these assertions look.
   */
  it('keeps a row for every task it is given, marked or not, and does not delete the unmarked ones on update', async () => {
    const db = setupReportsDb();
    const tasks = db
      .prepare("SELECT id FROM report_tasks WHERE category_id = 1 ORDER BY id LIMIT 2")
      .all() as { id: number }[];
    const [first, second] = tasks;

    const report = await createReport(db, 1, {
      turno: 'tarde',
      items: [
        { taskId: first.id, checked: true },
        { taskId: second.id, checked: false },
      ],
      temperatures: completeTemperatures(db),
    });

    const created = getReport(db, report.id);
    assert.deepEqual(
      created?.items.map((item) => [item.task_id, item.checked]),
      [
        [first.id, true],
        [second.id, false],
      ],
    );

    const updated = await updateReport(
      db,
      report.id,
      {
        items: [
          { taskId: first.id, checked: false },
          { taskId: second.id, checked: true },
        ],
      },
      { sub: 1, role: 'Administrador' },
    );
    assert.ok(!('error' in updated));

    const afterUpdate = getReport(db, report.id);
    assert.deepEqual(
      afterUpdate?.items.map((item) => [item.task_id, item.checked]),
      [
        [first.id, false],
        [second.id, true],
      ],
    );
  });

  it('rejects incomplete temperatures and maps invalid item references to 400', async () => {
    const db = setupReportsDb();
    await assert.rejects(
      createReport(db, 1, { turno: 'tarde', items: [], temperatures: completeTemperatures(db).slice(1) }),
      { message: 'Falta colocar as temperaturas no relatório.' }
    );
    await assert.rejects(
      createReport(db, 1, { turno: 'tarde', items: [{ taskId: 9999, checked: true }], temperatures: completeTemperatures(db) }),
      { message: 'Violação de restrição de banco de dados (ID inválido ou duplicado).' }
    );
  });

  it('updates selected products and rejects non-owner updates without network translation', async () => {
    const db = setupReportsDb();
    const taskId = (db.prepare("SELECT id FROM report_tasks WHERE category_id = 1 LIMIT 1").get() as { id: number }).id;
    const report = await createReport(db, 1, { turno: 'tarde', notes: '  local note  ', items: [], temperatures: completeTemperatures(db) });
    const updated = await updateReport(db, report.id, { items: [{ taskId, checked: false, selectedProducts: ['Item B'] }] }, { sub: 1, role: 'Administrador' });
    assert.ok(!('error' in updated));
    if (!('error' in updated)) assert.deepEqual(updated.items[0].selectedProducts, ['Item B']);
    const denied = await updateReport(db, report.id, { notes: 'unchanged' }, { sub: 2, role: 'Trabalhador' });
    assert.deepEqual(denied, { error: 'Registro somente leitura. Apenas o criador pode editar no dia atual ou no dia anterior.', status: 403 });
  });
});
