create table if not exists app_runtime_state (
  id integer primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
