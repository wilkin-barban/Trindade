import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AERO_LOG_FILE,
  AERO_LOG_MAX_BYTES,
  type AeroLogEntry,
  appendAeroLog,
  appendLocalAeroLog,
  redactAeroText,
  resolveAeroLogDir,
} from './aero.log.service.js';

describe('Aero integration log service', () => {
  it('resolves aero log directory honoring AERO_LOG_DIR and falling back to default', () => {
    assert.equal(resolveAeroLogDir({ AERO_LOG_DIR: '/var/log/aero' }), '/var/log/aero');
    assert.equal(resolveAeroLogDir({ AERO_LOG_DIR: '  /custom/logs  ' }), '/custom/logs');
    assert.equal(resolveAeroLogDir({ AERO_LOG_DIR: '   ' }), join(process.cwd(), 'logs'));
    assert.equal(resolveAeroLogDir({}), join(process.cwd(), 'logs'));
    assert.equal(resolveAeroLogDir(), resolveAeroLogDir(process.env));
  });

  it('writes one JSON line with expected fields formatted for tail -f and jq', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aero-log-test-single-'));
    try {
      const entry: AeroLogEntry = {
        ts: '2026-10-27T12:00:00.000Z',
        event: 'test_connection',
        phase: 'requested',
        user: 'wilkin',
        role: 'Administrador',
        destinationUrl: 'http://192.168.1.50:8000/api/usuarios/',
        httpStatus: 200,
        payload: { test: true },
        response: '{"success":true}',
        error: null,
        launchId: null,
        note: 'connectivity test ok',
        client: 'android',
        attemptId: 'attempt-7',
        durationMs: 250,
      };

      const returnedPath = appendAeroLog(entry, tempDir);
      assert.equal(returnedPath, join(tempDir, AERO_LOG_FILE));
      assert.ok(existsSync(returnedPath));

      const fileContent = readFileSync(returnedPath, 'utf-8');
      assert.ok(fileContent.endsWith('\n'), 'line must terminate with a newline');
      const lines = fileContent.split('\n').filter(Boolean);
      assert.equal(lines.length, 1);

      const parsed = JSON.parse(lines[0]);
      assert.deepStrictEqual(parsed, {
        ts: '2026-10-27T12:00:00.000Z',
        event: 'test_connection',
        phase: 'requested',
        user: 'wilkin',
        role: 'Administrador',
        destinationUrl: 'http://192.168.1.50:8000/api/usuarios/',
        httpStatus: 200,
        payload: { test: true },
        response: '{"success":true}',
        error: null,
        launchId: null,
        note: 'connectivity test ok',
        client: 'android',
        attemptId: 'attempt-7',
        durationMs: 250,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('appends and preserves previous lines across multiple writes', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aero-log-test-multi-'));
    try {
      const entry1: AeroLogEntry = {
        ts: '2026-10-27T12:00:00.000Z',
        event: 'test_connection',
        phase: 'requested',
        user: 'wilkin',
        role: 'Administrador',
        destinationUrl: 'http://192.168.1.50:8000/api/usuarios/',
        httpStatus: 200,
        payload: null,
        response: null,
        error: null,
        launchId: null,
        note: 'first call',
        client: 'web',
        attemptId: null,
        durationMs: null,
      };
      const entry2: AeroLogEntry = {
        ts: '2026-10-27T12:01:00.000Z',
        event: 'launch_sync',
        phase: 'result',
        user: 'wilkin',
        role: 'Administrador',
        destinationUrl: 'http://192.168.1.50:8000/api/entradasitem',
        httpStatus: 200,
        payload: { PRO_COD: '1001' },
        response: '{"success":true}',
        error: null,
        launchId: 42,
        note: 'second call',
        client: 'web',
        attemptId: null,
        durationMs: null,
      };

      appendAeroLog(entry1, tempDir);
      appendAeroLog(entry2, tempDir);

      const filePath = join(tempDir, AERO_LOG_FILE);
      const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      assert.equal(lines.length, 2);

      const parsed1 = JSON.parse(lines[0]);
      const parsed2 = JSON.parse(lines[1]);
      assert.equal(parsed1.note, 'first call');
      assert.equal(parsed2.note, 'second call');
      assert.equal(parsed2.launchId, 42);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rotates to .1 when the log reaches or exceeds AERO_LOG_MAX_BYTES (one generation only)', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aero-log-test-rot-'));
    try {
      const logPath = join(tempDir, AERO_LOG_FILE);
      const rotatedPath = `${logPath}.1`;

      // Seed file right at the threshold
      writeFileSync(logPath, Buffer.alloc(AERO_LOG_MAX_BYTES, 'a'));
      assert.equal(existsSync(logPath), true);
      assert.equal(existsSync(rotatedPath), false);

      const entry: AeroLogEntry = {
        ts: '2026-10-27T12:00:00.000Z',
        event: 'test_connection',
        phase: null,
        user: 'wilkin',
        role: 'Administrador',
        destinationUrl: 'http://192.168.1.50:8000/api/usuarios/',
        httpStatus: 200,
        payload: null,
        response: null,
        error: null,
        launchId: null,
        note: 'after rotation',
        client: 'web',
        attemptId: null,
        durationMs: null,
      };

      appendAeroLog(entry, tempDir);

      // Previous file must have rotated to .1
      assert.ok(existsSync(rotatedPath), 'rotated .1 file must exist');
      const rotatedContent = readFileSync(rotatedPath);
      assert.equal(rotatedContent.length, AERO_LOG_MAX_BYTES);

      // Active file must have only the new entry
      const activeContent = readFileSync(logPath, 'utf-8');
      const lines = activeContent.split('\n').filter(Boolean);
      assert.equal(lines.length, 1);
      assert.equal(JSON.parse(lines[0]).note, 'after rotation');

      // Second rotation overwrites .1 without creating .2
      writeFileSync(logPath, Buffer.alloc(AERO_LOG_MAX_BYTES + 10, 'b'));
      entry.note = 'second rotation';
      appendAeroLog(entry, tempDir);

      assert.equal(existsSync(`${logPath}.2`), false, 'must not create a second generation');
      assert.equal(readFileSync(rotatedPath).length, AERO_LOG_MAX_BYTES + 10);
      const linesAfterSecond = readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
      assert.equal(linesAfterSecond.length, 1);
      assert.equal(JSON.parse(linesAfterSecond[0]).note, 'second rotation');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('truncates payload over 4096 and response over 2048 with the truncation marker', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aero-log-test-trunc-'));
    try {
      const longPayloadString = 'p'.repeat(5000);
      const longResponseString = 'r'.repeat(3000);

      const entry: AeroLogEntry = {
        ts: '2026-10-27T12:00:00.000Z',
        event: 'test_connection',
        phase: null,
        user: 'wilkin',
        role: 'Administrador',
        destinationUrl: 'http://192.168.1.50:8000/api/usuarios/',
        httpStatus: 200,
        payload: longPayloadString,
        response: longResponseString,
        error: null,
        launchId: null,
        note: null,
        client: 'web',
        attemptId: null,
        durationMs: null,
      };

      appendAeroLog(entry, tempDir);

      const logPath = join(tempDir, AERO_LOG_FILE);
      const lines = readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
      const parsed = JSON.parse(lines[0]);

      // Payload check
      assert.ok(typeof parsed.payload === 'string');
      assert.ok(parsed.payload.includes('…[truncated]'));
      assert.ok(parsed.payload.startsWith('p'.repeat(100)));

      // Response check
      assert.ok(typeof parsed.response === 'string');
      assert.ok(parsed.response.includes('…[truncated]'));
      assert.ok(parsed.response.startsWith('r'.repeat(100)));

      // Also verify object payload truncation when serialized
      const longObjectPayload = { data: 'x'.repeat(5000) };
      entry.payload = longObjectPayload;
      entry.response = 'short response';
      appendAeroLog(entry, tempDir);

      const lines2 = readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
      const parsed2 = JSON.parse(lines2[1]);
      assert.ok(typeof parsed2.payload === 'string');
      assert.ok(parsed2.payload.includes('…[truncated]'));
      assert.equal(parsed2.response, 'short response');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('strips authorization and credential fields from payload', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aero-log-test-cred-'));
    try {
      const entry: AeroLogEntry = {
        ts: '2026-10-27T12:00:00.000Z',
        event: 'test_connection',
        phase: null,
        user: 'wilkin',
        role: 'Administrador',
        destinationUrl: 'http://192.168.1.50:8000/api/usuarios/',
        httpStatus: 200,
        payload: {
          authorization: 'Basic dXNlcjpzZWNyZXQ=',
          Authorization: 'Bearer token-123',
          password: 'super-secret-password',
          senha: 'senha-secreta',
          safeField: 'visible-value',
        },
        response: null,
        error: null,
        launchId: null,
        note: null,
        client: 'web',
        attemptId: null,
        durationMs: null,
      };

      appendAeroLog(entry, tempDir);

      const logPath = join(tempDir, AERO_LOG_FILE);
      const content = readFileSync(logPath, 'utf-8');
      assert.ok(!content.includes('Basic dXNlcjpzZWNyZXQ='));
      assert.ok(!content.includes('Bearer token-123'));
      assert.ok(!content.includes('super-secret-password'));
      assert.ok(!content.includes('senha-secreta'));

      const parsed = JSON.parse(content.trim());
      assert.equal(parsed.payload.safeField, 'visible-value');
      assert.equal(parsed.payload.authorization, undefined);
      assert.equal(parsed.payload.Authorization, undefined);
      assert.equal(parsed.payload.password, undefined);
      assert.equal(parsed.payload.senha, undefined);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('redacts credentials and key-shaped blobs inside the free-text response, keeping the useful message', () => {
    // The ERP answers in prose, and the prose is whatever the WebService echoes back: an HTML error page, a
    // stack trace, or the request body it failed to parse. The line is the audit trail, so the useful part has
    // to survive -- but the credentials a client embedded do not belong on disk.
    const secrets = {
      basic: 'dXNlcjpzZWNyZXQ=',
      senha: 'super-secret',
      refreshToken: 'rt_live_0123456789abcdef',
      hex: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      cookie: 'session=abc123def456',
    };
    const response = [
      'POST /entradasitem -> 200 OK · date=2026-11-14',
      `Authorization: Basic ${secrets.basic}`,
      `Cookie: ${secrets.cookie}; theme=dark`,
      `{"success":true,"message":"Lancamento efetuado","senha":"${secrets.senha}","refreshToken":"${secrets.refreshToken}"}`,
      `integrity ${secrets.hex}`,
    ].join('\n');

    const tempDir = mkdtempSync(join(tmpdir(), 'aero-log-test-redact-'));
    try {
      appendAeroLog(
        {
          ts: '2026-11-14T09:00:00.000Z',
          event: 'launch_sync',
          phase: 'result',
          user: 'wilkin',
          role: 'Administrador',
          destinationUrl: 'http://192.168.25.250:1453/api/entradasitem',
          httpStatus: 200,
          payload: 'request body was {"senha":"super-secret"}',
          response,
          error: null,
          launchId: 84,
          note: 'client=web · via=bridge',
          client: 'web',
          attemptId: 'attempt-redact-1',
          durationMs: 940,
        },
        tempDir,
      );

      const logPath = join(tempDir, AERO_LOG_FILE);
      const content = readFileSync(logPath, 'utf-8');

      for (const [name, secret] of Object.entries(secrets)) {
        assert.ok(!content.includes(secret), `the ${name} secret reached the log file`);
      }
      assert.ok(!content.includes('super-secret'), 'the senha reached the log through the payload');
      assert.ok(content.includes('[redacted]'), 'the marker is what makes a redaction visible');

      // One JSON object per line, so `tail -f` and `jq` keep working.
      const lines = content.split('\n').filter(Boolean);
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);

      // The audit stays useful: when, what happened, and what the ERP said.
      assert.equal(typeof parsed.response, 'string');
      assert.match(parsed.response, /date=2026-11-14/);
      assert.match(parsed.response, /POST \/entradasitem -> 200 OK/);
      assert.match(parsed.response, /"success":true/);
      assert.match(parsed.response, /Lancamento efetuado/);
      assert.match(parsed.response, /Authorization: Basic \[redacted\]/);
      assert.match(parsed.response, /"senha":"\[redacted\]"/);
      assert.match(parsed.response, /"refreshToken":"\[redacted\]"/);
      assert.match(parsed.response, /integrity \[redacted\]/);

      // A secret embedded in a string payload is redacted too, and the rest of the text stays.
      assert.match(String(parsed.payload), /^request body was /);
      assert.ok(!String(parsed.payload).includes('super-secret'));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('leaves ordinary prose alone and redacts a line only once', () => {
    const prose =
      'launch 84 recorded at 2026-11-14 09:00 · the operator confirmed the notification to the plant';
    assert.equal(redactAeroText(prose), prose);

    const redacted = redactAeroText(
      'Authorization: Basic dXNlcjpzZWNyZXQ= · "senha":"super-secret" · cookie: a=1; b=2',
    );
    assert.equal(
      redacted,
      'Authorization: Basic [redacted] · "senha":"[redacted]" · cookie: [redacted]',
    );
    assert.equal(redactAeroText(redacted), redacted, 'a second pass must not eat the marker');
  });

  it('writes a local salida event unchanged by the redaction', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aero-log-test-local-'));
    try {
      appendLocalAeroLog(
        {
          event: 'salida_create',
          user: 'wilkin',
          role: 'Administrador',
          destinationUrl: 'local://salida',
          payload: {
            movementId: 84,
            movementDate: '2026-11-09',
            itemCount: 2,
            totalUnits: 23,
            blocks: ['embalagens', 'bobinas'],
          },
          note: 'local=salida · action=create',
        },
        tempDir,
      );

      const lines = readFileSync(join(tempDir, AERO_LOG_FILE), 'utf-8').split('\n').filter(Boolean);
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);

      assert.equal(parsed.event, 'salida_create');
      assert.equal(parsed.destinationUrl, 'local://salida');
      assert.equal(parsed.note, 'local=salida · action=create');
      assert.equal(parsed.response, null);
      assert.deepStrictEqual(parsed.payload, {
        movementId: 84,
        movementDate: '2026-11-09',
        itemCount: 2,
        totalUnits: 23,
        blocks: ['embalagens', 'bobinas'],
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
