import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueLabel } from '../src/logic.js';

test('dueLabel says New when there is no progress', () => {
  const result = dueLabel(undefined, 1000);
  assert.equal(result.text, 'New');
  assert.equal(result.cls, 'new');
});

test('dueLabel says Due when dueAt is in the past', () => {
  const result = dueLabel({ dueAt: 500 }, 1000);
  assert.equal(result.text, 'Due');
  assert.equal(result.cls, 'due');
});

test('dueLabel rounds a future dueAt up to whole days', () => {
  const DAY_MS = 86_400_000;
  // 1.5 days from now: ceil gives 2, floor would give 1.
  const result = dueLabel({ dueAt: 1000 + 1.5 * DAY_MS }, 1000);
  assert.equal(result.text, 'in 2d');
  assert.equal(result.cls, 'later');
});
