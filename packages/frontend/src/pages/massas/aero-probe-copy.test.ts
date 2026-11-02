import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeProbe } from './AeroIntegrationPanel';

/**
 * Lo que el panel dice de una prueba de conexión.
 *
 * La frase es la que decide si el operario cree que la integración funciona, y el ERP no siempre dice de quién
 * son las credenciales que aceptó. Inventar ese nombre fue el falso positivo que la pantalla repetía como si
 * fuera un dato.
 */
const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key}|${JSON.stringify(options)}` : key;

describe('el aviso de la prueba de conexión', () => {
  it('nombra al operario solo cuando el ERP lo nombró', () => {
    const text = describeProbe(
      { kind: 'ok', httpStatus: 200, userCode: 12, userName: 'WILKIN', snippet: '' },
      t,
    );

    assert.match(text, /^massas\.aero\.testOk\|/);
    assert.match(text, /"name":"WILKIN"/);
    assert.match(text, /"code":12/);
  });

  it('una conexión probada sin nombre no se atribuye a nadie', () => {
    const text = describeProbe(
      { kind: 'ok', httpStatus: 200, userCode: 12, userName: null, snippet: '' },
      t,
    );

    assert.match(text, /^massas\.aero\.testOkNoUser\|/);
    assert.ok(!text.includes('WILKIN'));
    assert.match(text, /"code":12/);
  });

  it('el rechazo del WebService conserva el estado y su frase', () => {
    const text = describeProbe({ kind: 'http_error', httpStatus: 401, message: 'Senha ou usuario', snippet: '' }, t);

    assert.match(text, /^massas\.aero\.testHttpError\|/);
    assert.match(text, /"status":401/);
    assert.match(text, /Senha ou usuario/);
  });
});
