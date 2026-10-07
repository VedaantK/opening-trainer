import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMoves, pickBestMove, findRepertoireMatches } from '../src/identify.js';

const move = (san, white, draws, black) => ({ san, uci: san, white, draws, black });

test('scores are from the side to move', () => {
  const data = { moves: [move('e5', 60, 0, 40)] };
  assert.equal(scoreMoves(data, 'white')[0].score, 0.6);
  assert.equal(scoreMoves(data, 'black')[0].score, 0.4);
});

test('draws count as half a win', () => {
  const [m] = scoreMoves({ moves: [move('x', 20, 60, 20)] }, 'white');
  assert.equal(m.score, 0.5);
});

test('best move ignores rarely played moves with lucky scores', () => {
  const scored = scoreMoves({ moves: [
    move('Nf3', 5200, 600, 4200),  // popular, scores 55%
    move('d4', 3000, 300, 2700),   // popular, scores 52.5%
    move('h4', 10, 0, 0),          // 100% but only 10 games
  ] }, 'white');
  assert.equal(pickBestMove(scored).san, 'Nf3');
});

test('best move falls back to the most played when nothing has enough games', () => {
  const scored = scoreMoves({ moves: [move('a', 5, 0, 5), move('b', 2, 0, 0)] }, 'white');
  assert.equal(pickBestMove(scored).san, 'a');
  assert.equal(pickBestMove([]), null);
});

const reps = [
  { id: 'w', name: 'White rep', color: 'white', lines: [
    { id: 'l1', name: 'Line 1', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
    { id: 'l2', name: 'Line 2', moves: ['e4', 'e5', 'Nf3', 'd6', 'd4'] },
  ] },
  { id: 'b', name: 'Black rep', color: 'black', lines: [
    { id: 'l3', name: 'Line 3', moves: ['e4', 'c6', 'd4', 'd5'] },
  ] },
];

test('lines that continue from the position are matched, with their next move', () => {
  const { matches } = findRepertoireMatches(reps, ['e4', 'e5', 'Nf3']);
  assert.deepEqual(matches.map((m) => [m.line.id, m.nextMove, m.yourMove]), [['l1', 'Nc6', false], ['l2', 'd6', false]]);
});

test('your own move is flagged when the repertoire is your color', () => {
  const { matches } = findRepertoireMatches(reps, ['e4', 'c6', 'd4']);
  assert.deepEqual(matches.map((m) => [m.line.id, m.nextMove, m.yourMove]), [['l3', 'd5', true]]);
});

test('closest line is reported after leaving every line', () => {
  const r = findRepertoireMatches(reps, ['e4', 'e5', 'Nf3', 'Nf6']);
  assert.equal(r.matches.length, 0);
  assert.equal(r.closest.shared, 3);
  assert.ok(['l1', 'l2'].includes(r.closest.line.id));
});

test('no matches for an empty board or an unrelated opening', () => {
  assert.deepEqual(findRepertoireMatches(reps, []), { matches: [], closest: null });
  assert.deepEqual(findRepertoireMatches(reps, ['d4', 'd5', 'c4']), { matches: [], closest: null });
});
