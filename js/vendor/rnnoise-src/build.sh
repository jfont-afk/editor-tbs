#!/bin/sh
# Compila js/vendor/rnnoise.wasm (con WebAssembly SIMD) y rnnoise-nosimd.wasm (RNNoise v0.1.1 de Xiph, solo análisis)
# con clang + wasm-ld, sin emscripten.
# 1) descargar https://gitlab.xiph.org/xiph/rnnoise/-/archive/v0.1.1/rnnoise-v0.1.1.tar.gz y descomprimir aquí (rnnoise-v0.1.1/)
# 2) añadir denoise_analyze.c al final de rnnoise-v0.1.1/src/denoise.c (rnn_fast.c sustituye a src/rnn.c)
set -e
R=rnnoise-v0.1.1/src
cp rnnoise-v0.1.1/include/rnnoise.h $R/
for v in simd nosimd; do
  F=""; OUT=../rnnoise-nosimd.wasm
  [ $v = simd ] && F="-msimd128" && OUT=../rnnoise.wasm
  clang --target=wasm32 -O3 $F -ffreestanding -nostdlib -nostdinc -isystem libc -isystem "$(clang -print-resource-dir)/include" -I$R \
    -mbulk-memory -fno-math-errno -Wno-null-dereference -Wl,--no-entry -Wl,--export-dynamic -Wl,--strip-all \
    -Wl,--initial-memory=327680 -Wl,-z,stack-size=65536 -Wl,--allow-undefined -o $OUT \
    tbs_api.c tbs_libc.c $R/denoise.c rnn_fast.c $R/rnn_data.c $R/pitch.c $R/celt_lpc.c $R/kiss_fft.c
done
