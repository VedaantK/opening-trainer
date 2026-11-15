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
