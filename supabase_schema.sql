-- Supabase Schema for Smartry

-- Create workers table
create table public.workers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text,
  role text default 'Staff', -- e.g., 'Housekeeping', 'Maintenance', 'F&B'
  status text not null default 'offline', -- 'online', 'offline', 'busy'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create tasks table
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  customer_name text default 'Guest',
  location text not null default 'TBD', -- Room or Table number
  description text not null,
  category text not null default 'General', -- 'Housekeeping', 'F&B', 'Maintenance', etc.
  priority text not null default 'normal', -- 'low', 'normal', 'urgent'
  sla_deadline timestamp with time zone, -- When the task should be completed by
  status text not null default 'pending', -- 'pending', 'accepted', 'completed', 'rejected'
  worker_id uuid references public.workers(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable row level security (optional, based on requirements, but disabled here for prototyping)
alter table public.workers disable row level security;
alter table public.tasks disable row level security;

-- Setup publication for realtime subscriptions
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.workers;
