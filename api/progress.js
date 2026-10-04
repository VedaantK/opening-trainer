// GET  /api/progress?user=<uuid>           → { progress: { [lineId]: state } }
// POST /api/progress { user, lineId, state } → { ok: true }
//
// Users are anonymous: the browser generates a random UUID and keeps it in localStorage.
import { supabase } from './_lib/supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINE_RE = /^[a-z0-9-]{1,64}$/;

export default async function handler(req, res) {
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  if (req.method === 'GET') {
    const user = String(req.query.user ?? '');
    if (!UUID_RE.test(user)) return res.status(400).json({ error: 'Invalid user id' });

    const { data, error } = await supabase
      .from('progress').select('line_id, box, due_at, attempts, correct').eq('user_id', user);
    if (error) return res.status(500).json({ error: 'Database error' });

    const progress = {};
    for (const row of data) {
      progress[row.line_id] = { box: row.box, dueAt: row.due_at, attempts: row.attempts, correct: row.correct };
    }
    return res.status(200).json({ progress });
  }

  if (req.method === 'POST') {
    const { user, lineId, state } = req.body ?? {};
    if (!UUID_RE.test(user ?? '')) return res.status(400).json({ error: 'Invalid user id' });
    if (!LINE_RE.test(lineId ?? '')) return res.status(400).json({ error: 'Invalid line id' });
    const { box, dueAt, attempts, correct } = state ?? {};
    const isCount = (n) => Number.isInteger(n) && n >= 0 && n < 100000;
    if (![box, attempts, correct].every(isCount) || Number.isNaN(Date.parse(dueAt))) {
      return res.status(400).json({ error: 'Invalid progress state' });
    }

    const { error } = await supabase.from('progress').upsert({
      user_id: user, line_id: lineId, box, due_at: dueAt, attempts, correct,
      updated_at: new Date().toISOString(),
    });
    if (error) return res.status(500).json({ error: 'Database error' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
