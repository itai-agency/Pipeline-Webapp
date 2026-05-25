-- Pipeline dashboard: Meta spend + Kommo pipeline + daily metrics
-- Run in Supabase SQL editor or via CLI

-- Meta ad spend (granular, idempotent upsert key: date + account_id)
create table if not exists public.meta_spend_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  client text not null,
  account_name text not null,
  account_id text not null,
  spend numeric(12, 2) not null default 0,
  currency text not null default 'MXN',
  source text not null default 'meta_ads',
  synced_at timestamptz not null default now(),
  unique (event_date, account_id)
);

create index if not exists idx_meta_spend_events_date on public.meta_spend_events (event_date);
create index if not exists idx_meta_spend_events_client on public.meta_spend_events (client);

-- Kommo lead/stage events (normalized)
create table if not exists public.kommo_lead_events (
  id uuid primary key default gen_random_uuid(),
  kommo_lead_id bigint not null,
  event_date date not null,
  client text not null,
  pipeline_id bigint,
  status_id bigint,
  stage_name text,
  responsible_user_id bigint,
  responsible_name text,
  conversations int not null default 0,
  mql int not null default 0,
  sql int not null default 0,
  citas int not null default 0,
  firmas int not null default 0,
  raw_payload jsonb,
  synced_at timestamptz not null default now(),
  unique (kommo_lead_id, event_date)
);

create index if not exists idx_kommo_lead_events_date on public.kommo_lead_events (event_date);
create index if not exists idx_kommo_lead_events_client on public.kommo_lead_events (client);

-- Daily dashboard aggregates (pipeline + spend unified)
create table if not exists public.dashboard_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  client text not null,
  conversaciones int not null default 0,
  mql int not null default 0,
  sql int not null default 0,
  citas int not null default 0,
  firmas int not null default 0,
  gasto_total numeric(12, 2),
  semana text,
  mes text,
  updated_at timestamptz not null default now(),
  unique (metric_date, client)
);

create index if not exists idx_dashboard_metrics_daily_date on public.dashboard_metrics_daily (metric_date);

-- Sync audit log
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('meta', 'kommo', 'metrics')),
  status text not null check (status in ('running', 'success', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed int not null default 0,
  error_message text
);

alter table public.meta_spend_events enable row level security;
alter table public.kommo_lead_events enable row level security;
alter table public.dashboard_metrics_daily enable row level security;
alter table public.sync_runs enable row level security;

-- Authenticated dashboard users: read-only on metrics tables
create policy "dashboard_read_meta_spend"
  on public.meta_spend_events for select
  to authenticated
  using (true);

create policy "dashboard_read_kommo_leads"
  on public.kommo_lead_events for select
  to authenticated
  using (true);

create policy "dashboard_read_metrics_daily"
  on public.dashboard_metrics_daily for select
  to authenticated
  using (true);

create policy "dashboard_read_sync_runs"
  on public.sync_runs for select
  to authenticated
  using (true);

-- Service role bypasses RLS; no insert/update policies for authenticated (writes via backend only)
