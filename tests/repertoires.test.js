// Every repertoire file must be playable: legal moves written exactly as chess.js
// writes them, an explanation for every move, and IDs the progress API accepts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const dir = new URL('../src/repertoires/', import.meta.url);
const reps = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(new URL(f, dir), 'utf8')) }));
const LINE_RE = /^[a-z0-9-]{1,64}$/; // same rule as api/progress.js

test('repertoire files are found', () => {
  assert.ok(reps.length >= 2);
});

test('every repertoire file is loaded by the app', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const { file } of reps) assert.ok(main.includes(`./repertoires/${file}`), `${file} isn't imported in src/main.js`);
});

test('line ids are unique and valid for the progress API', () => {
  const ids = reps.flatMap((r) => r.lines.map((l) => l.id));
  assert.equal(new Set(ids).size, ids.length, 'duplicate line id');
  for (const id of ids) assert.match(id, LINE_RE);
});

for (const rep of reps) {
  test(`${rep.file}: header fields`, () => {
    assert.equal(`${rep.id}.json`, rep.file);
    assert.ok(['white', 'black'].includes(rep.color));
    assert.ok(rep.name && rep.lines.length > 0);
  });

  for (const line of rep.lines) {
    test(`${rep.file} / ${line.id}: legal moves, an explanation for each, and an intro`, () => {
      const chess = new Chess();
      line.moves.forEach((san, i) => {
        let move;
        assert.doesNotThrow(() => { move = chess.move(san); }, `illegal move ${i}: ${san}`);
        assert.equal(move.san, san, `move ${i} should be written "${move.san}"`);
        assert.ok(line.notes?.[i]?.trim(), `missing explanation for move ${i} (${san})`);
      });
      assert.equal(Object.keys(line.notes).length, line.moves.length, 'explanation for a move that does not exist');
      assert.ok(line.intro?.trim(), 'missing intro');
      // The player should make at least one move in the line.
      const mine = line.moves.filter((_, i) => (i % 2 === 0) === (rep.color === 'white'));
      assert.ok(mine.length > 0);
    });
  }
}
