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

## Ronda 6 — fallos y mejoras pedidas (hecho y verificado)
- [x] A. Subtítulos: se arrastran directamente (seleccionar y mover en el mismo gesto) con **imán** al centro y a los márgenes seguros según la alineación (guías rojas; Alt = sin imán). Barra flotante: mover "Todos / Este bloque", editar texto, tamaño −/+, detrás de la persona, imán. Posición libre (fuera de la zona segura si se coloca a mano; ya no salta por la cara). Esquina = tamaño del bloque.
- [x] A. **Doble clic** en el reproductor = escribir encima del subtítulo: cambiar/borrar palabras, añadir espacios y **Intro = segunda línea** (las palabras nuevas se reparten el tiempo; las borradas solo desaparecen del subtítulo). Bloques: arrastrar una palabra al bloque de al lado, "Bloque nuevo en el cursor", dividir/unir.
- [x] A. Quitar la sombra funciona de verdad (la legibilidad automática solo refuerza una sombra activada). Las plantillas propias guardan también la posición.
- [x] B. Motions y textos: arrastre directo con imán, barra flotante con **Detrás de la persona (sándwich)** en cualquier elemento, duplicar, capas y borrar. Doble clic en un texto libre = escribir encima (*palabra* = color de acento).
- [x] C. Pestaña **Texto** (Subtítulos · Cajas de texto · Imágenes) y pestaña **Efectos**: nitidez, ruido, aberración cromática, viñeta (todo el vídeo o un clip) y zooms (rápido, lento, hacia dentro, hacia fuera, golpe, respiración) con velocidad, **curvas de aceleración** y **seguir la cara**; **zoom dinámico tipo DaVinci** con marco Inicio (blanco) y Final (rojo) editables en el reproductor.
- [x] D. Miniaturas por **capas** (texto, etiqueta, iconos, logo): arrastrar con imán, doble clic para escribir, tipografía, peso, MAYÚS, cursiva, alineación, interletrado, sombra, fondo por línea, detrás de la persona. 7 plantillas (Webinar TBS del Design Kit, Texto detrás, Gancho, Editorial, Cajas, Dividida, Dato) con paletas TBS. Sin logo ni "Clases gratuitas"; @traderbusinessschool. **Zona segura de Instagram** (perfil 3:4 y feed 4:5) visible y respetada por las plantillas.
- [x] E. Exportación para redes: hasta 24 Mbps, decodificación a 1,5× la resolución final y escalado de máxima calidad (nitidez en zooms), AAC 48 kHz, **audio a −14 LUFS con limitador** (verificado: −22,8 → −14,6 LUFS, pico −1,4 dB).
- [x] F. Responsive: en pantallas grandes el panel no pasa de 720 px y el reproductor crece; portátiles 125 %, MacBook 13/14/16" y **móvil** (reproductor arriba, menú inferior, propiedades al seleccionar).
- [x] G. Glosario de inglés (stop loss, price action, trading, broker, setup, TradingView, S&P 500…) que corrige solo al transcribir + términos propios.
- [x] H. **Iconos oficiales del Brandkit** (86, de Figma) en motions y miniaturas; "Icono TBS" como en las portadas de webinar; **logotipo oficial** vectorial (motion Logo y barra superior).
- [x] I. Comparación con CapCut: añadidos **velocidad del clip** (con el tono de voz conservado al exportar) y **espejo**. Revisión de fallos (orden de las reglas responsive, solapes de la línea de tiempo, plantillas propias leídas en cada fotograma…).
- [x] J. Subido a GitHub.

## Revisión en Chrome (versión publicada y local)
- [x] Probado en el Chrome del usuario (1920×903 y portátil 1536×695 a 250 %): carga sin errores, arrastre de subtítulos y motions con imán, doble clic + Intro + "Hecho", efecto sándwich y deshacer, zoom que sigue la cara, miniaturas, reproducción con Espacio y exportación de 90 s en ~12–17 s (audio a −14 LUFS).
- [x] Arreglado: en la miniatura "Texto detrás" la frase de acento y el @usuario no se leían sobre la ropa oscura (ahora blancos con sombra) y el titular se coloca solo detrás de la cabeza según la captura.
- [x] Arreglado: la exportación ya no se frena si la pestaña pasa a segundo plano (espera al codificador con su propio evento en lugar de temporizadores).

## Ronda 7 — proyectos, clips, audio, persona duplicada y subtítulos
- [x] **Pantalla de proyectos** (al abrir el editor y con el botón "Proyectos"): carpeta de proyectos en el ordenador (se elige una vez), tarjetas con portada, duración y fecha, buscar, proyecto nuevo, abrir, duplicar, cambiar el nombre y eliminar. El último proyecto sin carpeta aparece para continuarlo (no se pierde al abrir otro).
- [x] **Compartir proyectos**: "Compartir (.zip)" empaqueta el proyecto con sus brutos y miniaturas; en otro ordenador "Importar proyecto" lo descomprime en su carpeta de proyectos y lo abre con los vídeos enlazados (probado: crear → compartir → importar).
- [x] **Clips**: selección con **marco rojo** (también en la línea de tiempo, con etiqueta "Seleccionado"); en el reproductor se **mueven, escalan y giran**; modo **Recortar** con bordes; **Quitar el fondo** con IA (relleno desenfocado, negro o color); espejo. Al arrastrar un clip en la línea de tiempo, el clip sigue al ratón.
- [x] **Gráfico de evolución** (Motions › Datos): hasta 24 puntos, los vacíos desaparecen, cada cifra se pasa a escala 1–100, pegado inteligente desde Excel/Sheets o texto ("1.148,08", "5,881.63", "1,2 mil", "3M"…), años automáticos, % de cambio, línea / área / barras. Ejemplo: S&P 500 2001–2024.
- [x] **Hook al inicio** (Efectos): golpe de impacto, entrada que se abre o empuje continuo en los primeros segundos, siguiendo la cara.
- [x] **Pista de audio** (micro externo, música, voz en off) con forma de onda, mover y recortar, volumen y **Sincronizar automáticamente** por forma de onda (probado: desfase exacto de +12,40 s) y "usar solo este audio".
- [x] **Persona duplicada** (Editar › Montaje avanzado): detecta qué toma es la izquierda y cuál la derecha, alinea las tomas para que os respondáis, une las mitades con la unión difuminada, iguala la luz y quita las pausas en las que no habla nadie. Ajustes de unión, difuminado, luz, desfase y sonido para todo el montaje. Funciona en la vista previa, la exportación y los subtítulos (se transcriben las dos tomas).
- [x] **Subtítulos**: pack nuevo de 14 plantillas pulidas (incluidas 4 de **Cine**, sencillas: Cine serif, Documental, Título de película e Íntimo), todas **palabra a palabra**, misma tipografía y tamaño. Tres niveles por palabra: normal → **destacada** (color/tipografía según la plantilla, mismo tamaño) → **muy destacada** = **título a todo el ancho** de la zona segura con animación (máscara que sube + subrayado, golpe, desenfoque o letra a letra). Cada bloque elige: subtítulo arriba + título debajo, título solo o dentro del texto. Las plantillas antiguas se convierten solas en la más parecida.

## Rendimiento y pulido (bucle continuo)
- [x] **Duplicar en la línea de tiempo**: Alt (Opción en Mac) o Cmd + arrastrar un clip, motion o audio suelta una copia donde la dejes y el original se queda (se ve una copia fantasma mientras arrastras; se deshace en un solo paso). **Ctrl/Cmd + D** duplica lo seleccionado justo detrás; **Ctrl/Cmd + C / V** copia y pega en el cursor (si el cursor cae en mitad de un clip, lo corta y mete la copia ahí). Botón de duplicar en la barra de la línea de tiempo para cualquier selección.
- [x] Reproducción más fluida: el panel del reproductor ya no se vuelve a pintar en cada fotograma, el estilo de cada bloque de subtítulos se calcula una vez, la búsqueda de caras para no taparlas va en segundo plano (usa el seguimiento ya calculado) y la comprobación de legibilidad no frena la reproducción.
- [x] Pantallas pequeñas (1280×720, portátiles): la línea de tiempo muestra todas las pistas (también Audio) sin desplazarse; los botones de velocidad del clip ya no se cortan.
- [x] Los atajos del editor no actúan sobre la pantalla de proyectos ni durante una tarea en marcha; Ctrl+S guarda en la carpeta de proyectos.

## Interfaz ajustable (petición del usuario)
- [x] Divisores arrastrables como en CapCut/Premiere: ancho del reproductor, ancho de las propiedades y alto de la línea de tiempo (el panel de herramientas ocupa el resto). Se guardan en el navegador; doble clic en un divisor = tamaño por defecto. Indicador con los píxeles mientras se arrastra.
- [x] Por defecto el reproductor ocupa solo lo que necesita el vídeo (vertical a toda altura) y todo el ancho sobrante va a herramientas y línea de tiempo.
- [x] Menú "Diseño" (barra superior): línea de tiempo a todo el ancho (también bajo el reproductor) y restablecer tamaños. El ancho del reproductor se recuerda por formato y por modo.

## Ronda 5 — interfaz neutra y limpia (petición del usuario)
- [x] Paleta de la interfaz: grises + **blanco** para lo activo/seleccionado + **rojo TBS** (#f22b11 / #dc270f) para Exportar, cursor de reproducción, indicadores y avisos. Sin azul ni magenta en la interfaz.
- [x] Los **subtítulos conservan el verde lima (Fluor #daff0a)**: en el vídeo y en la interfaz (bloques de la línea de tiempo y palabras destacadas). Regla fija del usuario: no se toca.
- [x] Hoja de estilos reescrita con un único sistema de botones (normal, principal blanco, CTA rojo, fantasma, peligro), radios y tamaños coherentes, foco visible, sin brillos de colores.
- [x] Arreglado: icono de "Elegir archivos" (se pintaba como recuadro blanco). Contenido de los paneles limitado a 720 px para que los botones no se estiren. Vistas previas de plantillas y motions sobre fondo neutro.
- [x] Gancho nativo: más arriba (17 %) y con contorno oscuro para leerse sobre fondos claros. Legibilidad automática de subtítulos reforzada (contorno suave + umbral más sensible).
- [x] Probado con el vídeo nuevo del usuario (_pruebas/usuario2.mp4, 4K HEVC 8 s): transcripción, tomas repetidas (detecta las 2 repeticiones), encuadre de cabeza, subtítulos, motions y exportación. 0 errores en consola.

## Ronda 8 — web con cuentas, plantillas de Pinterest y legibilidad
- [x] **Versión web en Cloudflare** (`worker/`): inicio de sesión con correo y contraseña, invitaciones de un solo uso (editor o administrador), panel `/admin`, cambio de contraseña (`/cuenta`) y **proyectos guardados por cuenta** (D1). Los vídeos no se suben. Primera cuenta con la clave `SETUP_KEY`.
- [x] Arranque robusto: librerías principales dentro del repositorio (`js/vendor`) y pantalla de error explicada si algo bloquea la carga.
- [x] **Subtítulos**: arreglado el hueco enorme encima de la palabra muy destacada (se apoya en la tinta real de las letras). Lo dicho antes del título va encima y lo de después, debajo.
- [x] **8 plantillas tipográficas nuevas** a partir de las referencias elegidas (S01, S04, S06, S14, S24, S28, S32, S48): Collage, Superpuesto, Tachado, Esquina, Selección, Revista, Cinemático y Serif grande. Impacto y Cine serif se rehacen con S27 y S08. Unificadas: Íntimo → Editorial y Documental → Minimal.
- [x] **10 portadas nuevas** (P02, P03, P05, P06, P13, P20, P30, P31, P47, P49): Etiqueta + serif, Una palabra, Título detrás, Corchetes, Revista serif, Bloque, Itálica cruzada, Portada de revista, Serif + itálica y Titular + laterales.
- [x] **Legibilidad primero** en las portadas: el titular "detrás de la persona" solo deja que la cabeza tape el borde de abajo (si no cabe, pasa delante); contorno del color del fondo sobre la persona recortada; textos pequeños más grandes y con sombra; sin líneas montadas.
- [x] **Solo tres tipografías**: Playfair Display, Raleway y Space Grotesk (fuera la manuscrita y la monoespaciada; lo antiguo se ve con estas).

## Ronda 9 — audio, tutorial de bienvenida y guía en PDF
- [x] **Corrección de audio** que se oye al reproducir (Web Audio en la vista previa) y sale igual en el MP4 (misma cadena en la exportación): **Voz clara** con un clic (quitar retumbe a 85 Hz 24 dB/oct, reducción de ruido de fondo adaptativa entre frases, suavizar eses, cuerpo, presencia, brillo, igualar volumen) y fundidos de entrada y salida. En Propiedades de cada clip y de la pista de audio, "Usar estos ajustes en todos los clips", **Comparar** con el original y **Voz clara en todo el vídeo** en Editar › Mejorar el audio.
- [x] **Bajar la música mientras se habla** (pista de audio): la música baja hasta −20 dB cuando suena la voz y vuelve a subir en las pausas.
- [x] Medido con voz con ruido: el ruido entre frases pasa de 23,5 dB a 36 dB por debajo de la voz; eses −4,7 dB; la música baja 14 dB al hablar. La vista previa tiene limitador final (no satura).
- [x] Al cortar un clip, el fundido de entrada se queda en el primer trozo y el de salida en el último.
- [x] **Tutorial de bienvenida** (recorrido de 16 pasos que ilumina cada zona): sale solo la primera vez que alguien entra (también una vez a las cuentas que ya existían) y no vuelve a salir; se guarda en la cuenta (tabla `user_prefs`, migración 0002) y, en local, en el navegador. Botón **?** en la barra superior: ver el tutorial y abrir la guía.
- [x] **Guía del editor en PDF** (`docs/guia-editor-tbs.pdf`, 17 páginas con capturas numeradas): primeros pasos, el editor de un vistazo, primer vídeo en 8 pasos, cada sección, reproductor y línea de tiempo, atajos, guardado, equipo y problemas frecuentes.
