// Tests for the pure helpers in src/logic.js. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { escapeHtml, legalDests, moveStats } from '../src/logic.js';

// ---------- escapeHtml ----------

test('escapeHtml replaces all five special characters', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('escapeHtml defuses a script tag', () => {
  assert.equal(
    escapeHtml('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
  );
});

test('escapeHtml leaves ordinary chess text alone', () => {
  assert.equal(escapeHtml('Nf3 O-O-O e8=Q+'), 'Nf3 O-O-O e8=Q+');
});

test('escapeHtml turns non-strings into strings', () => {
  assert.equal(escapeHtml(42), '42');
});

// ---------- legalDests ----------

test('legalDests on the starting position has 20 moves from 10 pieces', () => {
  const dests = legalDests(new Chess());
  assert.equal(dests.size, 10); // 8 pawns + 2 knights
  const count = [...dests.values()].reduce((n, to) => n + to.length, 0);
  assert.equal(count, 20);
  assert.deepEqual(dests.get('e2').sort(), ['e3', 'e4']);
  assert.deepEqual(dests.get('g1').sort(), ['f3', 'h3']);
  assert.equal(dests.has('e1'), false); // the king is boxed in
});

test('legalDests is empty after checkmate', () => {
  const chess = new Chess();
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) chess.move(san);
  assert.equal(legalDests(chess).size, 0);
});

test('legalDests only offers moves that answer a check', () => {
  // After 1.e4 e5 2.Qh5 Nc6 3.Qxf7+ the queen is unprotected and black's only legal move is Kxf7.
  const chess = new Chess();
  for (const san of ['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+']) chess.move(san);
  const dests = legalDests(chess);
  assert.deepEqual([...dests.keys()], ['e8']);
  assert.deepEqual(dests.get('e8'), ['f7']);
});

// ---------- moveStats ----------

test('moveStats works out each move\'s share and its white/draw/black split', () => {
  const stats = moveStats({
    moves: [
      { san: 'e4', white: 150, draws: 90, black: 60 }, // 300 games
      { san: 'd4', white: 40, draws: 35, black: 25 }, // 100 games
    ],
  });
  assert.deepEqual(stats, [
    { san: 'e4', played: '75', white: '50', draws: '30', black: '20' },
    { san: 'd4', played: '25', white: '40', draws: '35', black: '25' },
  ]);
});

test('moveStats keeps only the top six moves and ignores the rest in the totals', () => {
  const moves = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((san) => ({ san, white: 10, draws: 0, black: 0 }));
  const stats = moveStats({ moves });
  assert.equal(stats.length, 6);
  assert.deepEqual(stats.map((m) => m.san), ['a', 'b', 'c', 'd', 'e', 'f']);
  // Six equal moves: each is 1/6 of the games counted, which rounds to 17.
  for (const m of stats) assert.equal(m.played, '17');
});

test('moveStats returns an empty list when there are no moves', () => {
  assert.deepEqual(moveStats({ moves: [] }), []);
  assert.deepEqual(moveStats({}), []);
});
