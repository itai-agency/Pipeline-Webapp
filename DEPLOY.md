# Despliegue — Opción A (Vercel + API)

Arquitectura de producción:

- **Vercel:** frontend estático (Vite → `dist/public`)
- **Render / Railway / Fly:** API Express (`dist/index.js`) + sync scheduler + SSE
- **Supabase:** datos (Meta, Kommo, métricas)

## 1. API (Render recomendado)

### Crear servicio

1. [Render](https://render.com) → **New Web Service** → conectar este repo.
2. Usar `render.yaml` (Blueprint) o configurar manualmente:

| Campo | Valor |
|-------|--------|
| Build | `npm install --legacy-peer-deps && npm run build` |
| Start | `node dist/index.js` |
| Health check | `/api/health` |

### Variables de entorno (API)

Copiar desde `.env.local` (nunca commitear):

| Variable | Descripción |
|----------|-------------|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo backend |
| `META_ACCESS_TOKEN` | Token Meta Ads |
| `META_API_VERSION` | `v21.0` |
| `KOMMO_SUBDOMAIN` | Subdominio Kommo |
| `KOMMO_ACCESS_TOKEN` | JWT Kommo |
| `KOMMO_CLIENT_MAP` | `{}` o JSON de `npm run kommo:discover` |
| `KOMMO_STATUS_MAP` | `{}` o override |
| `SYNC_API_SECRET` | Secreto para POST `/api/meta/sync` y `/api/kommo/sync` |
| `CORS_ALLOWED_ORIGINS` | URL del front en Vercel, ej. `https://pipeline-xxx.vercel.app` |
| `CORS_ALLOW_VERCEL_PREVIEWS` | `true` para permitir previews `*.vercel.app` |

### Verificar API

```text
GET https://TU-API.onrender.com/api/health
→ { "ok": true, ... }
```

El scheduler sincroniza Meta/Kommo cada **5 minutos** en producción.

---

## 2. Frontend (Vercel)

1. [Vercel](https://vercel.com) → importar el mismo repo.
2. El archivo `vercel.json` ya define:
   - **Build:** `npm run build:web`
   - **Output:** `dist/public`
3. Variables en Vercel (**Settings → Environment Variables**):

| Variable | Valor |
|----------|--------|
| `VITE_API_BASE_URL` | `https://TU-API.onrender.com` (sin `/` final) |

**No** definir en producción:

- `VITE_DEV_BYPASS_AUTH`
- `SUPABASE_SERVICE_ROLE_KEY` ni tokens Meta/Kommo

4. Deploy → abrir la URL y probar login + dashboard con datos live.

---

## 3. Desarrollo local contra API remoto

En `.env.local`:

```env
VITE_API_BASE_URL=https://TU-API.onrender.com
```

```bash
npm run dev
```

El front local usa el API desplegado (útil para probar CORS antes de Vercel).

---

## 4. CORS

El navegador en `https://*.vercel.app` llama al API en otro dominio. El backend usa `server/middleware/cors.ts`:

- Lista explícita en `CORS_ALLOWED_ORIGINS`
- Opcional: `CORS_ALLOW_VERCEL_PREVIEWS=true` para todas las previews de Vercel

Si ves errores de CORS en la consola, añade la URL exacta del front a `CORS_ALLOWED_ORIGINS` en Render y redeploy del API.

---

## 5. Checklist go-live

- [ ] Supabase: migración `supabase/migrations/001_initial_schema.sql` aplicada
- [ ] API: `/api/health` OK
- [ ] API: env Meta + Kommo + Supabase configuradas
- [ ] Sync inicial: `npm run sync:meta` y `npm run sync:kommo` (local) o esperar scheduler
- [ ] Vercel: `VITE_API_BASE_URL` apuntando al API
- [ ] Vercel: sin `VITE_DEV_BYPASS_AUTH`
- [ ] Dashboard muestra gasto Meta y embudo Kommo (no solo datos estáticos)

---

## Referencia

Integración de datos: [INTEGRATION.md](./INTEGRATION.md)
