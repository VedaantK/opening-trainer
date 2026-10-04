// Tests for your scheduler. These FAIL until you write a real src/srs.js,
// which is expected. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, pickNext } from '../src/srs.js';

const now = new Date('2026-10-04T12:00:00Z');
const days = (iso) => Math.round((new Date(iso) - now) / 86_400_000);

test('first pass moves a new line out of box 0', () => {
  const s = schedule(undefined, 'pass', now);
  assert.equal(s.box, 1);
  assert.ok(days(s.dueAt) >= 1);
  assert.equal(s.attempts, 1);
  assert.equal(s.correct, 1);
});

test('fail resets to box 0 and is due now', () => {
  const s = schedule({ box: 3, dueAt: now.toISOString(), attempts: 5, correct: 4 }, 'fail', now);
  assert.equal(s.box, 0);
  assert.equal(days(s.dueAt), 0);
});

test('higher boxes wait longer', () => {
  const a = schedule({ box: 1, attempts: 1, correct: 1 }, 'pass', now);
  const b = schedule({ box: 2, attempts: 2, correct: 2 }, 'pass', now);
  assert.ok(days(b.dueAt) > days(a.dueAt));
});

test('pickNext prefers never-played lines', () => {
  const lines = [{ id: 'a' }, { id: 'b' }];
  const progress = { a: { box: 1, dueAt: '2026-10-01T00:00:00Z' } };
  assert.equal(pickNext(lines, progress, now).id, 'b');
});

test('pickNext picks the most overdue line', () => {
  const lines = [{ id: 'a' }, { id: 'b' }];
  const progress = {
    a: { box: 1, dueAt: '2026-10-03T00:00:00Z' },
    b: { box: 1, dueAt: '2026-09-20T00:00:00Z' },
  };
  assert.equal(pickNext(lines, progress, now).id, 'b');
});
