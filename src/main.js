// main.js: wires the board, the drill, and the backend together and handles UI.
import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';

import { Chess } from 'chess.js';
import { Drill } from './drill.js';
import { scoreMoves, pickBestMove, findRepertoireMatches } from './identify.js';
import { schedule, pickNext } from './srs.js';
import { fetchExplorer, fetchProgress, saveProgress } from './api.js';
import italian from './repertoires/italian-white.json';
import ruyLopez from './repertoires/ruy-lopez-white.json';
import queensGambit from './repertoires/queens-gambit-white.json';
import london from './repertoires/london-white.json';
import sicilian from './repertoires/sicilian-black.json';
import caroKann from './repertoires/caro-kann-black.json';
import french from './repertoires/french-black.json';
import kingsIndian from './repertoires/kings-indian-black.json';
import slav from './repertoires/slav-black.json';

const REPERTOIRES = [italian, ruyLopez, queensGambit, london, sicilian, caroKann, french, kingsIndian, slav];
const OPPONENT_DELAY_MS = 450;
// In Learn mode the opponent's move waits a little longer so you can see its blue arrow first.
const LEARN_OPPONENT_DELAY_MS = 1000;
const REP_KEY = 'opening-trainer:repertoire';

const $ = (id) => document.getElementById(id);
const els = {
  board: $('board'), picker: $('picker'), next: $('next-btn'),
  navRow: $('nav-row'), prev: $('prev-btn'), fwd: $('fwd-btn'), idRedo: $('id-redo-btn'),
  hint: $('hint-btn'), restart: $('restart-btn'), modeBtn: $('mode-btn'),
  lineName: $('line-name'), modeBadge: $('mode-badge'), intro: $('intro'),
  status: $('status'), note: $('note'), action: $('action-btn'), moveList: $('move-list'),
  statsCard: $('stats-card'), stats: $('stats'), lineList: $('line-list'),
  progressError: $('progress-error'),
  tabTrain: $('tab-train'), tabIdentify: $('tab-identify'),
  idOpening: $('id-opening'), idBest: $('id-best'), idStats: $('id-moves-stats'),
  idMoveList: $('id-move-list'), idRepCard: $('id-rep-card'), idRep: $('id-rep'),
  idUndo: $('id-undo-btn'), idReset: $('id-reset-btn'), idFlip: $('id-flip-btn'),
};

const state = {
  repertoire: REPERTOIRES[0],
  progress: {},   // lineId → srs state
  drill: null,
  mode: 'test',   // 'learn' = guided walkthrough with arrows, 'test' = from memory
  lastMove: undefined, // [from, to] of the last move actually played
  view: 'train',  // 'train' = drills, 'identify' = free play with opening detection
  reviewing: false, // a finished test line being stepped through with the arrow keys
  learnTimer: null, // pending auto-played opponent move in Learn mode
};

// Free-play state for the opening identifier, kept separate from the drill.
const idState = {
  chess: new Chess(),
  orientation: 'white',
  lastMove: undefined,
  future: [], // moves taken back with ◀, replayed by ▶ until a different move is played
};

const cg = Chessground(els.board, {
  movable: { free: false, showDests: true, events: { after: (orig, dest) => (state.view === 'identify' ? onIdentifyMove(orig, dest) : onUserMove(orig, dest)) } },
  draggable: { showGhost: true },
  highlight: { lastMove: true, check: true },
  animation: { duration: 200 },
});

// ---------- drill flow ----------

// Lines you've never been tested on start with the guided walkthrough;
// lines with saved progress go straight to the test.
function defaultMode(line) {
  return state.progress[line.id] ? 'test' : 'learn';
}

function startLine(line, mode = defaultMode(line)) {
  const drill = new Drill(line, state.repertoire.color);
  state.drill = drill;
  state.mode = mode;
  state.reviewing = false;
  const learning = mode === 'learn';
  els.navRow.hidden = !learning;

  els.lineName.textContent = line.name;
  els.modeBadge.hidden = false;
  els.modeBadge.textContent = learning ? 'Learn' : 'Test';
  els.modeBadge.className = `mode-badge ${mode}`;
  els.intro.hidden = !learning || !line.intro;
  els.intro.textContent = line.intro ?? '';
  els.hint.hidden = learning;
  els.modeBtn.textContent = learning ? 'Skip to test' : 'Learn with arrows';
  hideAction();
  showNote(null);
  state.lastMove = undefined;
  cg.set({ orientation: drill.playerColor });
  cg.setAutoShapes([]);
  syncBoard();
  renderLineList();

  if (learning) {
    learnStep({ auto: true }); // for Black lines, White's first move plays itself
  } else {
    setStatus('Play the line from memory. No arrows this time.');
    if (!drill.playerToMove) queueOpponent(drill);
  }
}

/** Learn mode: show the next move with an arrow and explain it. */
/**
 * Learn mode: show the next move with an arrow and explain it.
 * With `auto`, the opponent's move plays itself after a short pause; without it
 * (e.g. when stepping back with ←) it waits for Continue or →, so you can look around.
 */
function learnStep({ auto = false } = {}) {
  clearTimeout(state.learnTimer);
  const d = state.drill;
  if (d.done) {
    cg.setAutoShapes([]);
    showNote(null);
    setStatus("That's the whole line. Now play it from memory, with no arrows.", 'good');
    showAction('Start the test', () => startLine(d.line, 'test'));
    return;
  }
  const { from, to } = d.expectedSquares();
  if (d.playerToMove) {
    // Keep the opponent's last move explained too, since it played itself a moment ago.
    const prev = d.ply - 1;
    const theirs = prev >= 0 ? { san: d.chess.history()[prev], text: d.line.notes?.[prev] } : null;
    showNotes(theirs?.text ? theirs : null, d.line.notes?.[d.ply] ?? null);
    cg.setAutoShapes([{ orig: from, dest: to, brush: 'green' }]);
    setStatus(`Your move: play ${d.expected} (green arrow).`);
    hideAction();
    return;
  }

  showNotes(null, d.line.notes?.[d.ply] ?? null);
  cg.setAutoShapes([{ orig: from, dest: to, brush: 'blue' }]);
  const playTheirMove = () => {
    if (state.drill !== d || state.mode !== 'learn' || state.view !== 'train' || d.done || d.playerToMove) return;
    const move = d.playOpponent();
    state.lastMove = [move.from, move.to];
    syncBoard();
    learnStep({ auto: true });
  };
  if (auto && state.view === 'train') {
    setStatus(`Their move: ${d.expected} (blue arrow)…`);
    hideAction();
    state.learnTimer = setTimeout(playTheirMove, LEARN_OPPONENT_DELAY_MS);
  } else {
    setStatus(`Their move: ${d.expected} (blue arrow).`);
    showAction('Continue ▶', playTheirMove);
  }
}

function queueOpponent(drill) {
  setTimeout(() => {
    // Skip if the user switched lines, left for the identifier, or the move was already played.
    if (state.drill !== drill || drill.done || drill.playerToMove || state.view !== 'train' || state.reviewing) return;
    const move = drill.playOpponent();
    state.lastMove = [move.from, move.to];
    syncBoard();
    if (drill.done) finishLine();
    else setStatus('Your move.');
  }, OPPONENT_DELAY_MS);
}

function onUserMove(orig, dest) {
  const drill = state.drill;
  if (!drill) return;
  const res = drill.tryMove(orig, dest);
  cg.setAutoShapes([]);

  if (state.mode === 'learn') {
    if (res.ok) state.lastMove = [res.move.from, res.move.to];
    syncBoard(); // on a wrong move this snaps the piece back
    learnStep({ auto: true });
    if (!res.ok) setStatus(`Not quite. Play ${drill.expected}, the green arrow.`, 'bad');
    return;
  }

  if (!res.ok) {
    setStatus(res.tried ? `✗ ${res.tried} isn't the move here. Try again, or press Hint.` : 'Illegal move.', 'bad');
    syncBoard(); // snaps the piece back
    return;
  }

  state.lastMove = [res.move.from, res.move.to];
  syncBoard();
  if (drill.done) finishLine();
  else {
    setStatus(`✓ ${res.move.san}`, 'good');
    queueOpponent(drill);
  }
}

async function finishLine() {
  const { drill } = state;
  const id = drill.line.id;
  const result = drill.result;
  setStatus(result === 'pass'
    ? '🎉 Perfect! Line complete with no mistakes. Use ← → to review it.'
    : `Line complete with ${drill.mistakes} mistake${drill.mistakes > 1 ? 's' : ''}. It'll come back sooner. Use ← → to review it.`,
    result === 'pass' ? 'good' : 'bad');
  state.reviewing = true; // the result is recorded; from here the arrows just browse the line
  els.navRow.hidden = false;
  syncBoard();

  state.progress[id] = schedule(state.progress[id], result);
  renderLineList();
  try {
    await saveProgress(id, state.progress[id]);
    els.progressError.hidden = true;
  } catch (err) {
    showProgressError(`Progress not saved: ${err.message}`);
  }
}

function showHintArrow() {
  const d = state.drill;
  if (!d?.playerToMove) return;
  const { from, to } = d.expectedSquares();
  cg.setAutoShapes([{ orig: from, dest: to, brush: 'green' }]);
}

/** Push the drill's position into chessground. */
function syncBoard() {
  const d = state.drill;
  const yourTurn = d.playerToMove && !state.reviewing;
  cg.set({
    fen: d.chess.fen(),
    turnColor: d.chess.turn() === 'w' ? 'white' : 'black',
    check: d.chess.inCheck(),
    lastMove: state.lastMove,
    movable: { color: yourTurn ? d.playerColor : undefined, dests: yourTurn ? d.dests() : new Map() },
  });
  renderMoves();
  els.prev.disabled = d.ply === 0;
  els.fwd.disabled = d.done;
  if (els.statsCard.open) loadStats();
}

// ---------- stepping through moves (← → keys and ◀ ▶ buttons) ----------

/** Move the drill one step back or forward. Returns false if that isn't allowed here. */
function drillStep(dir) {
  const d = state.drill;
  if (!d) return false;
  if (state.mode === 'test' && !state.reviewing) {
    setStatus('The arrow keys are off during the test. Finish the line, then use them to review it.');
    return false;
  }
  const target = d.ply + dir;
  if (target < 0 || target > d.line.moves.length) return false;
  d.goTo(target);
  const last = d.chess.history({ verbose: true }).at(-1);
  state.lastMove = last ? [last.from, last.to] : undefined;
  syncBoard();
  if (state.mode === 'learn') {
    learnStep();
  } else {
    // Reviewing a finished test: explain the move that was just shown.
    cg.setAutoShapes([]);
    showNote(d.ply ? d.line.notes?.[d.ply - 1] ?? null : null);
    setStatus(`Reviewing: move ${d.ply} of ${d.line.moves.length}.`);
  }
  return true;
}

/** Identifier: ◀ takes a move back, ▶ replays it (until a different move is played). */
function idStep(dir) {
  const c = idState.chess;
  if (dir < 0) {
    const undone = c.undo();
    if (!undone) return false;
    idState.future.push(undone.san);
  } else {
    const san = idState.future.pop();
    if (!san) return false;
    c.move(san);
  }
  const last = c.history({ verbose: true }).at(-1);
  idState.lastMove = last ? [last.from, last.to] : undefined;
  idSync();
  return true;
}

const step = (dir) => (state.view === 'identify' ? idStep(dir) : drillStep(dir));

// ---------- rendering ----------

function setStatus(text, tone = '') {
  els.status.textContent = text;
  els.status.className = `status ${tone}`;
}

function showNote(text) {
  showNotes(null, text);
}

/** The explanation box: optionally the opponent's last move on top, then the current move. */
function showNotes(theirs, text) {
  els.note.replaceChildren();
  if (theirs) {
    const p = document.createElement('p');
    p.className = 'note-theirs';
    const san = document.createElement('strong');
    san.textContent = `${theirs.san}: `;
    p.append(san, theirs.text);
    els.note.append(p);
  }
  if (text) {
    const p = document.createElement('p');
    p.textContent = text;
    els.note.append(p);
  }
  els.note.hidden = !theirs && !text;
}

function showAction(label, onClick) {
  els.action.textContent = label;
  els.action.onclick = onClick;
  els.action.hidden = false;
}

function hideAction() {
  els.action.hidden = true;
  els.action.onclick = null;
}

function renderMoves() {
  renderMoveList(state.drill.chess.history(), els.moveList);
}

function renderMoveList(history, target) {
  target.innerHTML = '';
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement('li');
    li.textContent = `${history[i]} ${history[i + 1] ?? ''}`;
    target.append(li);
  }
}

function dueLabel(s) {
  if (!s) return { text: 'New', cls: 'new' };
  const ms = new Date(s.dueAt) - Date.now();
  if (ms <= 0) return { text: 'Due', cls: 'due' };
  const days = Math.ceil(ms / 86_400_000);
  return { text: `in ${days}d`, cls: 'later' };
}

function renderLineList() {
  els.lineList.innerHTML = '';
  for (const line of state.repertoire.lines) {
    const s = state.progress[line.id];
    const due = dueLabel(s);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'line-btn' + (state.drill?.line.id === line.id ? ' active' : '');
    btn.innerHTML = `<span></span><span class="pill ${due.cls}"></span>`;
    btn.children[0].textContent = line.name;
    btn.children[1].textContent = due.text;
    btn.title = s ? `${s.correct}/${s.attempts} perfect runs` : 'Not played yet';
    btn.addEventListener('click', () => startLine(line));
    li.append(btn);
    els.lineList.append(li);
  }
}

function showProgressError(msg) {
  els.progressError.textContent = msg;
  els.progressError.hidden = false;
}

// ---------- explorer stats ----------

const statsCache = new Map();
let statsRequest = 0;

async function loadStats() {
  const fen = state.drill.chess.fen();
  const reqId = ++statsRequest;
  if (!statsCache.has(fen)) {
    els.stats.innerHTML = '<p class="muted">Loading…</p>';
    try {
      statsCache.set(fen, await fetchExplorer(fen));
    } catch (err) {
      if (reqId === statsRequest) els.stats.innerHTML = `<p class="muted">Stats unavailable: ${escapeHtml(err.message)}</p>`;
      return;
    }
  }
  if (reqId === statsRequest) renderStats(statsCache.get(fen));
}

function renderStats(data, target = els.stats, { showName = true } = {}) {
  const moves = (data.moves ?? []).slice(0, 6);
  if (!moves.length) {
    target.innerHTML = '<p class="muted">No games found for this position.</p>';
    return;
  }
  const total = moves.reduce((n, m) => n + m.white + m.draws + m.black, 0);
  const rows = moves.map((m) => {
    const n = m.white + m.draws + m.black;
    const pct = (x) => ((x / n) * 100).toFixed(0);
    return `<div class="stat-row">
      <span class="san">${escapeHtml(m.san)}</span>
      <span class="games">${((n / total) * 100).toFixed(0)}%</span>
      <div class="wdl" title="White ${pct(m.white)}% · Draw ${pct(m.draws)}% · Black ${pct(m.black)}%">
        <i class="w" style="width:${pct(m.white)}%"></i><i class="d" style="width:${pct(m.draws)}%"></i><i class="b" style="width:${pct(m.black)}%"></i>
      </div>
    </div>`;
  }).join('');
  const name = showName && data.opening ? `<p class="opening">${escapeHtml(data.opening.eco)} · ${escapeHtml(data.opening.name)}</p>` : '';
  target.innerHTML = `${name}<div class="stat-head"><span>Move</span><span>Played</span><span>White / Draw / Black</span></div>${rows}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- opening identifier ----------

function legalDests(chess) {
  const map = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!map.has(m.from)) map.set(m.from, []);
    map.get(m.from).push(m.to);
  }
  return map;
}

const sideName = (chess) => (chess.turn() === 'w' ? 'white' : 'black');

function onIdentifyMove(orig, dest) {
  let move;
  try {
    move = idState.chess.move({ from: orig, to: dest, promotion: 'q' });
  } catch {
    idSync();
    return;
  }
  idState.lastMove = [move.from, move.to];
  // Playing a different move than the one taken back starts a new branch.
  if (idState.future.at(-1) === move.san) idState.future.pop();
  else idState.future = [];
  idSync();
}

/** Push the identifier's position into chessground and refresh the panel. */
function idSync() {
  const c = idState.chess;
  cg.set({
    orientation: idState.orientation,
    fen: c.fen(),
    turnColor: sideName(c),
    check: c.inCheck(),
    lastMove: idState.lastMove,
    movable: { color: c.isGameOver() ? undefined : sideName(c), dests: legalDests(c) },
  });
  cg.setAutoShapes([]);
  renderMoveList(c.history(), els.idMoveList);
  els.idUndo.disabled = c.history().length === 0;
  els.idRedo.disabled = idState.future.length === 0;
  renderIdRepertoire();
  loadIdStats();
}

let idRequest = 0;

async function loadIdStats() {
  const c = idState.chess;
  const fen = c.fen();
  const reqId = ++idRequest;
  if (!statsCache.has(fen)) {
    els.idBest.hidden = true;
    els.idStats.innerHTML = '<p class="muted">Looking up this position…</p>';
    try {
      statsCache.set(fen, await fetchExplorer(fen));
    } catch (err) {
      if (reqId !== idRequest) return;
      renderIdOpening(null);
      els.idStats.innerHTML = `<p class="muted">Database unavailable: ${escapeHtml(err.message)}</p>`;
      return;
    }
  }
  if (reqId !== idRequest) return; // a newer move was made while this was loading
  const data = statsCache.get(fen);
  renderIdOpening(data);
  renderIdBest(data);
  renderStats(data, els.idStats, { showName: false });
}

/** The most recent named opening along the moves played, from cached lookups. */
function lastKnownOpening() {
  const replay = new Chess();
  let found = null;
  for (const san of idState.chess.history()) {
    replay.move(san);
    const name = statsCache.get(replay.fen())?.opening;
    if (name) found = name;
  }
  return found;
}

function renderIdOpening(data) {
  const plies = idState.chess.history().length;
  let html;
  if (data?.opening) {
    html = `<span class="eco">${escapeHtml(data.opening.eco)}</span> <strong>${escapeHtml(data.opening.name)}</strong>`;
  } else if (plies === 0) {
    html = '<strong>Starting position</strong>';
  } else {
    const known = lastKnownOpening();
    html = known
      ? `<span class="eco">${escapeHtml(known.eco)}</span> <strong>${escapeHtml(known.name)}</strong><br><span class="muted">You've gone past the named part of this opening.</span>`
      : '<strong>No named opening yet</strong>';
  }
  els.idOpening.innerHTML = html;
}

function renderIdBest(data) {
  const c = idState.chess;
  const side = sideName(c);
  const best = pickBestMove(scoreMoves(data, side));
  if (!best || c.isGameOver()) {
    els.idBest.hidden = false;
    els.idBest.innerHTML = c.isGameOver()
      ? '<span class="muted">The game is over.</span>'
      : '<span class="muted">No games in the database reach this position, so there is no suggestion.</span>';
    cg.setAutoShapes([]);
    return;
  }
  const m = new Chess(c.fen()).move(best.san);
  cg.setAutoShapes([{ orig: m.from, dest: m.to, brush: 'green' }]);
  const games = best.games.toLocaleString();
  const leadsTo = best.opening ? ` It leads to the <em>${escapeHtml(best.opening.name)}</em>.` : '';
  els.idBest.hidden = false;
  els.idBest.innerHTML = `Best reply for ${side}: <strong class="san">${escapeHtml(best.san)}</strong> (green arrow).
    <span class="muted">${side[0].toUpperCase() + side.slice(1)} scores ${(best.score * 100).toFixed(0)}% with it across ${games} games.${leadsTo}</span>`;
}

function renderIdRepertoire() {
  const history = idState.chess.history();
  const { matches, closest } = findRepertoireMatches(REPERTOIRES, history);
  els.idRep.innerHTML = '';
  els.idRepCard.hidden = !matches.length && !closest;

  for (const m of matches) {
    const row = document.createElement('div');
    row.className = 'id-rep-row';
    const text = document.createElement('p');
    text.innerHTML = m.yourMove
      ? `<strong></strong> (<span></span>): your line plays <strong class="san"></strong> here.`
      : `<strong></strong> (<span></span>): your line expects <strong class="san"></strong> next.`;
    const [lineName, repName, next] = text.querySelectorAll('strong, span');
    lineName.textContent = m.line.name;
    repName.textContent = m.repertoire.name;
    next.textContent = m.nextMove;
    const btn = document.createElement('button');
    btn.textContent = 'Train this line';
    btn.addEventListener('click', () => trainLine(m.repertoire, m.line));
    row.append(text, btn);
    els.idRep.append(row);
  }

  if (closest) {
    const moveNo = Math.floor(closest.shared / 2) + 1;
    const dots = closest.shared % 2 === 0 ? '.' : '...';
    const label = (san) => `${moveNo}${dots}${san}`;
    const p = document.createElement('p');
    p.innerHTML = `You've left your lines. The closest is <strong></strong> (<span></span>), which played <strong class="san"></strong> instead of <strong class="san"></strong>.`;
    const [lineName, repName, book, played] = p.querySelectorAll('strong, span');
    lineName.textContent = closest.line.name;
    repName.textContent = closest.repertoire.name;
    book.textContent = label(closest.bookMove);
    played.textContent = label(history[closest.shared]);
    els.idRep.append(p);
  }
}

function trainLine(repertoire, line) {
  state.repertoire = repertoire;
  renderPicker();
  try { localStorage.setItem(REP_KEY, repertoire.id); } catch {}
  setView('train', { fresh: true });
  startLine(line);
  // On a phone this button sits below the board, so bring the board back into view.
  if (els.board.getBoundingClientRect().top < 0) els.board.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- views ----------

function setView(view, { fresh = false } = {}) {
  state.view = view;
  document.body.dataset.view = view;
  els.tabTrain.setAttribute('aria-selected', String(view === 'train'));
  els.tabIdentify.setAttribute('aria-selected', String(view === 'identify'));
  // Hiding the other view's controls can move the board without resizing it (on phones the
  // top bar wraps), and chessground only re-measures on resize/scroll, so taps would land on
  // the wrong squares. Force it to re-measure.
  cg.redrawAll();
  if (view === 'identify') {
    idSync();
    return;
  }
  if (fresh || !state.drill) return;
  // Back to the drill exactly where it was left.
  cg.set({ orientation: state.drill.playerColor });
  syncBoard();
  if (state.mode === 'learn') learnStep();
  else {
    cg.setAutoShapes([]);
    if (!state.drill.done && !state.drill.playerToMove) queueOpponent(state.drill);
  }
}

// ---------- setup ----------

function selectRepertoire(id) {
  state.repertoire = REPERTOIRES.find((r) => r.id === id) ?? REPERTOIRES[0];
  try { localStorage.setItem(REP_KEY, state.repertoire.id); } catch {}
  renderPicker();
  startLine(pickNext(state.repertoire.lines, state.progress));
}

/** The opening picker: one row of buttons per color, with the current opening highlighted. */
function renderPicker() {
  els.picker.innerHTML = '';
  for (const [color, label] of [['white', '♔ White'], ['black', '♚ Black']]) {
    const row = document.createElement('div');
    row.className = 'picker-row';
    const heading = document.createElement('span');
    heading.className = 'picker-label';
    heading.textContent = label;
    const chips = document.createElement('div');
    chips.className = 'picker-chips';
    for (const rep of REPERTOIRES.filter((r) => r.color === color)) {
      const [moves, title] = rep.name.split(' — ');
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.setAttribute('aria-pressed', String(rep === state.repertoire));
      btn.innerHTML = '<span class="chip-title"></span><span class="chip-moves"></span>';
      btn.children[0].textContent = title ?? rep.name;
      btn.children[1].textContent = title ? moves : '';
      btn.addEventListener('click', () => rep !== state.repertoire && selectRepertoire(rep.id));
      chips.append(btn);
    }
    row.append(heading, chips);
    els.picker.append(row);
    // On phones each row scrolls sideways; keep the selected opening in view.
    const active = chips.querySelector('[aria-pressed="true"]');
    if (active) chips.scrollLeft = active.offsetLeft - chips.offsetLeft - 8;
  }
}

els.next.addEventListener('click', () => startLine(pickNext(state.repertoire.lines, state.progress)));
els.restart.addEventListener('click', () => state.drill && startLine(state.drill.line, state.mode));
els.modeBtn.addEventListener('click', () => {
  if (state.drill) startLine(state.drill.line, state.mode === 'learn' ? 'test' : 'learn');
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (step(e.key === 'ArrowRight' ? 1 : -1)) e.preventDefault();
});
els.prev.addEventListener('click', () => step(-1));
els.fwd.addEventListener('click', () => step(1));
els.hint.addEventListener('click', () => {
  if (state.mode !== 'test' || state.reviewing || !state.drill?.playerToMove) return;
  state.drill.reveal();
  showHintArrow();
  setStatus('Hint shown. This counts as a mistake for this line.', 'bad');
});
els.statsCard.addEventListener('toggle', () => els.statsCard.open && loadStats());

els.tabTrain.addEventListener('click', () => state.view !== 'train' && setView('train'));
els.tabIdentify.addEventListener('click', () => state.view !== 'identify' && setView('identify'));
els.idUndo.addEventListener('click', () => idStep(-1));
els.idRedo.addEventListener('click', () => idStep(1));
els.idReset.addEventListener('click', () => {
  idState.chess = new Chess();
  idState.lastMove = undefined;
  idState.future = [];
  idSync();
});
els.idFlip.addEventListener('click', () => {
  idState.orientation = idState.orientation === 'white' ? 'black' : 'white';
  cg.set({ orientation: idState.orientation });
});

let saved = null;
try { saved = localStorage.getItem(REP_KEY); } catch {}
selectRepertoire(REPERTOIRES.some((r) => r.id === saved) ? saved : REPERTOIRES[0].id);

fetchProgress()
  .then((progress) => {
    state.progress = progress;
    // The first line started before progress arrived, so it defaulted to Learn.
    // If it turns out you've already studied it, switch to the test.
    const d = state.drill;
    if (d && state.mode === 'learn' && d.ply === 0 && progress[d.line.id]) startLine(d.line, 'test');
    else renderLineList();
  })
  .catch((err) => showProgressError(`Couldn't load saved progress (${err.message}). You can still practice.`));
