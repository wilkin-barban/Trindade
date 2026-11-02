import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AERO_ERROR_MAX,
  AERO_NOTE_MAX,
  AERO_RESPONSE_MAX,
  buildAeroAuditBody,
  aeroImportAuditEvent,
  aeroReceiptsAuditEvent,
  type AeroAuditBody,
} from './aero-audit';
import { aeroTestRequestedEvent, aeroTestResultEvent } from './aero-test';

/**
 * The ERP log is one table with three authors, and this is the web's end of the contract.
 *
 * The backend has its own contract file with the schema it enforces. What it cannot have is the web's
 * emitters: they live here, so a row transcribed there would be a copy nobody keeps. The bodies below are
 * built by calling the real emitters and the real normalizer, which is what makes this file fail the day an
 * emitter stops sending `client` or `attemptId` -- the two fields that turn a pile of lines into a trail.
 *
 * The lengths are the server's columns. The normalizer trims to them, and a body that does not fit is a 400.
 */

const DESTINATION = 'http://192.168.25.250:1453/api/usuarios';

const ATTEMPT = 'attempt-7f3c2a10';

/** The pair a screen writes: the attempt before the phone leaves, and the answer when it comes back. */
function connectionPair(): [AeroAuditBody, AeroAuditBody] {
  const startedAt = 1_700_000_000_000;
  const requested = buildAeroAuditBody(
    { ...aeroTestRequestedEvent({ destinationUrl: DESTINATION, reason: 'mixed_content' }), attemptId: ATTEMPT, startedAt },
    startedAt
  );
  const result = buildAeroAuditBody(
    { ...aeroTestResultEvent({ verdict: 'ok', raw: 'true', destinationUrl: DESTINATION }), attemptId: ATTEMPT, startedAt },
    startedAt + 1840
  );
  return [requested, result];
}

describe('aero log contract: what a web emitter really sends', () => {
  it('accepts the body a web launch actually sends', () => {
    const body = buildAeroAuditBody(
      aeroImportAuditEvent({ date: '2026-11-02', entLan: 3010, productCode: '000123', boxes: 4 })
    );

    assert.equal(body.event, 'import');
    assert.equal(body.phase, 'result');
    assert.equal(body.client, 'web');
    assert.equal(body.destinationUrl, '/api/massas-launch');
    assert.ok(body.attemptId.length > 0);
    assert.ok(body.note?.includes('ent_lan=3010'));
  });

  it('requires client and attemptId on both members of the pair', () => {
    const [requested, result] = connectionPair();

    // The same attempt on both lines is what pairs an answer with its question; without it the log can only
    // be guessed at by comparing timestamps and payloads.
    assert.equal(requested.attemptId, ATTEMPT);
    assert.equal(result.attemptId, ATTEMPT);
    assert.equal(requested.client, 'web');
    assert.equal(result.client, 'web');
  });

  it('stamps the time the action took, and never a negative or missing one', () => {
    const [requested, result] = connectionPair();

    assert.equal(requested.durationMs, 0);
    assert.equal(result.durationMs, 1840);

    // An explicit duration wins over the clock, and a caller that only knows the end still sends a number.
    const explicit = buildAeroAuditBody({ event: 'import', destinationUrl: '/api/massas-launch', durationMs: 12 });
    assert.equal(explicit.durationMs, 12);
    assert.equal(buildAeroAuditBody({ event: 'import', destinationUrl: '/api/massas-launch' }).durationMs, 0);
  });

  it('keeps the receipts read on the same pair, so the lens is readable later', () => {
    const body = buildAeroAuditBody(
      aeroReceiptsAuditEvent({ date: '2026-11-02', insumos: 3, destinationUrl: 'http://erp/movimentos', attemptId: ATTEMPT })
    );

    assert.equal(body.event, 'read_history');
    assert.equal(body.attemptId, ATTEMPT);
    assert.equal(body.client, 'web');
    assert.ok(body.note?.includes('lens=recebimento'));
    assert.ok(body.note?.includes('insumos=3'));
  });

  it('trims every body to the columns the server enforces', () => {
    const bodies = [
      connectionPair()[0],
      connectionPair()[1],
      buildAeroAuditBody(
        aeroImportAuditEvent({
          date: '2026-11-02',
          entLan: 3010,
          productCode: 'X'.repeat(300),
          boxes: 4,
          error: 'boom '.repeat(400),
        })
      ),
      buildAeroAuditBody(
        aeroReceiptsAuditEvent({
          date: '2026-11-02',
          insumos: 0,
          destinationUrl: 'http://erp/movimentos',
          error: 'nope '.repeat(400),
        })
      ),
    ];

    for (const body of bodies) {
      assert.ok((body.note ?? '').length <= AERO_NOTE_MAX, `note over ${AERO_NOTE_MAX}`);
      assert.ok((body.error ?? '').length <= AERO_ERROR_MAX, `error over ${AERO_ERROR_MAX}`);
      assert.ok((body.response ?? '').length <= AERO_RESPONSE_MAX, `response over ${AERO_RESPONSE_MAX}`);
      assert.ok(body.attemptId.length <= 64);
      assert.ok(body.durationMs <= 600_000);
    }
  });
});
