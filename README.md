# ♞ Opening Trainer

> ✍️ **Write this README yourself, in your own words.** The headings below are
> the items the assignment requires. Replace every prompt in _italics_.

**Live app:** _<Vercel URL>_
**Demo video:** _<YouTube/Drive link>_

## What it does
_One or two paragraphs: what problem it solves, who it's for._

## How to use it
_Walk through a session: pick a repertoire, play moves, what happens on a mistake, the stats panel, the line list._

## Features I'm most proud of
_Pick 2–3 and say why. The spaced-repetition scheduler you wrote is a strong candidate._

## How it works
_Short architecture overview: Vite frontend (chessground + chess.js) → Vercel serverless functions (`/api/explorer`, `/api/progress`) → Lichess Opening Explorer + Supabase Postgres._

## Running locally
```bash
npm install
cp .env.example .env.local   # fill in the three values
npx vercel dev               # runs the frontend and /api functions together
npm test                     # drill + scheduler tests
```
`npm run dev` runs only the frontend; the board still works, but stats and saved progress will show friendly "unavailable" messages.

## Secrets
_Explain: which secrets exist (LICHESS_TOKEN, SUPABASE_SERVICE_ROLE_KEY), where they live (Vercel env vars / untracked .env.local), why the browser never sees them, and the RLS setup in `supabase/schema.sql`._

## Mobile
_Note how it behaves on a phone._

## How I used AI
_Brief summary in your own words: which tools, for what, what you wrote yourself. Full details are in [prompt_log.md](prompt_log.md)._

## Credits
- [chessground](https://github.com/lichess-org/chessground) (GPL-3.0) and [chess.js](https://github.com/jhlywa/chess.js) (BSD-2): board UI and move rules
- [Lichess Opening Explorer API](https://lichess.org/api#tag/Opening-Explorer): real-game move statistics
- Initial scaffold generated with Claude Opus 5.5 (Claude Code); see prompt log
