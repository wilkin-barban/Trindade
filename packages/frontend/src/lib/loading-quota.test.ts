import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countInWindow, QUOTA_MAX, quotaIfMoved } from './loading-quota';

/**
 * One shift is three fleteros, and a shift is not a time: the trucks leave in a window.
 *
 * The grid and the edit screen used to answer "how many are there for this slot" differently -- one by exact
 * time, the other by a window built inside the page -- so the same day showed two different counts and a row
 * moved onto its own slot gained one out of nowhere. The rule lives here once, and these are its edges.
 */
function load(id: number, time_slot: string, driver_type: 'fletero' | 'casa' = 'fletero') {
  return { id, time_slot, driver_type };
}

describe('counting a shift', () => {
  it('counts the fleteros inside the hour, on both sides', () => {
    const day = [load(1, '04:00'), load(2, '04:30'), load(3, '03:15'), load(4, '03:01')];

    assert.equal(countInWindow(day, '04:00'), 4);
  });

  it('leaves out the slot exactly one hour away, which is the next shift', () => {
    const day = [load(1, '04:00'), load(2, '05:00'), load(3, '03:00')];

    assert.equal(countInWindow(day, '04:00'), 1);
    // 04:59 is inside the hour and 05:00 is not: the window is open at the hour, not closed.
    assert.equal(countInWindow(day, '04:59'), 2);
  });

  it('does not count the company drivers, who do not load their own trucks', () => {
    const day = [load(1, '04:00'), load(2, '04:10', 'casa')];

    assert.equal(countInWindow(day, '04:00'), 1);
  });

  it('can leave a row out, for the count a row would find where it is going', () => {
    const day = [load(1, '04:00'), load(2, '04:30')];

    assert.equal(countInWindow(day, '04:00', 2), 1);
  });
});

describe('a row that moves', () => {
  it('lands where it lands: moving it onto its own slot does not add a passenger', () => {
    const day = [load(1, '04:00'), load(2, '04:30')];
    const moving = day[0];

    // Off by one here is the bug: counting the window with the row still inside and then adding it again.
    assert.equal(quotaIfMoved(day, moving, '04:30'), 2);
    assert.equal(quotaIfMoved(day, moving, '04:00'), 2);
  });

  it('leaves the slot it came from', () => {
    const day = [load(1, '04:00'), load(2, '04:30'), load(3, '06:00')];
    const moving = day[0];

    assert.equal(quotaIfMoved(day, moving, '06:00'), 2);
  });

  it('carries a company driver into the window without spending a fletero place', () => {
    const day = [load(1, '04:00'), load(2, '04:30')];
    const moving = load(9, '09:00', 'casa');

    assert.equal(quotaIfMoved(day, moving, '04:30'), 2);
  });

  it('is over the limit only past the third place', () => {
    const day = [load(1, '04:00'), load(2, '04:10'), load(3, '04:20')];
    const fourth = load(4, '09:00');

    assert.equal(quotaIfMoved(day, fourth, '04:00'), QUOTA_MAX + 1);
  });
});
