# Editor TBS

Editor de vídeo para redes sociales (Reels, TikTok, Shorts) con el estilo de **Traders Business School**.
Funciona en el navegador, en local: los vídeos nunca salen del ordenador.

## Cómo abrirlo
**En la web (con cuenta):** la versión de Cloudflare (`https://editor-tbs.<tu-subdominio>.workers.dev`) pide correo y contraseña. Los proyectos se guardan en tu cuenta; los vídeos se quedan en tu ordenador. Ábrelo en Google Chrome o Microsoft Edge.

**En local:**
1. Doble clic en **`Abrir Editor.bat`** (Windows). Arranca un servidor local en `http://localhost:5179` y abre Chrome.
2. Deja abierta la ventana negra mientras editas.

Requisitos: Windows + Google Chrome actualizado (usa WebCodecs, WebGPU/WebGL y File System Access). No hay que instalar nada más.

## Qué hace
- **Edición**: cortar, recortar inicio/final, reordenar, velocidad, espejo, deshacer; quitar silencios; detectar tomas repetidas y muletillas; editar el vídeo borrando palabras de la transcripción.
- **Encuadre automático de la cabeza** (zona superior central de TikTok), fijo o siguiendo el movimiento.
- **Texto**: subtítulos automáticos (Whisper en el navegador, con glosario de términos en inglés) con pack de 24 plantillas TBS; se mueven arrastrando con imán, se reescriben con doble clic (Intro = dos líneas) y se ajustan por bloque. Cajas de texto e imágenes libres.
- **Motions**: botones CTA, rótulos, títulos, datos, gráficos, listas, flechas, iconos oficiales TBS, logo… Todo puede ir detrás de la persona.
- **Efectos**: zooms (rápido, lento, dentro, fuera, dinámico con marco inicial y final y curvas), seguir la cara, nitidez, ruido y aberración cromática.
- **Color**: looks y ajustes con WebGL.
- **Miniaturas** por capas con plantillas TBS y zona segura de Instagram.
- **Audio**: Voz clara con un clic (retumbe, ruido de fondo, eses, presencia, volumen), fundidos y música que baja sola al hablar; se oye al reproducir y sale igual al exportar.
- **Ayuda**: tutorial de bienvenida la primera vez (botón **?** para repetirlo) y guía en PDF (`docs/guia-editor-tbs.pdf`).
- **Exportación MP4** (H.264 + AAC) rápida con WebCodecs, nítida y con el audio a −14 LUFS; SRT y capturas PNG.
- Se adapta a pantallas grandes, portátiles/MacBook y móvil.
- **Proyecto en carpeta** (tipo Premiere/DaVinci): brutos, versiones automáticas, exportaciones y miniaturas.

## Publicar en Cloudflare (una sola vez)
1. Cloudflare › **Workers & Pages** › **Create application** › **Import a repository** (GitHub) › `jfont-afk/editor-tbs`.
2. Nombre del proyecto: **editor-tbs** (tiene que coincidir con `wrangler.jsonc`). Rama: `main`. Build command: vacío. Deploy command: `npx wrangler deploy`.
3. Al terminar: el Worker › **Settings** › **Variables and Secrets** › añadir un **Secret** llamado `SETUP_KEY` con la clave de primera configuración.
4. Abre `https://editor-tbs.<tu-subdominio>.workers.dev/invite/<SETUP_KEY>` y crea la primera cuenta (administrador). Ese enlace deja de funcionar en cuanto existe una cuenta.
5. En **/admin** se crean los enlaces de invitación para el resto del equipo (un solo uso, caducan en 7 días) y los enlaces para cambiar la contraseña.

La base de datos (D1 `editor-tbs`) ya está creada y enlazada en `wrangler.jsonc`. Cada `git push` a `main` vuelve a publicar la web.
Para probar en local: `npm install`, `npm run db:local` y `npm run dev` (crea un archivo `.dev.vars` con `SETUP_KEY=...`).

## Estructura
- `index.html`, `css/app.css` — interfaz.
- `js/core` — estado, línea de tiempo, subtítulos, acciones, guardado.
- `js/render` — compositor, color, subtítulos, motions, animaciones.
- `js/ai` — transcripción (Whisper), segmentación y caras (MediaPipe), auto-encuadre.
- `js/export` — exportación MP4.
- `js/ui` — componentes (Preact + htm, sin compilación).
- `js/vendor` — librerías copiadas (para no depender de CDNs al arrancar).
- `worker/` — servidor de Cloudflare: cuentas, invitaciones, administración y proyectos en la nube (D1).
- `PROGRESO.md`, `REFERENCIAS.md` — historial de trabajo y referencias de diseño.
