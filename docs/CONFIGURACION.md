# Configuración de producción (GitHub Pages + Supabase)

Tiempo estimado: **15 minutos**. Todo es gratuito.

## 1. Activar GitHub Pages
*Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
La URL será `https://<tu-usuario>.github.io/aprender_ingles/`.

## 2. Crear el proyecto en Supabase
1. Entra en <https://supabase.com> → **New project** (plan Free). Guarda la **contraseña de la base de datos**.
2. *Authentication → Sign In / Providers → Email*: **desactiva “Allow new users to sign up”**
   (solo el administrador crea cuentas). Desactiva también “Confirm email”.
3. *Authentication → Multi-Factor*: comprueba que **TOTP** está habilitado.
4. *Authentication → Policies* (o *Passwords*): longitud mínima **12** y requisitos *lowercase, uppercase, digits and symbols*.
5. *Authentication → URL Configuration*: **Site URL** = `https://<tu-usuario>.github.io/aprender_ingles/`.

## 3. Copiar claves
| Dónde | Qué |
|---|---|
| *Project Settings → General* | **Project ID / Reference** |
| *Project Settings → API Keys* | **anon / publishable key** (pública) y **service_role / secret key** (¡secreta!) |
| *Account (avatar) → Access Tokens* | genera un **Access Token** personal |

## 4. Guardar en GitHub
*Repositorio → Settings → Secrets and variables → Actions*

**Secrets** (privados):
| Nombre | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Access token personal |
| `SUPABASE_PROJECT_REF` | ID/Reference del proyecto |
| `SUPABASE_DB_PASSWORD` | Contraseña de la base de datos |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
| `ADMIN_INITIAL_PASSWORD` | Contraseña del usuario `admin` |

**Variables** (públicas, pestaña *Variables*):
| Nombre | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key |

> La *anon key* es pública por diseño: la seguridad la imponen las políticas RLS y la Edge Function.
> **Nunca** pongas la service role key en una variable `VITE_*`.

## 5. Desplegar el backend
*Actions → “Configurar backend Supabase” → Run workflow.*
Aplica las migraciones (tablas + RLS), despliega la Edge Function `admin-users` y crea el usuario `admin`.

## 6. Volver a publicar la web
*Actions → “Desplegar en GitHub Pages” → Run workflow* (o haz cualquier merge a `main`).

## 7. Primer acceso
1. Abre la URL de Pages → usuario `admin` + tu contraseña.
2. Escanea el QR con Google Authenticator / Microsoft Authenticator / Authy y escribe el código.
3. Ve a **Administración** para crear usuarios. Cada uno recibe una contraseña temporal (se muestra una sola vez),
   deberá configurar su 2FA y cambiar la contraseña en su primer acceso.

## Recuperación del administrador
Si pierdes el teléfono o la contraseña: actualiza el secret `ADMIN_INITIAL_PASSWORD` y ejecuta
*“Configurar backend Supabase”* marcando **admin_recovery**. Se restablece la contraseña (con cambio obligatorio)
y se borra el 2FA para volver a configurarlo.

## Codespaces (modo local de pruebas)
*GitHub → Settings → Codespaces → Secrets → New secret* `ADMIN_INITIAL_PASSWORD` (acceso a este repo).
Al crear el Codespace se genera `.env.local` automáticamente y arranca `npm run dev`.
