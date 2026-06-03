-- Leads diarios desde Meta Insights (conversaciones en RESPALDO_DIARIO)
alter table public.meta_spend_events
  add column if not exists leads int not null default 0;
