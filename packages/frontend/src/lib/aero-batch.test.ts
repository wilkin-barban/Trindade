import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AERO_BATCH_MAX, aeroTicketPayloads, buildAeroLaunchTrips } from './aero-batch';

/**
 * The rule Wilkin set: one product travels exactly as today, two or more share one ticket, and the server arms
 * the request the phone repeats. These tests own that rule, so the page only has to render it.
 *
 * Nothing here is an envelope any more: the page cannot build a request against the plant's LAN, so what a trip
 * carries is the action the server has to arm and the payloads that action posts.
 */
const base = {
  singleCallbackPath: '/massas-launch?aero_action=entrada&aero_data=',
  batchCallbackPath: '/massas-launch?aero_action=entrada_lote&aero_data=',
};

const payload = (code: string, quantity = 15) => ({ PRO_COD: code, QUANTIDADE: quantity });

describe('aero batch: the trip a launch takes to the shortcut', () => {
  it('asks for `entrada` when a single product travels', () => {
    const trips = buildAeroLaunchTrips({ ...base, payloads: [payload('001192')] });

    assert.equal(trips.length, 1);
    const [trip] = trips;
    assert.equal(trip!.action, 'entrada');
    assert.deepEqual(trip!.payloads, [payload('001192')]);
    assert.equal(trip!.callbackPath, base.singleCallbackPath);
  });

  it('asks for `entrada_lote` when two products travel together', () => {
    const trips = buildAeroLaunchTrips({
      ...base,
      payloads: [payload('001192'), payload('000084', 456)],
    });

    assert.equal(trips.length, 1);
    const [trip] = trips;
    assert.equal(trip!.action, 'entrada_lote');
    assert.equal(trip!.callbackPath, base.batchCallbackPath);
    assert.deepEqual(trip!.payloads, [payload('001192'), payload('000084', 456)]);
  });

  it('hands the payloads over as plain dictionaries, which is what the ticket endpoint takes', () => {
    // The builders answer with typed interfaces, and an interface has no index signature: copying each payload
    // is what makes the HTTP body explicit instead of casting at the call site.
    interface EntryLike {
      PRO_COD: string;
      PRO_DES: string;
    }
    const typed: EntryLike = { PRO_COD: '001192', PRO_DES: 'MASSA' };

    assert.deepEqual(aeroTicketPayloads([typed]), [{ PRO_COD: '001192', PRO_DES: 'MASSA' }]);
    assert.equal(typeof aeroTicketPayloads([typed])[0], 'object');
    assert.deepEqual(aeroTicketPayloads([]), []);
  });

  it('fills one ticket up to the ceiling of eight', () => {
    const payloads = Array.from({ length: AERO_BATCH_MAX }, (_, index) => payload(String(index + 1)));

    const trips = buildAeroLaunchTrips({ ...base, payloads });

    assert.equal(AERO_BATCH_MAX, 8);
    assert.equal(trips.length, 1);
    assert.equal(trips[0]!.action, 'entrada_lote');
    assert.equal(trips[0]!.payloads.length, AERO_BATCH_MAX);
  });

  it('splits nine into eight plus one, and that one travels as a single product again', () => {
    const payloads = Array.from({ length: 9 }, (_, index) => payload(String(index + 1)));

    const trips = buildAeroLaunchTrips({ ...base, payloads });

    assert.equal(trips.length, 2);
    assert.equal(trips[0]!.action, 'entrada_lote');
    assert.equal(trips[0]!.payloads.length, 8);
    assert.equal(trips[1]!.action, 'entrada');
    assert.deepEqual(trips[1]!.payloads, [payloads[8]]);
  });

  it('walks a long launch in order, so the answers line up with the products that produced them', () => {
    const payloads = Array.from({ length: 17 }, (_, index) => payload(String(index + 1)));

    const trips = buildAeroLaunchTrips({ ...base, payloads });

    assert.deepEqual(
      trips.map((trip) => trip.payloads.length),
      [8, 8, 1],
    );
    assert.deepEqual(
      trips.flatMap((trip) => trip.payloads),
      payloads,
    );
  });

  it('takes no trip when there is nothing to send', () => {
    assert.deepEqual(buildAeroLaunchTrips({ ...base, payloads: [] }), []);
  });
});
