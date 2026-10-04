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
  hint: $('hint-btn'), restart: $('restart-btn'), lineName: $('line-name'),
  status: $('status'), note: $('note'), moveList: $('move-list'),
  statsCard: $('stats-card'), stats: $('stats'), lineList: $('line-list'),
  progressError: $('progress-error'),
};

const state = {
  repertoire: REPERTOIRES[0],
  progress: {},   // lineId → srs state
  drill: null,
};

const cg = Chessground(els.board, {
  movable: { free: false, showDests: true, events: { after: onUserMove } },
  draggable: { showGhost: true },
  highlight: { lastMove: true, check: true },
  animation: { duration: 200 },
});

// ---------- drill flow ----------

function startLine(line) {
  const drill = new Drill(line, state.repertoire.color);
  state.drill = drill;
  els.lineName.textContent = line.name;
  setStatus('Your move.');
  showNote(null);
  cg.set({ orientation: drill.playerColor, lastMove: undefined });
  cg.setAutoShapes([]);
  syncBoard();
  renderLineList();
  if (!drill.playerToMove) queueOpponent(drill);
}

function queueOpponent(drill) {
  setTimeout(() => {
    if (state.drill !== drill || drill.done) return; // the user switched lines meanwhile
    const move = drill.playOpponent();
    cg.set({ lastMove: [move.from, move.to] });
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

  if (!res.ok) {
    setStatus(res.tried ? `✗ ${res.tried} isn't the book move. Play the arrow.` : 'Illegal move.', 'bad');
    showHintArrow();
    syncBoard(); // snaps the piece back
    return;
  }

  cg.set({ lastMove: [res.move.from, res.move.to] });
  syncBoard();
  showNote(res.note);
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
els.restart.addEventListener('click', () => state.drill && startLine(state.drill.line));
els.hint.addEventListener('click', () => {
  if (!state.drill?.playerToMove) return;
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
  .then((progress) => { state.progress = progress; renderLineList(); })
  .catch((err) => showProgressError(`Couldn't load saved progress (${err.message}). You can still practice.`));

// chessground caches square sizes; recompute them when the layout changes.
window.addEventListener('resize', () => cg.redrawAll());
