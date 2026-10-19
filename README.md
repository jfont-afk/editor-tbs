# Editor TBS

Editor de vídeo para redes sociales (Reels, TikTok, Shorts) con el estilo de **Traders Business School**.
Funciona en el navegador, en local: los vídeos nunca salen del ordenador.

## Cómo abrirlo
1. Doble clic en **`Abrir Editor.bat`** (Windows). Arranca un servidor local en `http://localhost:5179` y abre Chrome.
2. Deja abierta la ventana negra mientras editas.

Requisitos: Windows + Google Chrome actualizado (usa WebCodecs, WebGPU/WebGL y File System Access). No hay que instalar nada más.

## Qué hace
- **Edición**: cortar, recortar inicio/final, reordenar, deshacer; quitar silencios; detectar tomas repetidas y muletillas; editar el vídeo borrando palabras de la transcripción.
- **Encuadre automático de la cabeza** (zona superior central de TikTok), fijo o siguiendo el movimiento.
- **Subtítulos automáticos** (Whisper en el navegador) con pack de 24 plantillas TBS, palabras destacadas, estilo global o por bloque (texto, efectos, animación, posición), texto detrás de la persona, legibilidad automática y zonas seguras.
- **Motions**: botones CTA, rótulos, títulos, datos, gráficos, listas, flechas, zoom de cámara, logo, etc.
- **Color**: looks y ajustes con WebGL.
- **Miniaturas** con recorte de persona y combinaciones de color de las portadas TBS.
- **Exportación MP4** (H.264 + AAC) rápida con WebCodecs, SRT y capturas PNG.
- **Proyecto en carpeta** (tipo Premiere/DaVinci): brutos, versiones automáticas, exportaciones y miniaturas.

## Estructura
- `index.html`, `css/app.css` — interfaz.
- `js/core` — estado, línea de tiempo, subtítulos, acciones, guardado.
- `js/render` — compositor, color, subtítulos, motions, animaciones.
- `js/ai` — transcripción (Whisper), segmentación y caras (MediaPipe), auto-encuadre.
- `js/export` — exportación MP4.
- `js/ui` — componentes (Preact + htm, sin compilación).
- `PROGRESO.md`, `REFERENCIAS.md` — historial de trabajo y referencias de diseño.
