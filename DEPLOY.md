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
| Build | `npm install --legacy-peer-deps --include=dev && npm run build:api` |
| Start | `NODE_ENV=production node dist/index.js` |
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
| `VITE_API_BASE_URL` | `https://TU-API.onrender.com` (sin `/` final) — **obligatoria** |

Sin `VITE_API_BASE_URL`, el dashboard llama a `/api` en el mismo dominio de Vercel (no hay API ahí).

**No** definir en producción:

- `VITE_DEV_BYPASS_AUTH`
- `SUPABASE_SERVICE_ROLE_KEY` ni tokens Meta/Kommo

4. Deploy → abrir la URL y probar login + dashboard con datos live.

### Vercel no hace redeploy automático (Render sí)

Render y Vercel son **proyectos distintos**. Que Render redeploye no implica que Vercel reciba los webhooks de GitHub.

**Checklist (en orden):**

1. **Mismo repositorio**  
   Vercel → **Settings → Git** → debe decir `itai-agency/Pipeline-Webapp` (no otro repo de Manus).

2. **Rama de producción vs preview**  
   - Si **Production Branch** = `main`, los pushes a `Desarrollo` solo crean **Preview** (otra URL).  
   - Ve a **Deployments** y busca el deploy de la rama `Desarrollo`, o cambia **Production Branch** a `Desarrollo`.

3. **Autor del commit en el equipo Vercel**  
   Si el email de git no coincide con tu cuenta Vercel, el deploy se bloquea (`Git author must have access`).  
   - Vercel → **Settings → Git** → reconectar GitHub.  
   - O invita tu usuario al Team de Vercel.

4. **Deploy manual (siempre funciona)**  
   **Deployments** → último deploy → **⋯** → **Redeploy** → activar **Clear build cache**.

5. **Variables de build en el panel** (no solo en `vercel.json`):

| Variable | Entornos | Valor |
|----------|----------|--------|
| `VITE_API_BASE_URL` | Production + Preview | URL del API Render |
| `VITE_APP_BUILD_MARKER` | Production + Preview | `embudo-v2` (para verificar build nuevo) |

6. **Root Directory** en Vercel debe estar **vacío** (raíz del repo, donde está `vercel.json`).

7. Tras push a `Desarrollo`, en GitHub → **Settings → Integrations → Vercel** debe aparecer un check en el commit.

**Marcador en la app:** en el sidebar debe verse `Build embudo-v2`. Si no aparece, sigues en un deploy viejo o en la URL de `main`.

### Chrome pide “acceso al dispositivo” o red local

Era la instrumentación de debug que llamaba a `http://127.0.0.1:7880` desde HTTPS (Vercel). Ya está quitada en builds de producción. Tras redeploy no debería aparecer.

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

Si el build falla con **`vite: not found`** o **`esbuild: not found`**: Render omite `devDependencies` cuando `NODE_ENV=production`. Usa `--include=dev` en el install y `build:api` (solo backend; el front va en Vercel).

---

## Referencia

Integración de datos: [INTEGRATION.md](./INTEGRATION.md)
