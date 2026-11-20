import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Today is manageable, earlier days are read-only (S9 / T8).
 *
 * Para el día de planta: compartir, editar/borrar lanzamientos, relanzar y sincronizar.
 * Para las fechas pasadas: no se dibuja el cuerpo -- ni tabla, ni nota de solo lectura, ni sync --; debajo del
 * selector de fecha queda sólo el bloque de WhatsApp, que es el registro que se comparte.
 */
const historyPage = readFileSync(new URL('../MassasHistoryPage.tsx', import.meta.url), 'utf8');

describe('massas history is read-only on past days, manageable today (S9)', () => {
  it('hands the day table read-only mode for past days', () => {
    assert.match(historyPage, /readOnly=\{isPastDay\}/);
    assert.match(historyPage, /const isPastDay = date < today;/);
    assert.match(historyPage, /const isToday = date === today;/);
  });

  it('reconciles the day with the ERP mirror, like the launch screen does', () => {
    // Without the mirror the history only knows what Trindade recorded, so a launch the ERP already received
    // reads as pending and the day's balance is short by exactly those boxes.
    assert.ok(historyPage.includes('/integration/aero/movements?date='));
    assert.ok(historyPage.includes('massasUnifiedRows('));
    assert.ok(historyPage.includes('unifiedRows={unifiedRows}'));
    assert.ok(historyPage.includes('unifiedDate={date}'));
  });

  it('guards the whole body behind isToday, and leaves only the message on past days', () => {
    assert.ok(historyPage.includes('onStartEdit={isToday ? startEditing : undefined}'));
    assert.ok(historyPage.includes('onDelete={isToday ? handleDeleteLaunch : undefined}'));
    assert.ok(historyPage.includes('onSendToErp={isToday ? handleSendPendingLaunch : undefined}'));
    // El cuerpo -- tabla, tarjeta vacía, sync, resultados -- es del día que se opera.
    assert.ok(historyPage.includes('{isToday && dayView && (dayView.launches.length > 0 || unifiedRows.length > 0) && ('));
    assert.ok(historyPage.includes('{isToday && dayView && dayView.launches.length === 0 && unifiedRows.length === 0 && ('));
    assert.ok(historyPage.includes('{isToday && aeroAllowed && syncAwaiting && ('));
    // Y el pasado no lleva ni nota ni tarjeta vacía: sólo el share.
    assert.equal(historyPage.includes('data-testid="massas-history-readonly"'), false);
  });
});
