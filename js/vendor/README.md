Librerías copiadas aquí para no depender de cdn.jsdelivr.net (redes de empresa, bloqueadores…).
- preact-htm.js — htm@3.1.1/preact/standalone.module.js (MIT)
- mp4-muxer.mjs — mp4-muxer@5.2.2/build/mp4-muxer.mjs (MIT)
- fflate.js — fflate@0.8.2/esm/browser.js (MIT)
- mediabunny.mjs — mediabunny@1.61.6/dist/bundles/mediabunny.min.mjs (MPL-2.0)
- rnnoise.wasm / rnnoise-nosimd.wasm — RNNoise v0.1.1 de Xiph (https://gitlab.xiph.org/xiph/rnnoise, BSD-3-Clause, © Mozilla, Jean-Marc Valin, Xiph.Org; licencia en rnnoise-src/COPYING), compilado a WebAssembly con clang (≈120 KB; con SIMD y, para navegadores sin SIMD, sin él). Solo se usa el análisis: ganancias de 22 bandas y probabilidad de voz cada 10 ms, que js/audio/voice-worklet.js combina con su supresor espectral; cada trama se puede calcular en tres llamadas (tbs_p1/p2/p3) para repartir el trabajo entre cuantos de audio. Receta y archivos propios (rnn_fast.c: mismos cálculos con los bucles reordenados para SIMD y los pesos pasados a float una vez) en rnnoise-src/ (no se publican).
