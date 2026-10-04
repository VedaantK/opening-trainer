// api.js: the browser-side wrappers around our own backend (/api/*).
// The browser never talks to Lichess or Supabase directly; secrets stay on the server.

const USER_KEY = 'opening-trainer:user';

/** Anonymous per-browser ID. Falls back to a session-only ID if storage is blocked. */
export function getUserId() {
  try {
    let id = localStorage.getItem(USER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(USER_KEY, id);
    }
    return id;
  } catch {
    return (getUserId.fallback ??= crypto.randomUUID());
  }
}

async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Network error. Check your connection.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Server error (${res.status})`);
  return body;
}

export function fetchExplorer(fen) {
  return request(`/api/explorer?fen=${encodeURIComponent(fen)}`);
}

export async function fetchProgress() {
  const { progress } = await request(`/api/progress?user=${getUserId()}`);
  return progress; // { [lineId]: state }
}

export function saveProgress(lineId, state) {
  return request('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: getUserId(), lineId, state }),
  });
}
