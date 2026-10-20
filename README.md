# Editor TBS

Editor de vídeo para redes sociales (Reels, TikTok, Shorts) con el estilo de **Traders Business School**.
Funciona en el navegador, en local: los vídeos nunca salen del ordenador.

## Cómo abrirlo
**En la web (sin instalar nada):** https://jfont-afk.github.io/editor-tbs/ — ábrelo en Google Chrome.

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
- **Exportación MP4** (H.264 + AAC) rápida con WebCodecs, nítida y con el audio a −14 LUFS; SRT y capturas PNG.
- Se adapta a pantallas grandes, portátiles/MacBook y móvil.
- **Proyecto en carpeta** (tipo Premiere/DaVinci): brutos, versiones automáticas, exportaciones y miniaturas.

## Estructura
- `index.html`, `css/app.css` — interfaz.
- `js/core` — estado, línea de tiempo, subtítulos, acciones, guardado.
- `js/render` — compositor, color, subtítulos, motions, animaciones.
- `js/ai` — transcripción (Whisper), segmentación y caras (MediaPipe), auto-encuadre.
- `js/export` — exportación MP4.
- `js/ui` — componentes (Preact + htm, sin compilación).
- `PROGRESO.md`, `REFERENCIAS.md` — historial de trabajo y referencias de diseño.
