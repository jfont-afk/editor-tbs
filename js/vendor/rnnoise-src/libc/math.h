#pragma once
#define M_PI 3.14159265358979323846
#define IMP(n) __attribute__((import_module("env"), import_name(#n)))
static inline double sqrt(double x) { return __builtin_sqrt(x); }
static inline float sqrtf(float x) { return __builtin_sqrtf(x); }
static inline double floor(double x) { return __builtin_floor(x); }
static inline float floorf(float x) { return __builtin_floorf(x); }
static inline double fabs(double x) { return __builtin_fabs(x); }
static inline float fabsf(float x) { return __builtin_fabsf(x); }
IMP(exp) double exp(double);
IMP(log) double log(double);
IMP(log10) double log10(double);
IMP(pow) double pow(double, double);
IMP(sin) double sin(double);
IMP(cos) double cos(double);
