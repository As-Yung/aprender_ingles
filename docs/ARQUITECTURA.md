# Arquitectura

## Visión general

```
┌────────────────────────── Navegador (GitHub Pages, sitio estático) ──────────────────────────┐
│  React 19 + TypeScript + Vite   ·   HashRouter   ·   CSP estricta                              │
│                                                                                                │
│  pages/ ──► components/Guards (sesión + AAL2 + contraseña no temporal)                         │
│     │                                                                                          │
│     ├── modules/registry ──► tarjetas · apuntes · vocabulario · conversación · lectura · …     │
│     │        (cada sección = componente lazy que recibe SectionProps)                          │
│     ├── content/ (datos tipados por nivel, cargados bajo demanda)                              │
│     └── core/                                                                                  │
│          ├── auth/  AuthService (interfaz) ─┬─ SupabaseAuthService  (producción)               │
│          │                                  └─ LocalAuthService     (solo desarrollo)          │
│          ├── progress/ ProgressRepository ──┬─ Supabase (tabla con RLS)                        │
│          │                                  └─ localStorage                                    │
│          ├── srs/ (Leitner)   ├── speech/ (Web Speech API)   └── security/ (WebCrypto)         │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
                    │ HTTPS (anon key pública + JWT del usuario)
┌───────────────────▼──────────────────── Supabase (plan gratuito) ──────────────────────────────┐
│  Auth: contraseñas (bcrypt), TOTP MFA (AAL2), rate limiting, registro público desactivado      │
│  Postgres: user_progress + admin_audit_log con RLS (exige aal2)                                │
│  Edge Function admin-users: service role SOLO en servidor; verifica JWT + AAL2 + rol admin     │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Principios

| Principio | Cómo se aplica |
|---|---|
| **Modular** | Secciones registradas en `modules/registry.ts`; proveedores intercambiables detrás de interfaces (`AuthService`, `ProgressRepository`). |
| **Escalable** | Contenido como datos tipados y *code splitting* por nivel y por sección; añadir temas no toca la UI. |
| **Seguro** | Autorización en el servidor (RLS + Edge Function), nunca solo en el cliente. Ver `SECURITY.md`. |
| **Robusto** | TypeScript estricto, pruebas de contenido y de núcleo, CI en cada PR, almacenamiento con *fallback*. |

## ¿Por qué Supabase?

GitHub Pages solo sirve archivos estáticos: **no puede guardar secretos ni verificar contraseñas de forma segura**.
Cualquier “login” hecho solo con JavaScript en el navegador se puede saltar. Por eso la autenticación real,
el 2FA y la administración de usuarios viven en Supabase (gratuito, con TOTP nativo y políticas RLS).

## Flujo de inicio de sesión

1. Usuario + contraseña → Supabase devuelve sesión **AAL1**.
2. Si no tiene 2FA → alta obligatoria con QR. Si lo tiene → código TOTP. Resultado: sesión **AAL2**.
3. Si `app_metadata.must_change_password` → pantalla de cambio obligatorio (Edge Function).
4. Acceso a la app. Las tablas y la función rechazan cualquier petición que no sea AAL2.

## Estructura de carpetas

```
src/
  config/        configuración pública (variables VITE_*)
  core/          auth, progress, srs, speech, security (sin UI)
  content/       tipos + niveles A1–C2 (datos)
  modules/       secciones de aprendizaje (plug-in)
  components/    UI compartida
  pages/         pantallas enrutadas
supabase/
  migrations/    SQL (tablas + RLS)
  functions/     Edge Function admin-users
scripts/         semilla del admin, .env local
.github/         CI, CodeQL, despliegue Pages, Dependabot
.devcontainer/   Codespaces
```
