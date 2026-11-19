# Opening Trainer

[![tests](https://github.com/VedaantK/opening-trainer/actions/workflows/tests.yml/badge.svg)](https://github.com/VedaantK/opening-trainer/actions/workflows/tests.yml)

**Learn chess openings by playing them.** **[Try it live →](https://opening-trainer-u1ow.onrender.com)**

Most opening tools have you memorize lines from a list. This one makes you play them on the board,
then brings back the lines you get wrong until they stick.

## How it works

1. **Pick an opening.** There are nine repertoires: Italian, Ruy Lopez, Queen's Gambit and London as
   White; Sicilian, French, Caro-Kann, Slav and King's Indian as Black.
2. **Learn mode.** Play through each line with arrows showing the right move.
3. **Test mode.** Play the same line with no help. A line passes only if you play it with zero mistakes.
4. **Next.** The Next button picks the line you most need: one you've never played, otherwise the
   most overdue. Each line shows when it's next due.

Review timing uses a Leitner spaced-repetition system ([`src/srs.js`](src/srs.js)). Passing a line
moves it up a box, so you see it after 1, 3, 7, 16, then 35 days. Missing a line sends it back to
the start.

There's also an **opening identifier**. Play any moves and it names the opening and shows what
real players do next, using move statistics from the
[Lichess Opening Explorer](https://lichess.org/api#tag/Opening-Explorer). A reply needs at least 5%
of games and 20 games played before it can be called "best", so a move that scored 100% in three
games doesn't win.

## Architecture

| Part | What it does |
|---|---|
| Front end ([`src/`](src)) | Vite, [chessground](https://github.com/lichess-org/chessground) board, [chess.js](https://github.com/jhlywa/chess.js) move rules |
| `GET /api/explorer` | Proxies Lichess so the API token stays on the server, and caches responses in Supabase for 7 days to stay under rate limits |
| `/api/progress` | Saves your spaced-repetition progress to Supabase |
| [`server.js`](server.js) | Serves the build and routes `/api/*` on Render |

The logic for scheduling, drill checking, move statistics and the identifier has no DOM or network
code, so it's unit-tested directly ([`tests/`](tests), run in CI on every push). See
[`TESTING.md`](TESTING.md) for what's covered and the deliberate-breakage checks.

## Run it locally

Requires Node 22.12+.

```bash
npm install
cp .env.example .env.local   # add a Lichess token and Supabase keys
npm run build
node --env-file=.env.local server.js
npm test                     # unit tests
```

Secrets are never committed. Locally they live in the untracked `.env.local`; in production they're
environment variables on Render.

## How AI was used

I built this with Claude Code (full history in [`prompt_log.md`](prompt_log.md)). I set up
Render and Supabase myself, including the database tables. I also wrote the board-theme dropdown
(HTML, CSS and the color themes) and directed the usability changes, such as arrow-key move navigation.

## Credits

- [chessground](https://github.com/lichess-org/chessground) (GPL-3.0) and [chess.js](https://github.com/jhlywa/chess.js) (BSD-2): board UI and move rules
- [Lichess Opening Explorer API](https://lichess.org/api#tag/Opening-Explorer): real-game move statistics
