// main.js: wires the board, the drill, and the backend together and handles UI.
import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';

import { Drill } from './drill.js';
import { schedule, pickNext } from './srs.js';
import { fetchExplorer, fetchProgress, saveProgress } from './api.js';
import italian from './repertoires/italian-white.json';
import caroKann from './repertoires/caro-kann-black.json';

const REPERTOIRES = [italian, caroKann];
const OPPONENT_DELAY_MS = 450;
const REP_KEY = 'opening-trainer:repertoire';

const $ = (id) => document.getElementById(id);
const els = {
  board: $('board'), select: $('repertoire-select'), next: $('next-btn'),
  hint: $('hint-btn'), restart: $('restart-btn'), modeBtn: $('mode-btn'),
  lineName: $('line-name'), modeBadge: $('mode-badge'), intro: $('intro'),
  status: $('status'), note: $('note'), action: $('action-btn'), moveList: $('move-list'),
  statsCard: $('stats-card'), stats: $('stats'), lineList: $('line-list'),
  progressError: $('progress-error'),
};

const state = {
  repertoire: REPERTOIRES[0],
  progress: {},   // lineId → srs state
  drill: null,
  mode: 'test',   // 'learn' = guided walkthrough with arrows, 'test' = from memory
  lastMove: undefined, // [from, to] of the last move actually played
};

const cg = Chessground(els.board, {
  movable: { free: false, showDests: true, events: { after: onUserMove } },
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
  const learning = mode === 'learn';

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
    learnStep();
  } else {
    setStatus('Play the line from memory. No arrows this time.');
    if (!drill.playerToMove) queueOpponent(drill);
  }
}

/** Learn mode: show the next move with an arrow and explain it. */
function learnStep() {
  const d = state.drill;
  if (d.done) {
    cg.setAutoShapes([]);
    showNote(null);
    setStatus("That's the whole line. Now play it from memory, with no arrows.", 'good');
    showAction('Start the test', () => startLine(d.line, 'test'));
    return;
  }
  const { from, to } = d.expectedSquares();
  showNote(d.line.notes?.[d.ply] ?? null);
  if (d.playerToMove) {
    cg.setAutoShapes([{ orig: from, dest: to, brush: 'green' }]);
    setStatus(`Your move: play ${d.expected} (green arrow).`);
    hideAction();
  } else {
    cg.setAutoShapes([{ orig: from, dest: to, brush: 'blue' }]);
    setStatus(`Their move: ${d.expected} (blue arrow).`);
    showAction('Continue ▶', () => {
      const move = d.playOpponent();
      state.lastMove = [move.from, move.to];
      syncBoard();
      learnStep();
    });
  }
}

function queueOpponent(drill) {
  setTimeout(() => {
    if (state.drill !== drill || drill.done) return; // the user switched lines meanwhile
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
    learnStep();
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
    ? '🎉 Perfect! Line complete with no mistakes.'
    : `Line complete with ${drill.mistakes} mistake${drill.mistakes > 1 ? 's' : ''}. It'll come back sooner.`,
    result === 'pass' ? 'good' : 'bad');

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
  const yourTurn = d.playerToMove;
  cg.set({
    fen: d.chess.fen(),
    turnColor: d.chess.turn() === 'w' ? 'white' : 'black',
    check: d.chess.inCheck(),
    lastMove: state.lastMove,
    movable: { color: yourTurn ? d.playerColor : undefined, dests: yourTurn ? d.dests() : new Map() },
  });
  renderMoves();
  if (els.statsCard.open) loadStats();
}

// ---------- rendering ----------

function setStatus(text, tone = '') {
  els.status.textContent = text;
  els.status.className = `status ${tone}`;
}

function showNote(text) {
  els.note.hidden = !text;
  els.note.textContent = text ?? '';
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
  const history = state.drill.chess.history();
  els.moveList.innerHTML = '';
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement('li');
    li.textContent = `${history[i]} ${history[i + 1] ?? ''}`;
    els.moveList.append(li);
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

function renderStats(data) {
  const moves = (data.moves ?? []).slice(0, 6);
  if (!moves.length) {
    els.stats.innerHTML = '<p class="muted">No games found for this position.</p>';
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
  const name = data.opening ? `<p class="opening">${escapeHtml(data.opening.eco)} · ${escapeHtml(data.opening.name)}</p>` : '';
  els.stats.innerHTML = `${name}<div class="stat-head"><span>Move</span><span>Played</span><span>White / Draw / Black</span></div>${rows}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- setup ----------

function selectRepertoire(id) {
  state.repertoire = REPERTOIRES.find((r) => r.id === id) ?? REPERTOIRES[0];
  try { localStorage.setItem(REP_KEY, state.repertoire.id); } catch {}
  startLine(pickNext(state.repertoire.lines, state.progress));
}

for (const r of REPERTOIRES) els.select.add(new Option(r.name, r.id));
els.select.addEventListener('change', () => selectRepertoire(els.select.value));
els.next.addEventListener('click', () => startLine(pickNext(state.repertoire.lines, state.progress)));
els.restart.addEventListener('click', () => state.drill && startLine(state.drill.line, state.mode));
els.modeBtn.addEventListener('click', () => {
  if (state.drill) startLine(state.drill.line, state.mode === 'learn' ? 'test' : 'learn');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' && !els.action.hidden && e.target.tagName !== 'SELECT') els.action.click();
});
els.hint.addEventListener('click', () => {
  if (state.mode !== 'test' || !state.drill?.playerToMove) return;
  state.drill.reveal();
  showHintArrow();
  setStatus('Hint shown. This counts as a mistake for this line.', 'bad');
});
els.statsCard.addEventListener('toggle', () => els.statsCard.open && loadStats());

let saved = null;
try { saved = localStorage.getItem(REP_KEY); } catch {}
els.select.value = REPERTOIRES.some((r) => r.id === saved) ? saved : REPERTOIRES[0].id;
selectRepertoire(els.select.value);

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
