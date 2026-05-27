# Integración Meta + Kommo (tiempo real)

## Requisitos

1. Proyecto Supabase con migración aplicada: [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
2. Variables en `.env` (ver [`.env.example`](.env.example))
3. Usuarios del dashboard creados en Supabase Auth (invitación; registro público desactivado)

## Autenticación (Supabase)

| Capa | Comportamiento |
|------|----------------|
| **Login** | Email + contraseña vía `signInWithPassword` en el SPA |
| **API lectura** | `GET /api/dashboard/snapshot` y `GET /api/realtime/dashboard` requieren `Authorization: Bearer <access_token>` en production |
| **API sync** | `POST /api/meta/sync` y `POST /api/kommo/sync` usan `SYNC_API_SECRET` (no el JWT de usuario) |
| **Datos** | El API sigue escribiendo con **service role**; el JWT solo autoriza acceso al snapshot/SSE |

Variables:

| Variable | Dónde |
|----------|--------|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Vercel + `.env.local` |
| `SUPABASE_ANON_KEY` | Render (validación JWT) |
| `AUTH_REQUIRED` | Render; default `true` en `NODE_ENV=production` |
| `VITE_DEV_BYPASS_AUTH=true` | Solo desarrollo local (sin JWT en API si `AUTH_REQUIRED` es false) |

Configuración en Supabase Dashboard:

1. Authentication → Providers: Email.
2. Desactivar signups públicos.
3. URL configuration (Site URL + Redirect URLs para Vercel y localhost).
4. Invitar usuarios en Authentication → Users.
5. Redirect URLs deben incluir `https://TU-APP.vercel.app/auth/set-password` (ver [`supabase/AUTH_SETUP.md`](supabase/AUTH_SETUP.md)).

### Invitación y recuperación de contraseña

| Acción | UI |
|--------|-----|
| Admin invita usuario | Correo Supabase → `/auth/set-password` (definir contraseña) |
| Usuario olvida contraseña | Login → “¿Olvidaste tu contraseña?” → correo → `/auth/set-password` |

Hasta guardar la contraseña, la app redirige a `/auth/set-password` y **no** muestra el dashboard.

## Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/dashboard/snapshot` | Snapshot completo (JWT en production) |
| POST | `/api/dashboard/refresh` | Reconstruye métricas y emite SSE (JWT en production) |
| GET | `/api/realtime/dashboard` | Stream SSE con header `Authorization` (JWT en production) |
| POST | `/api/meta/sync` | Sincroniza gasto Meta (requiere `SYNC_API_SECRET` si está definido) |
| POST | `/api/kommo/sync` | Sincroniza leads Kommo por `updated_at` (eventos / backfill) |
| POST | `/api/kommo/snapshot` | **Censo Kommo (todos los clientes del mapa)** — embudo alineado al control |

Body de sync:

```json
{ "since": "2026-05-01", "until": "2026-05-20" }
```

**Embudo dashboard (recomendado, todos los clientes):**

```bash
# Local
npm run sync:kommo-snapshot

# Producción (curl)
curl --ssl-no-revoke -X POST "https://TU-API/api/kommo/snapshot" \
  -H "Authorization: Bearer TU_SYNC_API_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"snapshotDate\":\"2026-05-26\"}"
```

El scheduler en producción hace **sync por `updated_at` + métricas diarias desde `kommo_lead_events`** (no borra el mes).

**Backfill diario (lo correcto para reportes por día):**

```bash
npm run backfill:kommo-year
npm run rebuild:kommo-daily   # o POST /api/kommo/rebuild-daily con since/until
```

Cada lead se guarda con `event_date` = fecha de **creación** (`created_at`). `dashboard_metrics_daily` tiene **una fila por día y cliente** con la suma de ese día.

**No ejecutar** `sync:kommo-snapshot` tras un backfill: antes borraba todo mayo y dejaba un solo día con números del HTML. El snapshot solo sirve como auditoría de censo (`KOMMO_SNAPSHOT_REPLACE_MONTH=true` para el comportamiento antiguo).

**Referencia HTML:** solo si `KOMMO_USE_CONTROL_REFERENCE=true` en el snapshot de auditoría.

**Backfill por `updated_at` (API):** `POST /api/kommo/sync` con rango amplio. Solo trae leads **actualizados** en ese intervalo (no sustituye el censo del snapshot).

**Backfill por `created_at` (local, recomendado para censo del año):**

```bash
npm run backfill:kommo-year
# otro año:
KOMMO_BACKFILL_YEAR=2025 npm run backfill:kommo-year
# una sola petición anual (más rápido, puede ser pesado):
npm run backfill:kommo-year -- --whole-year
```

Usa `.env.local` (Kommo + Supabase service role). Filtra leads **creados** en cada mes del año, guarda `event_date` = fecha de creación y reconstruye `dashboard_metrics_daily` para todo el año.

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
