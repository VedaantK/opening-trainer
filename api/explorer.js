// GET /api/explorer?fen=<FEN>
// Proxies the Lichess Opening Explorer so the API token stays server-side,
// and caches responses in Supabase to stay well under Lichess's rate limits.
import { supabase } from './_lib/supabase.js';

const EXPLORER_URL = 'https://explorer.lichess.ovh/lichess';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // opening stats barely change week to week
// Loose FEN shape check: 8 ranks, side to move, castling, en passant, clocks.
const FEN_RE = /^([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d+ \d+$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const fen = String(req.query.fen ?? '').trim();
  if (!FEN_RE.test(fen)) return res.status(400).json({ error: 'Invalid FEN' });

  // Move counters don't change the stats, so normalize them for a better cache hit rate.
  const key = fen.split(' ').slice(0, 4).join(' ');

  if (supabase) {
    const { data } = await supabase
      .from('explorer_cache').select('data, fetched_at').eq('fen', key).maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at) < CACHE_TTL_MS) {
      return res.status(200).json({ ...data.data, cached: true });
    }
  }

  const token = process.env.LICHESS_TOKEN;
  if (!token) return res.status(500).json({ error: 'Server is missing LICHESS_TOKEN' });

  const params = new URLSearchParams({ fen, moves: '8', topGames: '0', recentGames: '0' });
  let upstream;
  try {
    upstream = await fetch(`${EXPLORER_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return res.status(504).json({ error: 'Lichess explorer timed out' });
  }

  if (upstream.status === 429) return res.status(429).json({ error: 'Rate limited by Lichess, try again in a minute' });
  if (!upstream.ok) return res.status(502).json({ error: `Lichess explorer error (${upstream.status})` });

  const body = await upstream.json();
  if (supabase) {
    // Fire-and-forget would risk being cut off when the function exits, so await it.
    await supabase.from('explorer_cache')
      .upsert({ fen: key, data: body, fetched_at: new Date().toISOString() });
  }
  return res.status(200).json({ ...body, cached: false });
}
