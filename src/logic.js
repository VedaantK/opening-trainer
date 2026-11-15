// logic.js: pure helpers moved out of main.js so they can be tested in Node.
// Nothing in this file touches `document`, `window`, or the network.

const DAY_MS = 86_400_000;

/**
 * The pill shown next to a line in the sidebar.
 * @param {object|undefined} s  saved progress for the line (undefined if never played)
 * @param {number} now          current time in ms (defaults to the real clock)
 * @returns {{text:string, cls:string}}
 */
export function dueLabel(s, now = Date.now()) {
  if (!s) return { text: 'New', cls: 'new' };
  const ms = new Date(s.dueAt) - now;
  if (ms <= 0) return { text: 'Due', cls: 'due' };
  const days = Math.ceil(ms / DAY_MS);
  return { text: `in ${days}d`, cls: 'later' };
}

/** Make a value safe to drop into an HTML string. */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Every legal move in a position, grouped by starting square (the shape chessground wants).
 * @param {import('chess.js').Chess} chess
 * @returns {Map<string, string[]>}
 */
export function legalDests(chess) {
  const map = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!map.has(m.from)) map.set(m.from, []);
    map.get(m.from).push(m.to);
  }
  return map;
}

/**
 * Turn Lichess explorer data into the numbers the stats table shows:
 * the top six moves, each with its share of games and its white/draw/black split.
 * All percentages are whole-number strings, e.g. "42".
 * @param {{moves?: Array<{san:string, white:number, draws:number, black:number}>}} data
 * @returns {Array<{san:string, played:string, white:string, draws:string, black:string}>}
 */
export function moveStats(data) {
  const moves = (data.moves ?? []).slice(0, 6);
  const total = moves.reduce((n, m) => n + m.white + m.draws + m.black, 0);
  return moves.map((m) => {
    const n = m.white + m.draws + m.black;
    const pct = (x) => ((x / n) * 100).toFixed(0);
    return {
      san: m.san,
      played: ((n / total) * 100).toFixed(0),
      white: pct(m.white),
      draws: pct(m.draws),
      black: pct(m.black),
    };
  });
}
