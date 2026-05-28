-- Ejecutar en Supabase SQL Editor si el backfill falló con:
-- "no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- (Corrige migración 002 que usaba índice parcial incompatible con upsert.)

drop index if exists public.idx_kommo_lead_events_kommo_event_id;

alter table public.kommo_lead_events
  drop constraint if exists kommo_lead_events_kommo_event_id_key;

alter table public.kommo_lead_events
  add constraint kommo_lead_events_kommo_event_id_key unique (kommo_event_id);
