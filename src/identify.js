// identify.js: the logic behind the opening identifier. No DOM or network code,
// so it can be tested on its own (tests/identify.test.js).

// A reply needs at least this share of the position's games to be called "best",
// so a move played 3 times with a lucky 100% score doesn't win.
const MIN_SHARE = 0.05;
const MIN_GAMES = 20;

/**
 * Turn a Lichess explorer response into per-move stats from the point of view
 * of the side to move. Sorted by how often each move was played.
 * @param {object} data  explorer response ({ moves: [{ san, uci, white, draws, black, opening }] })
 * @param {'white'|'black'} sideToMove
 */
export function scoreMoves(data, sideToMove) {
  const moves = data?.moves ?? [];
  const total = moves.reduce((n, m) => n + m.white + m.draws + m.black, 0);
  return moves
    .map((m) => {
      const games = m.white + m.draws + m.black;
      const wins = sideToMove === 'white' ? m.white : m.black;
      return {
        san: m.san,
        uci: m.uci,
        games,
        share: total ? games / total : 0,
        score: games ? (wins + m.draws / 2) / games : 0, // 1 = always wins, 0.5 = even
        opening: m.opening ?? null,
      };
    })
    .sort((a, b) => b.games - a.games);
}

/** The best-scoring reply among moves played often enough to trust, or null. */
export function pickBestMove(scored) {
  if (!scored.length) return null;
  const trusted = scored.filter((m) => m.share >= MIN_SHARE && m.games >= MIN_GAMES);
  if (!trusted.length) return scored[0]; // too few games to compare; go with the most played
  return trusted.reduce((best, m) => (m.score > best.score ? m : best));
}

/**
 * Which trainer lines does this move sequence follow?
 * @param {Array<{id,name,color,lines}>} repertoires
 * @param {string[]} history  SAN moves played so far
 * @returns {{ matches: Array, closest: object|null }}
 *   matches: lines that still continue from here, with the line's next move.
 *   closest: if nothing matches, the line that shares the most opening moves (at least 2).
 */
export function findRepertoireMatches(repertoires, history) {
  const matches = [];
  let closest = null;
  if (!history.length) return { matches, closest };

  const sideToMove = history.length % 2 === 0 ? 'white' : 'black';
  for (const rep of repertoires) {
    for (const line of rep.lines) {
      const shared = commonPrefix(line.moves, history);
      if (shared === history.length && shared < line.moves.length) {
        matches.push({
          repertoire: rep,
          line,
          nextMove: line.moves[shared],
          yourMove: sideToMove === rep.color, // is the next move one you'd play in this repertoire?
        });
      } else if (shared >= 2 && shared < history.length && (!closest || shared > closest.shared)) {
        closest = { repertoire: rep, line, shared, bookMove: line.moves[shared] };
      }
    }
  }
  return { matches, closest: matches.length ? null : closest };
}

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
