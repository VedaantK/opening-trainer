# Prompt Log: Opening Trainer

## Tools used
| Tool / model | Used for | Why |
|---|---|---|
| Claude Code (Claude Opus 5.5) | Brainstorming the idea, scaffolding the project (board, drill engine, API routes, schema) | _fill in_ |
| _…_ | _…_ | _…_ |

## Which tool for which job
_A sentence or two, in your words._

## One place AI got it wrong
_One short paragraph. Possible candidates from session 1, but use whichever really mattered to you:_
- _While writing the repertoire files, Claude wrote move explanations that were wrong as chess, e.g. "c3 gives the c4 bishop a retreat square on c2/b3" (a bishop on c4 can't reach c2 in one move) and "pin the f3 knight" when no knight was on f3. It caught these on review; the takeaway is that the chess content needs a human check, not just the code._
- _Claude thought the Lichess explorer probably needed a token but wasn't sure; it only confirmed by curling the endpoint (HTTP 401 without one)._

## What I wrote or substantially modified myself
- [ ] `src/srs.js`: spaced-repetition scheduler (`schedule`, `pickNext`), checked against `tests/srs.test.js`
- [ ] _…_

---

## Session 1: 2026-10-04, idea + scaffold (Claude Code, Opus 5.5)

**Prompt 1** (pasted the full Project 2 spec):
> Can you suggest a project that fits these requirements [assignment text pasted]

_Result: suggested a trade-journal app._

**Prompt 2**
> Can you give me a list of 3-5 suggestoins

_Result: five ideas (trade journal, market-guessing game, city dashboard, CV gesture game, persona chatbot)._

**Prompt 3**
> Can you think of somehting chess related, stock like game related, stock market overall analyzer and dashboard or tracker type of thing

_Result: seven ideas incl. Blunder Mirror, GM Exchange (players as stocks), Crash Replay._

**Prompt 4**
> How hard would it be to do make a chess opening teacher, and would it meet all the requirements of the project

_Result: feasibility breakdown + requirement mapping; decided on this project._

**Prompt 5**
> yes set it up

_Result: Claude scaffolded the project: Vite + chessground + chess.js frontend, `Drill` class, Vercel functions for the Lichess explorer proxy (with Supabase cache) and progress, Supabase schema with RLS, two repertoires (Italian as White, Caro-Kann as Black), tests. It deliberately left `src/srs.js` as a placeholder for me to implement._

_My notes / what I checked or changed:_

---

## Session 2: _date_
