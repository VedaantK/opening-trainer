// srs.js: spaced-repetition scheduler (a Leitner box system).
//
// Every line sits in a box. Passing a line (playing it with zero mistakes) moves it
// up one box, so you see it less often; failing sends it back to box 0, due again
// right away. Lines you know well drift out to weeks, lines you keep missing stay close.
//
// A progress `state` looks like:
//   { box: number, dueAt: ISO string, attempts: number, correct: number }
// `state` is undefined the first time a line is played.

const DAY_MS = 24 * 60 * 60 * 1000;

// How long to wait before reviewing a line, by box. Index = box number.
const BOX_DAYS = [0, 1, 3, 7, 16, 35];
const LAST_BOX = BOX_DAYS.length - 1;

/**
 * Compute a line's next review state after one drill attempt.
 * @param {object|undefined} state  previous state (undefined if never played)
 * @param {'pass'|'fail'} result    pass = whole line played with zero mistakes
 * @param {Date} now
 * @returns {{box:number, dueAt:string, attempts:number, correct:number}}
 */
export function schedule(state, result, now = new Date()) {
  const prev = state ?? { box: 0, attempts: 0, correct: 0 };
  const passed = result === 'pass';
  const box = passed ? Math.min((prev.box ?? 0) + 1, LAST_BOX) : 0;
  return {
    box,
    dueAt: new Date(now.getTime() + BOX_DAYS[box] * DAY_MS).toISOString(),
    attempts: (prev.attempts ?? 0) + 1,
    correct: (prev.correct ?? 0) + (passed ? 1 : 0),
  };
}

/**
 * Choose which line to drill next: a line you've never played if there is one,
 * otherwise the line whose review is most overdue (or, if nothing is due yet,
 * the one that comes due soonest).
 * @param {Array<{id:string}>} lines
 * @param {Record<string, object>} progress  lineId → state
 * @param {Date} now
 * @returns {object} one of `lines`
 */
export function pickNext(lines, progress, now = new Date()) {
  const unplayed = lines.find((line) => !progress[line.id]);
  if (unplayed) return unplayed;

  // A missing or unreadable date counts as due right now.
  const dueTime = (line) => {
    const t = Date.parse(progress[line.id]?.dueAt);
    return Number.isNaN(t) ? now.getTime() : t;
  };
  return lines.reduce((best, line) => (dueTime(line) < dueTime(best) ? line : best));
}
