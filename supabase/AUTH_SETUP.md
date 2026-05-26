# Supabase Auth — configuración manual (Fase 0)

Pasos en el [Supabase Dashboard](https://supabase.com/dashboard) antes del primer deploy con login real.

## 1. Providers

- **Authentication → Providers → Email:** activado.
- Desactivar proveedores que no uses (Google, etc.).

## 2. Registro

- **Authentication → Sign up:** desactivar registro público.
- Solo usuarios invitados o creados por admin.

## 3. URLs

- **Site URL:** URL de producción del dashboard (ej. `https://tu-app.vercel.app`).
- **Redirect URLs:**
  - `http://localhost:5173/**`
  - `http://localhost:3000/**`
  - `https://tu-app.vercel.app/**`
  - `https://*.vercel.app/**` (previews, si aplica)

## 4. Usuarios

- **Authentication → Users → Invite user** (o Add user).
- Asignar email y contraseña temporal; el usuario puede cambiarla después.

## 5. Claves para env

En **Settings → API**:

| Clave | Uso |
|-------|-----|
| Project URL | `VITE_SUPABASE_URL` (Vercel) y `SUPABASE_URL` (Render) |
| `anon` `public` | `VITE_SUPABASE_ANON_KEY` (Vercel) y `SUPABASE_ANON_KEY` (Render) |
| `service_role` | Solo `SUPABASE_SERVICE_ROLE_KEY` en Render — nunca en Vercel |

## 6. RLS

La migración [`001_initial_schema.sql`](./migrations/001_initial_schema.sql) ya permite `SELECT` a `authenticated` en tablas de métricas. El API sigue usando service role para agregación; el JWT del usuario autoriza el acceso al API Express.
