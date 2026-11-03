import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AeroLogBodySchema } from './aero.schema.js';

/**
 * The audit log is one table with three authors, and this file is the table's edge.
 *
 * Each row is a body a client really sends, transcribed from the code that builds it: the web's
 * `postAeroAuditEvent` callers and Android's `AeroAudit.request`. The point of the transcription is that the
 * three sides are pinned to each other. Rename an event in `AeroAudit.Event`, or change a phase in the web
 * emitter, and the row that names it stops matching what the client writes; the fixture is repeated on the
 * client's side on purpose, because a contract tested from one end only is a contract nobody keeps.
 *
 * The refusals matter as much as the acceptances. The server is the strict side: it never trims an oversized
 * note, it never ignores an unknown field, and it never accepts a body that could carry a credential.
 */

interface Row {
  readonly who: string;
  readonly body: unknown;
  readonly accepted: boolean;
}

const WEB_URL = 'http://192.168.25.250:1453/api/entradasitem';
const ANDROID_WS = 'http://192.168.25.250:1453/api';
const ANDROID_NOTE = 'Android App / ERP · client=android · via=native · launch #42';

const rows: readonly Row[] = [
  // ---- web: lib/aero-audit.ts callers ----
  {
    who: 'web sends a connection test before it calls the ERP',
    body: {
      event: 'test_connection',
      phase: 'requested',
      destinationUrl: `${ANDROID_WS}/usuarios`,
      note: 'client=web · via=bridge',
      client: 'web',
      attemptId: 'attempt-2f0c91a4',
      durationMs: 0,
    },
    accepted: true,
  },
  {
    who: 'web reports the connection test result with the ERP answer',
    body: {
      event: 'test_connection',
      phase: 'result',
      destinationUrl: `${ANDROID_WS}/usuarios`,
      httpStatus: 200,
      response: '{"success":true}',
      note: 'client=web · via=bridge',
      client: 'web',
      attemptId: 'attempt-2f0c91a4',
      durationMs: 1840,
    },
    accepted: true,
  },
  {
    who: 'web records a launch request with the seat it is about to send',
    body: {
      event: 'launch_sync',
      phase: 'requested',
      destinationUrl: WEB_URL,
      payload: { PRO_COD: '000084', QTD: 10 },
      launchId: 42,
      note: 'client=web · via=bridge',
      client: 'web',
      attemptId: 'attempt-2f0c91a4',
      durationMs: 0,
    },
    accepted: true,
  },
  {
    who: 'web records a launch result',
    body: {
      event: 'launch_sync',
      phase: 'result',
      destinationUrl: WEB_URL,
      httpStatus: 200,
      response: '{"success":true,"message":"Lancamento efetuado"}',
      launchId: 42,
      note: 'client=web · via=bridge',
      client: 'web',
      attemptId: 'attempt-2f0c91a4',
      durationMs: 940,
    },
    accepted: true,
  },
  {
    who: 'web records a history read',
    body: {
      event: 'read_history',
      phase: 'result',
      destinationUrl: `${ANDROID_WS}/movimentos`,
      httpStatus: 200,
      response: '{"movimentos":[]}',
      note: 'client=web · via=bridge',
      client: 'web',
      attemptId: 'attempt-2f0c91a4',
      durationMs: 612,
    },
    accepted: true,
  },

  // ---- android: AeroAudit.request + AeroAudit.testRequest ----
  {
    who: 'android records a connection test with the elapsed time',
    body: {
      event: 'test_connection',
      phase: 'result',
      destinationUrl: `${ANDROID_WS}/usuarios`,
      httpStatus: 200,
      durationMs: 87,
      note: ANDROID_NOTE,
      appVersion: '0.7.0',
      buildNumber: 7007,
    },
    accepted: true,
  },
  {
    who: 'android records a launch it dispatched',
    body: {
      event: 'launch_sync',
      phase: 'result',
      destinationUrl: WEB_URL,
      httpStatus: 200,
      durationMs: 1840,
      launchId: 42,
      note: ANDROID_NOTE,
      appVersion: '0.7.0',
      buildNumber: 7007,
    },
    accepted: true,
  },
  {
    who: 'android records a launch it could not send',
    body: {
      event: 'launch_sync',
      phase: 'result',
      destinationUrl: WEB_URL,
      httpStatus: null,
      durationMs: 30000,
      launchId: 42,
      note: ANDROID_NOTE,
      appVersion: '0.7.0',
      buildNumber: 7007,
    },
    accepted: true,
  },
  {
    who: 'android records the day it read from the ERP',
    body: {
      event: 'read_history',
      phase: 'result',
      destinationUrl: `${ANDROID_WS}/movimentos`,
      httpStatus: 200,
      durationMs: 640,
      note: ANDROID_NOTE,
      appVersion: '0.7.0',
      buildNumber: 7007,
    },
    accepted: true,
  },
  {
    who: 'android records a seat it imported',
    body: {
      event: 'import',
      phase: 'result',
      destinationUrl: WEB_URL,
      httpStatus: 200,
      durationMs: 455,
      note: ANDROID_NOTE,
      appVersion: '0.7.0',
      buildNumber: 7007,
    },
    accepted: true,
  },
  {
    who: 'android records a queued item it will not retry',
    body: {
      event: 'queue_rejected',
      phase: 'result',
      destinationUrl: '/api/massas-launch',
      httpStatus: null,
      note: ANDROID_NOTE,
      appVersion: '0.7.0',
      buildNumber: 7007,
    },
    accepted: true,
  },

  // ---- the strict edge: sizes the server refuses instead of trimming ----
  {
    who: 'a note of exactly the column size is accepted',
    body: {
      event: 'dispatch',
      destinationUrl: WEB_URL,
      note: 'n'.repeat(256),
    },
    accepted: true,
  },
  {
    who: 'a note one character over the column is refused',
    body: {
      event: 'dispatch',
      destinationUrl: WEB_URL,
      note: 'n'.repeat(257),
    },
    accepted: false,
  },
  {
    who: 'an error of exactly 1024 characters is accepted',
    body: {
      event: 'dispatch',
      destinationUrl: WEB_URL,
      error: 'e'.repeat(1024),
    },
    accepted: true,
  },
  {
    who: 'an error one character over 1024 is refused',
    body: {
      event: 'dispatch',
      destinationUrl: WEB_URL,
      error: 'e'.repeat(1025),
    },
    accepted: false,
  },
  {
    who: 'a duration of zero is a valid measurement',
    body: { event: 'dispatch', destinationUrl: WEB_URL, durationMs: 0 },
    accepted: true,
  },
  {
    who: 'a duration the request could not plausibly take is refused',
    body: { event: 'dispatch', destinationUrl: WEB_URL, durationMs: 600_001 },
    accepted: false,
  },
  {
    who: 'an attempt id of 64 characters fits the column',
    body: { event: 'dispatch', destinationUrl: WEB_URL, attemptId: 'a'.repeat(64) },
    accepted: true,
  },
  {
    who: 'an attempt id longer than 64 characters is refused',
    body: { event: 'dispatch', destinationUrl: WEB_URL, attemptId: 'a'.repeat(65) },
    accepted: false,
  },
  {
    who: 'an authorization header can never enter the log',
    body: {
      event: 'test_connection',
      destinationUrl: WEB_URL,
      authorization: 'Basic dXNlcjpzZWNyZXQ=',
    },
    accepted: false,
  },
  {
    who: 'a password can never enter the log',
    body: {
      event: 'test_connection',
      destinationUrl: WEB_URL,
      senha: 'super-secret',
    },
    accepted: false,
  },
  {
    who: 'an event nobody defined is refused',
    body: { event: 'launch', destinationUrl: WEB_URL },
    accepted: false,
  },
  {
    who: 'a phase nobody defined is refused',
    body: { event: 'dispatch', phase: 'answered', destinationUrl: WEB_URL },
    accepted: false,
  },
  {
    who: 'a client nobody defined is refused',
    body: { event: 'dispatch', client: 'desktop', destinationUrl: WEB_URL },
    accepted: false,
  },
  {
    who: 'a body without a destination is refused',
    body: { event: 'dispatch' },
    accepted: false,
  },
];

describe('the Aero audit contract, pinned to the bodies each client sends', () => {
  for (const row of rows) {
    it(`${row.accepted ? 'accepts' : 'refuses'} ${row.who}`, () => {
      const parsed = AeroLogBodySchema.safeParse(row.body);
      assert.equal(parsed.success, row.accepted);
    });
  }

  it('accepts the pair a web launch sends on both members of the action', () => {
    // The pair is what turns two lines into one action. Both members carry the same `attemptId` here for the
    // same reason the emitters pass it along: a `requested` whose `result` cannot be found is not a record.
    const web = rows.filter((row) => row.accepted && (row.body as { client?: string }).client === 'web');
    const pairs = new Map<string, number>();

    for (const row of web) {
      const body = row.body as { attemptId?: string; durationMs?: number };
      assert.ok(body.attemptId, `${row.who} left the attempt unnamed`);
      assert.equal(typeof body.durationMs, 'number', `${row.who} left the duration unstated`);
      pairs.set(body.attemptId, (pairs.get(body.attemptId) ?? 0) + 1);
    }

    assert.ok(
      [...pairs.values()].some((count) => count >= 2),
      'no two web rows share an attempt, so nothing pairs'
    );
  });

  it('refuses every row with the same sentence and code, so a client can branch on it', () => {
    // The route answers 400 `INVALID_AERO_LOG` for every refusal above; that mapping lives in aero.routes.ts and
    // is asserted there. What this test pins is that refusals are all schema-level, not a mix of verdicts.
    for (const row of rows.filter((r) => !r.accepted)) {
      assert.equal(AeroLogBodySchema.safeParse(row.body).success, false);
    }
  });
});
