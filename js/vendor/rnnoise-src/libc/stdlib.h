#pragma once
#include <stddef.h>
void *malloc(size_t n);
void *calloc(size_t a, size_t b);
void free(void *p);
static inline int abs(int x) { return x < 0 ? -x : x; }
