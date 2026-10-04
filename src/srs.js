// srs.js: spaced-repetition scheduler.
//
// ✍️  THIS FILE IS YOURS TO WRITE. The placeholder below works, so the app runs,
// but it has no memory: every line is always "due". Replace it with a real
// scheduler. A Leitner box system is a good place to start:
//
//   box 0 → review again immediately
//   box 1 → review in 1 day
//   box 2 → 3 days
//   box 3 → 7 days
//   box 4 → 16 days ...
//
//   pass → move up one box (cap at the last box)
//   fail → back to box 0
//
// A progress `state` looks like:
//   { box: number, dueAt: ISO string, attempts: number, correct: number }
// `state` is undefined the first time a line is played.
//
// Run `npm test` to check your work against tests/srs.test.js.

/**
 * Compute a line's next review state after one drill attempt.
 * @param {object|undefined} state  previous state (undefined if never played)
 * @param {'pass'|'fail'} result    pass = whole line played with zero mistakes
 * @param {Date} now
 * @returns {{box:number, dueAt:string, attempts:number, correct:number}}
 */
export function schedule(state, result, now = new Date()) {
  // TODO: replace this placeholder
  const prev = state ?? { box: 0, attempts: 0, correct: 0 };
  return {
    box: 0,
    dueAt: now.toISOString(),
    attempts: prev.attempts + 1,
    correct: prev.correct + (result === 'pass' ? 1 : 0),
  };
}

/**
 * Choose which line to drill next.
 * @param {Array<{id:string}>} lines
 * @param {Record<string, object>} progress  lineId → state
 * @param {Date} now
 * @returns {object} one of `lines`
 */
export function pickNext(lines, progress, now = new Date()) {
  // TODO: prefer never-played lines, then the most overdue line.
  // Placeholder: random line.
  return lines[Math.floor(Math.random() * lines.length)];
}
