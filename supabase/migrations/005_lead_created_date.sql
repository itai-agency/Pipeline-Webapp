alter table public.kommo_lead_events
  add column if not exists lead_created_date date;

create index if not exists idx_kommo_lead_events_created_date
  on public.kommo_lead_events (lead_created_date);

create index if not exists idx_kommo_lead_events_created_event_client
  on public.kommo_lead_events (lead_created_date, event_date, client);
