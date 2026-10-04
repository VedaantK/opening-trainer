-- Run this once in the Supabase dashboard → SQL Editor.

create table if not exists progress (
  user_id    uuid        not null,
  line_id    text        not null,
  box        int         not null default 0,
  due_at     timestamptz not null default now(),
  attempts   int         not null default 0,
  correct    int         not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, line_id)
);

create table if not exists explorer_cache (
  fen        text        primary key,  -- first 4 FEN fields (no move counters)
  data       jsonb       not null,
  fetched_at timestamptz not null default now()
);

-- Lock both tables down. With RLS on and no policies, only the server's
-- service-role key can read/write; the public anon key gets nothing.
alter table progress       enable row level security;
alter table explorer_cache enable row level security;
