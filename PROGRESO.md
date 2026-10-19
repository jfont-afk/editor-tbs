# Editor TBS — Progreso

App web local (sin instalación) para editar vídeo para redes sociales con el estilo de Traders Business School.
Se abre con **Abrir Editor.bat** → servidor local en `http://localhost:5179` → Chrome.

## Reglas fijas del usuario
- Colores y tipografía: **siempre el Design System de TBS** (Space Grotesk, Raleway, Playfair Display Italic, Sacramento, Geist Mono · Fluor #daff0a, Magenta #ff0a54, Azul #0066ff, Verde #11e07f, Neutral #121214).
- Referencias de estructura/animación: Guille Collado, Marco Dimio, Mirko Vigna, Verónica Gordo, Pinterest, Motion Array, CapCut.
- Enfocado a redes sociales (9:16 por defecto), estilo limpio, muy fácil de usar, márgenes de seguridad de cada red.
- Captura de fotograma + creador de miniaturas. Guardado local de brutos (tipo DaVinci/Premiere).

## Ronda 1 (hecho y verificado)
- [x] Investigación (DS TBS, tendencias, Guille, Marco, Pinterest, Motion Array) → REFERENCIAS.md
- [x] Base: servidor, UI, importar, reproductor, línea de tiempo (cortar, recortar, borrar, reordenar, deshacer)
- [x] Audio: forma de onda + silencios · Tomas repetidas y muletillas · Edición por texto
- [x] Color WebGL + looks + auto + comparar
- [x] Whisper en el navegador (corregido el fallo fp16 → fp32 + detección de salida degenerada)
- [x] Subtítulos con plantillas, destacados, bloques, legibilidad, zonas seguras, evitar cara
- [x] Texto detrás de la persona (MediaPipe) · Motions · Transiciones con lógica · Miniaturas
- [x] Exportar MP4 (verificado: H.264 1080×1920 + AAC, subtítulos y motions incrustados) + SRT + PNG

## Ronda 2 (en curso)
- [x] Referencias nuevas: Mirko Vigna (jerarquía tipográfica, palabra clave con desenfoque, caja de selección, gancho nativo, "esto es MADRID"), Verónica Gordo (escalonado minimal). @pedro.andreok: la cuenta no existe con ese nombre → pedir enlace.
- [x] CapCut 8.2 estudiado en el escritorio → interfaz adaptada: pestañas con icono arriba, reproductor central (tiempo · controles · herramientas), panel de detalles a la derecha, línea de tiempo con iconos, ojo/silencio por pista y botón Portada.
- [x] Editor de estilo de subtítulos (panel derecho, ámbito: todo el vídeo o un bloque): Texto (tipografía TBS, peso, cursiva, mayúsculas, tamaño, interletrado, interlineado, colores, destacados, alineación, maquetación, ancho, líneas) · Efectos (sombra, contorno, brillo, fondo bloque/línea/palabra, cristal, caja de selección) · Animación (17 entradas suaves, aparición, duración, retardo de letras, palabra activa, salida) · Posición (rejilla 3×3, X/Y, ajustes finos, arrastre libre en la vista previa con imán al centro).
- [x] Pack de 24 plantillas (Limpio, Creadores, Energía, Títulos, Con fondo) + "Guardar como mi plantilla" / "Mis plantillas". Interletrado estrecho por defecto.
- [x] Animaciones nuevas: desenfoque suave, máscara que sube, zoom desenfocado, letra a letra, expansión de interletrado, ola, salida con desenfoque. Sin parpadeo entre bloques consecutivos.
- [x] Auto-encuadre de cabeza (TikTok): detecta la cara a lo largo del clip y aplica zoom/desplazamiento sin bordes negros; modos "seguir" o "fijo", altura y zoom máximo regulables.
- [x] Guardado local tipo Premiere/DaVinci: carpeta de proyecto con proyecto.tbsedit (autoguardado), Brutos/, Versiones/ (automáticas cada 5 min + Ctrl+S), Exportaciones/, Miniaturas/. Reabrir el último proyecto al iniciar.
- [x] Cachés: transcripción y análisis de cara por archivo (no se repiten al reabrir).
- [x] Motions nuevas: Título destino, Gancho nativo, Caja de selección.
- [x] Previsualizaciones de las motions nuevas revisadas.

## Ronda 3 — interfaz limpia (petición del usuario)
- [x] Reproductor GRANDE a la derecha a toda altura (no lo corta la línea de tiempo); su ancho se adapta al formato (9:16, 4:5, 1:1, 16:9).
- [x] Menú vertical a la izquierda (una sección = una tarea) · herramientas · propiedades · línea de tiempo debajo de las herramientas.
- [x] Formato, comparar, captura, zonas seguras y red social en la cabecera del reproductor; barra superior solo con proyecto, deshacer y Exportar.
- [x] Secciones plegables (recuerdan si estaban abiertas), textos más cortos, sin líneas separadoras.
- [x] Subtítulos con sub-pestañas: Generar · Plantillas · Bloques. Peso tipográfico en desplegable.
- [x] Propiedades con estado vacío claro; atajos de teclado plegados.
- [x] Rejillas de plantillas y motions adaptables al ancho. Aviso "analizando…" en el clip mientras se generan miniaturas y onda.
- [x] Color de la interfaz: azul cielo TBS #11a3f2 (texto #074466) en lugar del Fluor. El Fluor se reserva para el contenido del vídeo (subtítulos, motions, miniaturas). Alternativa aprobada por el usuario: verde #11e07f.
- [ ] Pendiente del usuario: enlace correcto de @pedro.andreok · probar "Proyecto › Guardar en una carpeta…" (permiso del sistema).

## Ronda 4 — revisión de errores, legibilidad y exportación
- [x] Prueba automática de flujos (pestañas, cortar, deshacer/rehacer, recortes, silencios, tomas, muletillas, transiciones, 8 plantillas, edición de estilo, las 26 motions, looks de color, SRT, captura): 0 errores en consola.
- [x] Auditoría de contraste: textos secundarios a ≥5,7:1, botón Exportar a 4,6:1 (#e8094c + 700), texto sobre azul #03141f, tamaños mínimos 10–11 px.
- [x] Análisis de cara reescrito: reproduce el vídeo a ×6 y analiza al vuelo (antes saltaba fotograma a fotograma). PENDIENTE de probar.
- [x] Exportación corta verificada antes (3 s: H.264 1080×1920 + AAC, subtítulos y motion correctos).
- [x] Exportación rápida: decodificación secuencial con WebCodecs (mediabunny 1.61.6, `CanvasSink.canvasesAtTimestamps` por clip, reduce a 1920 px si la fuente es mayor) con respaldo al método anterior. Vídeo de 85 s: de ~6 min a 12,9 s (6,6× tiempo real). Vídeo 4K HEVC de 8 s: 1,6 s. Duración idéntica al proyecto, H.264 1080×1920 + AAC.
- [x] Análisis de cara a ×6 verificado: 3,5 s para el vídeo 4K de 8 s.

## Ronda 5 — interfaz neutra y limpia (petición del usuario)
- [x] Paleta de la interfaz: grises + **blanco** para lo activo/seleccionado + **rojo TBS** (#f22b11 / #dc270f) para Exportar, cursor de reproducción, indicadores y avisos. Sin azul ni magenta en la interfaz.
- [x] Los **subtítulos conservan el verde lima (Fluor #daff0a)**: en el vídeo y en la interfaz (bloques de la línea de tiempo y palabras destacadas). Regla fija del usuario: no se toca.
- [x] Hoja de estilos reescrita con un único sistema de botones (normal, principal blanco, CTA rojo, fantasma, peligro), radios y tamaños coherentes, foco visible, sin brillos de colores.
- [x] Arreglado: icono de "Elegir archivos" (se pintaba como recuadro blanco). Contenido de los paneles limitado a 720 px para que los botones no se estiren. Vistas previas de plantillas y motions sobre fondo neutro.
- [x] Gancho nativo: más arriba (17 %) y con contorno oscuro para leerse sobre fondos claros. Legibilidad automática de subtítulos reforzada (contorno suave + umbral más sensible).
- [x] Probado con el vídeo nuevo del usuario (_pruebas/usuario2.mp4, 4K HEVC 8 s): transcripción, tomas repetidas (detecta las 2 repeticiones), encuadre de cabeza, subtítulos, motions y exportación. 0 errores en consola.
