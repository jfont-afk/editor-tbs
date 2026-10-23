Librerías copiadas aquí para no depender de cdn.jsdelivr.net (redes de empresa, bloqueadores…).
- preact-htm.js — htm@3.1.1/preact/standalone.module.js (MIT)
- mp4-muxer.mjs — mp4-muxer@5.2.2/build/mp4-muxer.mjs (MIT)
- fflate.js — fflate@0.8.2/esm/browser.js (MIT)
- mediabunny.mjs — mediabunny@1.61.6/dist/bundles/mediabunny.min.mjs (MPL-2.0)
- rnnoise.wasm — RNNoise v0.1.1 de Xiph (https://gitlab.xiph.org/xiph/rnnoise, BSD-3-Clause, © Mozilla, Jean-Marc Valin, Xiph.Org; licencia en rnnoise-src/COPYING), compilado a WebAssembly con clang (115 KB). Solo se usa el análisis: ganancias de 22 bandas y probabilidad de voz cada 10 ms, que js/audio/voice-worklet.js combina con su supresor espectral. Receta y archivos propios en rnnoise-src/ (no se publican).
