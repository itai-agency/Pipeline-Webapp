-- Actividad diaria (timeline) vs censo pipeline (snapshot) pueden coexistir el mismo día.
alter table public.dashboard_metrics_daily
  add column if not exists metrics_source text not null default 'timeline';

alter table public.dashboard_metrics_daily
  drop constraint if exists dashboard_metrics_daily_metric_date_client_key;

alter table public.dashboard_metrics_daily
  add constraint dashboard_metrics_daily_date_client_source_key
  unique (metric_date, client, metrics_source);

create index if not exists idx_dashboard_metrics_source
  on public.dashboard_metrics_daily (metrics_source, metric_date);
