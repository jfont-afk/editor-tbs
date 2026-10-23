// libc mínima para RNNoise en wasm: memoria lineal con asignador por bloques (sin liberar), copias con bulk-memory
#include <stddef.h>
extern unsigned char __heap_base;
static size_t heap_top = 0;
void *malloc(size_t n) {
  if (!heap_top) heap_top = (size_t)&__heap_base;
  size_t p = (heap_top + 15) & ~(size_t)15;
  size_t end = p + n;
  size_t have = __builtin_wasm_memory_size(0) * 65536;
  if (end > have) { if (__builtin_wasm_memory_grow(0, (end - have + 65535) / 65536) == (size_t)-1) return 0; }
  heap_top = end;
  return (void *)p;
}
void *calloc(size_t a, size_t b) { unsigned char *p = malloc(a * b); for (size_t i = 0; i < a * b; i++) p[i] = 0; return p; }
void free(void *p) { (void)p; }
void *memcpy(void *d, const void *s, size_t n) { __builtin_memcpy(d, s, n); return d; }
void *memmove(void *d, const void *s, size_t n) { __builtin_memmove(d, s, n); return d; }
void *memset(void *d, int c, size_t n) { __builtin_memset(d, c, n); return d; }
