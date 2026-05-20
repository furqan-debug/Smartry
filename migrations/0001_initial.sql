-- Initial migration: create workers and tasks tables
-- (derived from supabase_schema.sql)

-- Create workers table
create table public.workers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text,
  role text default 'Staff',
  status text not null default 'offline',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create tasks table
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  customer_name text default 'Guest',
  location text not null default 'TBD',
  description text not null,
  category text not null default 'General',
  priority text not null default 'normal',
  sla_deadline timestamp with time zone,
  status text not null default 'pending',
  worker_id uuid references public.workers(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Publication for realtime
alter table public.workers enable row level security;
alter table public.tasks enable row level security;

begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.workers;
