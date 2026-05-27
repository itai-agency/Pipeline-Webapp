# Supabase Auth — configuración manual

Pasos en el [Supabase Dashboard](https://supabase.com/dashboard).

## 1. Providers

- **Authentication → Providers → Email:** activado.
- Desactivar proveedores que no uses.

## 2. Registro

- **Authentication → Sign up:** desactivar registro público.
- Altas solo por **Invite user** o **Add user** en Authentication → Users.

## 3. URLs (crítico para invitación y recovery)

| Campo | Valor recomendado |
|-------|-------------------|
| **Site URL** | `https://TU-APP.vercel.app` (o `https://TU-APP.vercel.app/auth/set-password`) |
| **Redirect URLs** | Incluir todas estas (una por línea o wildcard): |

```text
http://localhost:5173/**
http://localhost:3000/**
https://TU-APP.vercel.app/**
https://TU-APP.vercel.app/auth/set-password
```

Sin `https://TU-APP.vercel.app/auth/set-password` en la lista, el enlace de **“¿Olvidaste tu contraseña?”** fallará o redirigirá mal.

## 4. Flujos en la app

| Flujo | Qué hace el usuario | Ruta en la app |
|-------|---------------------|----------------|
| **Invitación** | Clic en el correo de Supabase | Llega con `#type=invite` → pantalla **Definir contraseña** (`/auth/set-password`) |
| **Recovery** | “¿Olvidaste tu contraseña?” en login | Correo → `/auth/set-password` → nueva contraseña |
| **Login normal** | Email + contraseña en `/login` | Dashboard |

La app **no** debe mandar al dashboard hasta guardar la contraseña en invitación/recovery.

## 5. Invitar usuarios

1. Authentication → Users → **Invite user**
2. El usuario recibe el correo de Supabase
3. Al abrir el enlace debe ver **“Activa tu cuenta”** / **“Nueva contraseña”**, no el dashboard vacío

Si el enlace abre el dashboard sin pedir contraseña: redeploy del front con la versión que incluye `/auth/set-password` y revisa Redirect URLs.

## 6. Plantillas de correo (opcional)

Authentication → Email Templates:

- **Invite user** / **Reset password**: el enlace usa la Site URL y tokens en el hash (`#access_token=...&type=invite` o `type=recovery`).
- No hace falta cambiar el HTML si Site URL y Redirect URLs están bien.

## 7. Claves para env

| Clave | Uso |
|-------|-----|
| Project URL | `VITE_SUPABASE_URL` (Vercel) y `SUPABASE_URL` (Render) |
| `anon` `public` | `VITE_SUPABASE_ANON_KEY` (Vercel) y `SUPABASE_ANON_KEY` (Render) |
| `service_role` | Solo Render — nunca en Vercel |

## 8. RLS

[`001_initial_schema.sql`](./migrations/001_initial_schema.sql) ya permite `SELECT` a `authenticated`. El API Express sigue usando service role para sync y agregación.
