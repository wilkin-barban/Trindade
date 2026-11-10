import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AERO_SCRIPTABLE_NAME, buildAeroBridgeTriggerUrl } from './aero-integration.js';

/**
 * The deep link that hands the ticket to Scriptable.
 *
 * The script is a file the phone imports once, not a recipe someone builds by hand, and the URL scheme
 * addresses it by name. Two things therefore have to be exact: the name, and the encoding of both
 * parameters. A link that is one character off opens Scriptable with no script, or lands the ticket in a
 * parameter the script never reads.
 */
describe('the Scriptable trigger URL', () => {
  it('addresses the script by its fixed name', () => {
    assert.equal(AERO_SCRIPTABLE_NAME, 'Aero32Bridge');

    const url = buildAeroBridgeTriggerUrl({
      ticket: 'abc',
      ticketUrl: 'https://trindademasas.duckdns.org/api/integration/aero/bridge-tickets/redeem',
    });

    assert.ok(url.startsWith('scriptable:///run/Aero32Bridge?'), url);
  });

  it('carries the ticket and its URL as two encoded query parameters', () => {
    const ticket = 'a+b/c=d&e';
    const ticketUrl = 'https://trindade.test/api/integration/aero/bridge-tickets/redeem?x=1&y=2';

    const url = buildAeroBridgeTriggerUrl({ ticket, ticketUrl });
    const query = new URLSearchParams(url.slice(url.indexOf('?') + 1));

    assert.equal(query.get('ticket'), ticket);
    assert.equal(query.get('ticketUrl'), ticketUrl);
    // Encoded, not passed through: an unescaped `&` would truncate the ticket URL at the first parameter.
    assert.equal(url.includes('?ticket=a+b/c=d&e'), false);
    assert.ok(url.includes('ticketUrl=https%3A%2F%2Ftrindade.test'), url);
  });

  it('never emits the retired shortcut scheme', () => {
    const url = buildAeroBridgeTriggerUrl({ ticket: 'abc', ticketUrl: 'https://trindade.test/redeem' });

    assert.equal(url.includes('shortcuts://'), false);
    assert.equal(url.includes('run-shortcut'), false);
  });
});
