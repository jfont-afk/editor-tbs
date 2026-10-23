// API del módulo: un estado por canal de análisis; búferes compartidos de entrada (480) y ganancias (22)
#include "rnnoise.h"
float rnnoise_analyze(DenoiseState *st, float *gains, const float *in);
static float tbs_in[480];
static float tbs_gains[22];
__attribute__((export_name("tbs_in"))) float *tbs_in_ptr(void) { return tbs_in; }
__attribute__((export_name("tbs_gains"))) float *tbs_gains_ptr(void) { return tbs_gains; }
__attribute__((export_name("tbs_create"))) DenoiseState *tbs_create(void) { return rnnoise_create(0); }
__attribute__((export_name("tbs_analyze"))) float tbs_analyze(DenoiseState *st) { return rnnoise_analyze(st, tbs_gains, tbs_in); }
