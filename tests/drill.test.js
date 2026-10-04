import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Drill } from '../src/drill.js';

const line = { id: 't', name: 'test', moves: ['e4', 'e5', 'Nf3', 'Nc6'], notes: { 2: 'knight!' } };

test('white plays a full line with no mistakes', () => {
  const d = new Drill(line, 'white');
  assert.ok(d.playerToMove);
  assert.equal(d.tryMove('e2', 'e4').ok, true);
  assert.ok(!d.playerToMove);
  d.playOpponent();
  const r = d.tryMove('g1', 'f3');
  assert.equal(r.note, 'knight!');
  d.playOpponent();
  assert.ok(d.done);
  assert.equal(d.result, 'pass');
});

test('wrong move is rejected, counted once, and leaves the board unchanged', () => {
  const d = new Drill(line, 'white');
  const fen = d.chess.fen();
  assert.deepEqual(d.tryMove('d2', 'd4'), { ok: false, tried: 'd4' });
  d.tryMove('c2', 'c4');
  assert.equal(d.chess.fen(), fen);
  assert.equal(d.mistakes, 1);
  assert.deepEqual(d.expectedSquares(), { from: 'e2', to: 'e4' });
  d.tryMove('e2', 'e4');
  assert.equal(d.result, 'fail');
});

test('black waits for white first', () => {
  const d = new Drill(line, 'black');
  assert.ok(!d.playerToMove);
  d.playOpponent();
  assert.ok(d.playerToMove);
});
