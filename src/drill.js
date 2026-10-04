// drill.js: the state of one drill attempt. It has no DOM or network code,
// so it is easy to test and reason about.
//
// One line is a list of SAN moves from the starting position. The player plays
// one color; the drill auto-plays the other side's moves from the line.
import { Chess } from 'chess.js';

export class Drill {
  constructor(line, playerColor) {
    this.line = line;
    this.playerColor = playerColor; // 'white' | 'black'
    this.chess = new Chess();
    this.ply = 0;        // index into line.moves of the next move to be played
    this.mistakes = 0;
    this.revealed = false; // has the correct move been shown for this ply?
  }

  get done() { return this.ply >= this.line.moves.length; }
  get expected() { return this.line.moves[this.ply]; }

  /** True when it's the player's move (and the line isn't finished). */
  get playerToMove() {
    if (this.done) return false;
    const turn = this.chess.turn() === 'w' ? 'white' : 'black';
    return turn === this.playerColor;
  }

  /** Play the opponent's next book move. Returns the move object. */
  playOpponent() {
    const move = this.chess.move(this.expected);
    this.ply++;
    this.revealed = false;
    return move;
  }

  /**
   * The player tried to move orig→dest.
   * Returns { ok: true, move } if it was the book move. Otherwise returns
   * { ok: false, tried } and leaves the board unchanged.
   */
  tryMove(orig, dest) {
    const probe = new Chess(this.chess.fen());
    let move;
    try {
      move = probe.move({ from: orig, to: dest, promotion: 'q' });
    } catch {
      return { ok: false, tried: null }; // illegal (chessground shouldn't allow this)
    }
    if (move.san !== this.expected) {
      this.reveal();
      return { ok: false, tried: move.san };
    }
    this.chess.move(move.san);
    const noteIndex = this.ply;
    this.ply++;
    this.revealed = false;
    return { ok: true, move, note: this.line.notes?.[noteIndex] };
  }

  /** Show the answer for this move. Counts as a mistake (once per move). */
  reveal() {
    if (!this.revealed) this.mistakes++;
    this.revealed = true;
  }

  /** The from/to squares of the expected move, used to draw a hint arrow. */
  expectedSquares() {
    const m = new Chess(this.chess.fen()).move(this.expected);
    return { from: m.from, to: m.to };
  }

  /** Legal moves as Map<from, to[]>, the format chessground's `dests` expects. */
  dests() {
    const map = new Map();
    for (const m of this.chess.moves({ verbose: true })) {
      if (!map.has(m.from)) map.set(m.from, []);
      map.get(m.from).push(m.to);
    }
    return map;
  }

  get result() { return this.mistakes === 0 ? 'pass' : 'fail'; }
}
