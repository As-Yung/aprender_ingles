# Seguridad

## Reportar una vulnerabilidad
Abre un *Security advisory* privado en GitHub (*Security → Report a vulnerability*). No publiques detalles en issues.

## Modelo de amenazas y controles

| Amenaza | Control |
|---|---|
| Acceso no autorizado | Contraseña (bcrypt en Supabase) + **TOTP obligatorio (AAL2)**; política de 12+ caracteres con complejidad; *rate limiting* de Supabase; registro público desactivado. |
| Saltarse el login en el cliente | Los datos y acciones viven en el servidor: **RLS exige `aal2`** y la Edge Function valida JWT, AAL2 y rol en cada llamada. Los *guards* del cliente son solo navegación. |
| Escalada de privilegios | El rol está en `app_metadata` (solo escribible con service role). Ninguna API asigna `admin`; las acciones de admin no pueden aplicarse a la cuenta admin; el script de semilla rechaza un segundo admin. |
| Fuga de secretos | Service role key solo en el servidor (secrets de Supabase/GitHub). La contraseña del admin **no** está en el repositorio. `.env*` en `.gitignore`. |
| XSS | React escapa todo; el contenido es texto (sin `dangerouslySetInnerHTML`); **CSP estricta** (`script-src 'self'`, `object-src 'none'`, `base-uri 'self'`). Sesión en `sessionStorage` (se borra al cerrar la pestaña). |
| Clickjacking | Bloqueo de ejecución dentro de iframes (GitHub Pages no permite `frame-ancestors`). |
| Fuerza bruta de TOTP / reutilización | Supabase limita intentos; en modo local: bloqueo tras 5 fallos y rechazo de códigos ya usados. |
| Sesiones abandonadas | Cierre automático tras 30 min de inactividad; tokens de refresco rotativos. |
| Contraseñas filtradas a terceros | Contraseñas temporales aleatorias criptográficas, mostradas una sola vez; cambio obligatorio. |
| Fuga de la clave de IA del alumno (tutor IA) | La clave (Claude/ChatGPT/Gemini) vive **solo en memoria** (`src/core/ai/store.ts`): nunca en localStorage, sessionStorage, cookies, Supabase ni nuestros servidores. Se borra al cerrar sesión, por inactividad, al cambiar de usuario, al recargar o cerrar la pestaña: **hay que reconectar en cada inicio de sesión**. Las peticiones van directo del navegador al proveedor (CSP `connect-src` solo permite esos 3 hosts) con `credentials: 'omit'` y sin referrer. Los errores nunca muestran la clave. |
| Inyección de instrucciones vía contenido de pantalla | El texto de la pantalla se envía delimitado en `<screen_content>` (el delimitador se neutraliza dentro del texto) y el prompt de sistema indica tratarlo como datos. Las respuestas se muestran como texto plano (sin HTML). No se captura nada en admin, cambio de contraseña ni 2FA; no se envían valores de formularios; el alumno puede desactivar o previsualizar lo que se comparte. |
| Abuso de la Edge Function | CORS restringido a orígenes permitidos, límite de tamaño, validación estricta (UUID, patrón de usuario), auditoría en `admin_audit_log`. |

## Cadena de suministro (amenaza más activa de los últimos meses)

Durante 2025–2026 se han repetido campañas de **gusanos que comprometen paquetes npm populares** (familia
“Shai-Hulud” y variantes posteriores) robando tokens de npm/GitHub/nube mediante scripts `postinstall`, además de
vulnerabilidades críticas en frameworks de servidor como **React Server Components / Next.js (CVE-2025-55182)**.
Medidas aplicadas:

- **Sin React Server Components ni servidor Node propio**: SPA estática; esa clase de RCE no aplica.
- `ignore-scripts=true` en `.npmrc` y `npm ci --ignore-scripts` en CI y Codespaces: ningún paquete ejecuta código al instalarse.
- **Versiones exactas** + `package-lock.json`; solo se eligieron versiones con **≥ 2 semanas** publicadas.
- `npm audit signatures` (firmas y procedencia del registro) y `npm audit --audit-level=high` en cada CI.
- **Dependabot con `cooldown` de 7 días** y *Dependency Review* que bloquea PRs con vulnerabilidades altas.
- **GitHub Actions fijadas por SHA**, permisos mínimos (`contents: read` por defecto) y `persist-credentials: false`.
- **CodeQL** (`security-extended`) en cada PR y semanalmente.
- Dependencias mínimas en producción: React, React Router, supabase-js, otpauth y qrcode.

## Recomendaciones operativas
- Activa *Settings → Code security*: **Secret scanning**, **Push protection** y **Dependabot alerts**.
- Protege la rama `main` (PR obligatorio + CI en verde).
- Activa 2FA en tus cuentas de GitHub y Supabase.
- Cambia la contraseña del admin si alguna vez se compartió por chat o correo.
