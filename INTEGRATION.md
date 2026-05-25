# Integración Meta + Kommo (tiempo real)

## Requisitos

1. Proyecto Supabase con migración aplicada: [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
2. Variables en `.env` (ver [`.env.example`](.env.example))

## Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/dashboard/snapshot` | Snapshot completo para el dashboard |
| POST | `/api/dashboard/refresh` | Reconstruye métricas y emite SSE |
| GET | `/api/realtime/dashboard` | Stream SSE (connected, meta_updated, kommo_updated, heartbeat) |
| POST | `/api/meta/sync` | Sincroniza gasto Meta (requiere `SYNC_API_SECRET` si está definido) |
| POST | `/api/kommo/sync` | Sincroniza leads Kommo |

Body de sync:

```json
{ "since": "2026-05-01", "until": "2026-05-20" }
```

## Desarrollo

```bash
pnpm install   # o npm install
pnpm dev       # Vite + API middleware en /api
```

**Windows / red corporativa (SSL):** si ves `UNABLE_TO_VERIFY_LEAF_SIGNATURE` al instalar paquetes o al sincronizar Meta:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
npm install --legacy-peer-deps
```

Los scripts `npm run sync:meta`, `npm run test:integration` y `npm run dev` ya incluyen `--use-system-ca` automáticamente.

Producción (Opción A — recomendado):

- **API:** Render/Railway → `npm run build` + `node dist/index.js` (ver [DEPLOY.md](./DEPLOY.md))
- **Frontend:** Vercel → `npm run build:web`, `VITE_API_BASE_URL` apuntando al API

El scheduler de sync corre cada 5 minutos en `NODE_ENV=production` cuando Meta/Kommo están configurados.

Monolito local / alternativo:

```bash
pnpm build
pnpm start
```

## Kommo (fase 2)

1. Variables: `KOMMO_SUBDOMAIN`, `KOMMO_ACCESS_TOKEN` (JWT de integración).
2. Descubrir pipelines y etapas:

```bash
npm run kommo:discover
```

Copia `KOMMO_CLIENT_MAP` y, si hace falta afinar etapas, `KOMMO_STATUS_MAP` a `.env.local`. Si los mapas están vacíos (`{}`), el backend usa los defaults en `server/config/env.ts` (6 clientes Inmoleads) e infiere etapas por nombre de status (`kommoStageMap.ts`).

3. Sincronizar el mes actual:

```bash
npm run sync:kommo
```

Equivale a `POST /api/kommo/sync` con rango del mes en curso. Tras el sync, `refreshAndBroadcast` reconstruye `dashboard_metrics_daily` y emite SSE.

4. Scheduler: en producción, `syncScheduler` llama Kommo cada 5 min si está configurado.

### Mapeos

| Variable | Descripción |
|----------|-------------|
| `KOMMO_CLIENT_MAP` | `pipeline_id` → nombre de cliente del dashboard |
| `KOMMO_STATUS_MAP` | `status_id` → conteos de embudo (`conversaciones`, `mql`, `sql`, `citas`, `firmas`) |

## Fallback

Sin Supabase configurado, el backend y el hook del frontend usan los datos estáticos existentes en `client/src/lib/*`.
