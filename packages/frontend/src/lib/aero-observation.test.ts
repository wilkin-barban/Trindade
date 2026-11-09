import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAeroLaunchTrips } from './aero-batch';
import { buildEntradaItemPayload, trindadeObservation } from './aero-integration';

/**
 * The origin fingerprint Delphi receives.
 *
 * `ENT_OBS` is free text, and it is the only field the ERP keeps that can point back at the launch that
 * produced the entry: the plant checks a doubtful seat by reading its observation. So a launch that went out
 * from Trindade says which one, and a payload built without it keeps the sentence the ERP already knew.
 */
describe('trindadeObservation', () => {
  it('names the launch ids it carries', () => {
    assert.equal(trindadeObservation([12]), 'Trindade #12');
    assert.equal(trindadeObservation([12, 13]), 'Trindade #12, #13');
  });

  it('falls back to the sentence the ERP already knew when there is no id to name', () => {
    assert.equal(trindadeObservation([]), 'Lancamento de massas via Trindade');
    assert.equal(trindadeObservation(undefined), 'Lancamento de massas via Trindade');
  });
});

describe('buildEntradaItemPayload ENT_OBS', () => {
  const base = {
    productCode: '1192',
    productName: 'MASSA QUADRADA',
    quantity: 90,
    entryDate: '2026-06-12',
    userCode: 'WILKIN',
  };

  it('carries the Trindade ids of the launch that produced it', () => {
    const payload = buildEntradaItemPayload({ ...base, launchIds: [41, 42] });
    assert.equal(payload.ENT_OBS, 'Trindade #41, #42');
  });

  it('keeps its old observation when the launch has no id to quote', () => {
    assert.equal(buildEntradaItemPayload(base).ENT_OBS, 'Lancamento de massas via Trindade');
    assert.equal(
      buildEntradaItemPayload({ ...base, observation: 'Lanzamiento desde Trindade' }).ENT_OBS,
      'Lanzamiento desde Trindade',
    );
  });
});

describe('the certified payload', () => {
  it('travels the Trindade observation verbatim inside the payload the ticket carries', () => {
    const payload = buildEntradaItemPayload({
      productCode: '1192',
      productName: 'MASSA QUADRADA',
      quantity: 90,
      entryDate: '2026-06-12',
      userCode: 'WILKIN',
      launchIds: [77],
    });
    const [trip] = buildAeroLaunchTrips({
      payloads: [payload],
      singleCallbackPath: '/massas-launch',
      batchCallbackPath: '/massas-launch',
    });

    // The page no longer builds the envelope: the server serialises it from these payloads. What must survive the
    // trip is the observation, because the shortcut sends exactly what came back in `body`.
    assert.equal(trip!.action, 'entrada');
    assert.equal(trip!.payloads.length, 1);
    assert.equal((trip!.payloads[0] as { ENT_OBS: string }).ENT_OBS, 'Trindade #77');
    assert.equal(JSON.parse(JSON.stringify(trip!.payloads[0])).ENT_OBS, 'Trindade #77');
  });
});
