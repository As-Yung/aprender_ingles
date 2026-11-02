# 🇬🇧 Aprender Inglés · A1 → C2

Aplicación web para aprender inglés de forma **visual y didáctica**, del nivel **A1 al C2** del Marco Común Europeo (MCER).

🎯 **Objetivo:** hablar inglés con fluidez y de forma **casual**, sobre todo en temas de **ingeniería de sistemas e IoT** (dailies, incidentes, arquitectura, jerga de equipo). Cada nivel incluye un tema 🛠️ de tecnología (`src/content/levels/tech/`).

🔊 **Voz:** se elige automáticamente la voz más natural (neuronal) del dispositivo; en los diálogos cada personaje tiene su voz. Se puede cambiar en la página **Voz** de la app.
Se publica como página estática en **GitHub Pages** y se puede probar al instante en **GitHub Codespaces**.

## ✨ Qué incluye cada tema

| Sección | Qué hace |
|---|---|
| 🖼️ **Tarjetas visuales** | Infografías por categoría con emoji, pronunciación (IPA), traducción y audio; tarjeta de fórmula gramatical y tarjeta de repaso. Imprimibles / PDF. |
| 📒 **Apuntes y resumen** | Apuntes estilo cuaderno: fórmulas, tablas, ejemplos con audio, trucos 💡, errores comunes ⚠️ y nota adhesiva con el resumen. |
| 🧠 **Vocabulario** | *Aprender* (tarjetas que giran), *Repasar* con repetición espaciada (Leitner 5 cajas) y *Practicar* (opción múltiple + escritura). |
| 💬 **Conversación** | Diálogo con audio y traducción, **juego de roles** con reconocimiento de voz y puntuación de pronunciación, frases útiles. |
| 📖 **Lectura asistida** | Toca cualquier palabra para ver su significado; expresiones resaltadas; audio normal y lento; traducción por párrafo; preguntas de comprensión. |
| 🎧 **Dictado** | Escucha y escribe; evaluación tolerante por similitud. |
| ✅ **Autoevaluación** | Cuestionario con explicación de cada respuesta. |

Además: progreso por tema, racha diaria 🔥, palabras pendientes de repaso, modo oscuro y diseño adaptable a móvil.

**Contenido actual:** 12 temas (2 por nivel) — ampliable añadiendo objetos de datos, sin tocar la interfaz.

## 🔐 Seguridad de acceso

- Usuario + contraseña + **doble autenticación TOTP obligatoria** (Google/Microsoft Authenticator, Authy…).
- **Un único administrador** (`admin`) que puede: crear usuarios, asignar contraseñas temporales, solicitar cambio de contraseña, reiniciar el 2FA y desactivar cuentas.
- La contraseña del administrador **no está en el código**: se carga desde un *secret* de GitHub/Codespaces.

Ver [SECURITY.md](SECURITY.md) y [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## 🚀 Probar en Codespaces (2 minutos)

1. (Recomendado) En GitHub → *Settings → Codespaces → Secrets* crea `ADMIN_INITIAL_PASSWORD` y dale acceso a este repositorio.
2. Botón **Code → Codespaces → Create codespace on main**.
3. Se instala todo y arranca `npm run dev`; se abre el navegador en el puerto 5173.
4. Entra con `admin` y tu contraseña; escanea el QR con tu app autenticadora.

> En Codespaces la app usa el **modo local** (usuarios guardados en tu navegador) para probar sin servidor. Si no creaste el secreto, edita `.env.local` y rellena `VITE_LOCAL_ADMIN_PASSWORD`.

## 🌐 Publicación en GitHub Pages

Cada *merge* a `main` despliega automáticamente. Para que el login funcione en producción hace falta conectar el backend gratuito de **Supabase** (autenticación, 2FA y base de datos): sigue [docs/CONFIGURACION.md](docs/CONFIGURACION.md).

## 🧑‍💻 Desarrollo

```bash
npm ci --ignore-scripts      # instalar (sin scripts de instalación, por seguridad)
npm run setup:local          # crea .env.local (modo local)
npm run dev                  # http://localhost:5173
npm test                     # pruebas
npm run build                # build de producción
```

Requiere Node 22+ y npm 11+.

### Añadir contenido o funcionalidades
- **Nuevo tema:** añade un objeto `Topic` en `src/content/levels/<nivel>.ts`. Las pruebas validan su estructura.
- **Nueva sección de aprendizaje:** crea `src/modules/<id>/<Nombre>Section.tsx` y regístrala en `src/modules/registry.ts`.
