-- 003: Row Level Security. The app talks to Supabase with the SERVICE key
-- (bypasses RLS), so enabling RLS with no public policies = anon/authenticated
-- roles get zero access. This locks the database down by default.
alter table users enable row level security;
alter table sessions enable row level security;
alter table rate_limit_events enable row level security;
alter table audit_log enable row level security;
alter table agent_memory enable row level security;
alter table signal_predictions enable row level security;
alter table strategy_weights enable row level security;
alter table files enable row level security;
alter table chat_threads enable row level security;
alter table chat_messages enable row level security;
alter table activity_log enable row level security;
