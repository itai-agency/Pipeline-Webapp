-- Historial real de Kommo: varios movimientos por lead y por día.
alter table public.kommo_lead_events
  add column if not exists kommo_event_id text;

alter table public.kommo_lead_events
  drop constraint if exists kommo_lead_events_kommo_lead_id_event_date_key;

-- Índice parcial NO sirve para upsert onConflict de Supabase; hace falta UNIQUE real.
drop index if exists public.idx_kommo_lead_events_kommo_event_id;

alter table public.kommo_lead_events
  drop constraint if exists kommo_lead_events_kommo_event_id_key;

alter table public.kommo_lead_events
  add constraint kommo_lead_events_kommo_event_id_key unique (kommo_event_id);

create index if not exists idx_kommo_lead_events_lead_date
  on public.kommo_lead_events (kommo_lead_id, event_date);
