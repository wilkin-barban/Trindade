import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The wiring of the Recebimento sync, read as source.
 *
 * The behaviour is covered by the browser run in `__e2e__/report-receipts.spec.ts`; what is asserted here is
 * that the section keeps the three things that make the round trip safe: it comes back to its own page, it
 * stores the whole snapshot, and it counts only the supplies.
 */
const section = readFileSync(new URL('./ReceiptsSection.tsx', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../../lib/aero-mirror.ts', import.meta.url), 'utf8');

describe('receipts sync wiring', () => {
  it('hands the shortcut this page as the return, so the reporter never leaves the report', () => {
    // One sync wiring for the report's single button and for this section: it lives in the mirror module.
    assert.ok(section.includes('triggerAeroMovementsSync(settings, { date, callbackPath: location.pathname })'));
    assert.ok(helper.includes("aeroBridgeCallbackFor('movimentos', options.callbackPath)"));
    // El sobre con Authorization ya no se arma acá: se pide un ticket de la acción y el servidor escribe la
    // petición. Lo único que viaja desde esta página es el cuerpo certificado de los movimientos.
    assert.ok(helper.includes('requestAeroBridgeTicket('));
    assert.ok(helper.includes('aeroMovementsPayload({ date: options.date, userName: null })'));
  });

  it('reads the same callback the launch screen reads, and only for the movements action', () => {
    assert.ok(section.includes("parsed.kind !== 'bridge' || parsed.action !== 'movimentos'"));
    assert.ok(section.includes('window.history.replaceState'));
  });

  it('stores the whole day and counts the supplies lens, never the raw answer', () => {
    assert.ok(section.includes('buildAeroMovementsSnapshot(date, read.movements)'));
    assert.ok(section.includes("receiptsSyncFeedback({ status: 'ok', count: stored?.insumos ?? 0 })"));
    assert.equal(/read\.movements\.length/.test(section), false, 'the raw seat count must never reach the dialog');
  });

  it('leaves a line in the shared log when the day it stored is receipts', () => {
    // Both blocks store the same snapshot; without the lens word the log holds two identical reads of one
    // day and nobody can tell whether the supplies were ever answered for.
    assert.ok(section.includes('aeroReceiptsAuditEvent('));
    assert.ok(section.includes('postAeroAuditEvent(aeroReceiptsAuditEvent({ ...passport, insumos: stored?.insumos ?? 0 }))'));
    // A store the backend refused is a different failure from an unreachable plant, and it is named.
    assert.ok(section.includes("error: 'AERO_SNAPSHOT_REFUSED'"));
  });

  it('keeps the sync and refresh controls at the 44px touch floor', () => {
    assert.ok(section.includes('data-testid="receipts-sync"'));
    assert.equal((section.match(/min-h-\[44px\]/g) ?? []).length >= 2, true);
  });
});
