// Server-only Supabase client. Files under api/_lib are not exposed as routes.
// Uses the service-role key, which bypasses row-level security, so it must NEVER
// be sent to the browser. The tables have RLS on and no public policies,
// so the anon key can't read them either.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: false } })
  : null;
