-- Draft RLS policies and recommendations for Smartry
-- NOTE: This file contains suggested policies and schema notes. Review before applying.

-- Recommendation: add an `auth_id uuid` column to `workers` to bind workers to Supabase Auth users.
-- Example migration (not applied here):
-- alter table public.workers add column auth_id uuid;

-- Enabling RLS is recommended for production. Policies below are examples and may require schema changes.

-- Example: enable RLS
-- alter table public.workers enable row level security;
-- alter table public.tasks enable row level security;

-- Example policy: allow authenticated users to insert worker records (sign-up flow)
-- create policy "workers_insert_authenticated" on public.workers
--   for insert
--   using (auth.role() = 'authenticated');

-- Example policy: allow worker to update their own record (requires auth_id column)
-- create policy "workers_update_self" on public.workers
--   for update
--   using (auth.uid() = auth_id);

-- Example policy: tasks
-- - Allow public inserts from kiosk (if kiosk uses anon key): this is optional and requires careful rate-limiting.
-- - Prefer authenticated inserts or a server-side function to sanitize inputs.

-- Example: allow authenticated users to update tasks they own (worker_id matches their worker record)
-- create policy "tasks_update_by_worker" on public.tasks
--   for update
--   using (EXISTS (select 1 from public.workers w where w.id = public.tasks.worker_id and w.auth_id = auth.uid()));

-- Example: allow anyone to select tasks/workers if needed for read-only public dashboards (or require auth):
-- create policy "public_read" on public.tasks
--   for select
--   using (true);

-- Guidance:
-- 1. Prefer storing `auth_id` on workers to map Supabase user to worker record.
-- 2. Consider creating Postgres functions to handle task creation from kiosks and sanitize fields.
-- 3. Use Edge functions or server-side validation for sensitive updates (status changes, assignment).
