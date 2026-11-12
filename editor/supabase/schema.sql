-- Impulsa Studio: tablas de suscripciones y uso de la IA.
-- Ejecuta este archivo una vez en Supabase → SQL Editor → New query → Run.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  -- 'authorized' (pagando), 'pending', 'paused', 'cancelled', 'inactive'
  status text not null default 'inactive',
  -- true cuando lo activas tú a mano desde /admin (pago por transferencia, regalo, etc.)
  manual boolean not null default false,
  mp_preapproval_id text,
  next_payment_date timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null, -- 'YYYY-MM'
  count integer not null default 0,
  primary key (user_id, period)
);

alter table public.subscriptions enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "ver mi suscripcion" on public.subscriptions;
create policy "ver mi suscripcion" on public.subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "ver mi uso" on public.ai_usage;
create policy "ver mi uso" on public.ai_usage
  for select using (auth.uid() = user_id);

-- Suma 1 al contador del mes de forma atómica y devuelve el total.
create or replace function public.increment_ai_usage(p_user uuid, p_period text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage (user_id, period, count)
  values (p_user, p_period, 1)
  on conflict (user_id, period) do update set count = public.ai_usage.count + 1
  returning count;
$$;

revoke execute on function public.increment_ai_usage(uuid, text) from public, anon, authenticated;

-- Kit de marca de cada usuario (logo, colores, tipografía, contacto…)
create table if not exists public.brand_kits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.brand_kits enable row level security;
drop policy if exists "ver mi marca" on public.brand_kits;
create policy "ver mi marca" on public.brand_kits
  for select using (auth.uid() = user_id);

-- Proyectos guardados (las ediciones; los videos quedan en el dispositivo de cada usuario)
create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Proyecto sin título',
  data jsonb not null,
  thumb text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_idx on public.projects (user_id, updated_at desc);
alter table public.projects enable row level security;
drop policy if exists "ver mis proyectos" on public.projects;
create policy "ver mis proyectos" on public.projects
  for select using (auth.uid() = user_id);
