// API del módulo: un estado por canal de análisis; búferes compartidos de entrada (480) y ganancias (22)
#include "rnnoise.h"
float rnnoise_analyze(DenoiseState *st, float *gains, const float *in);
int rnnoise_parts_size(void);
void rnnoise_part1(DenoiseState *st, void *a, const float *in);
void rnnoise_part2(DenoiseState *st, void *a);
float rnnoise_part3(DenoiseState *st, void *a, float *gains);
#include <stdlib.h>
static float tbs_in[480];
static float tbs_gains[22];
// estado de cada cadena: el de RNNoise y los datos de la trama entre las tres llamadas
typedef struct { DenoiseState *st; void *parts; } TbsState;
__attribute__((export_name("tbs_in"))) float *tbs_in_ptr(void) { return tbs_in; }
__attribute__((export_name("tbs_gains"))) float *tbs_gains_ptr(void) { return tbs_gains; }
__attribute__((export_name("tbs_create"))) TbsState *tbs_create(void) {
  TbsState *s = malloc(sizeof(TbsState));
  s->st = rnnoise_create(0); s->parts = malloc(rnnoise_parts_size());
  return s;
}
// trama completa en una llamada
__attribute__((export_name("tbs_analyze"))) float tbs_analyze(TbsState *s) { return rnnoise_analyze(s->st, tbs_gains, tbs_in); }
// o en tres, una por cuanto: tbs_p1 (lee tbs_in), tbs_p2, tbs_p3 (escribe tbs_gains, devuelve la probabilidad de voz)
__attribute__((export_name("tbs_p1"))) void tbs_p1(TbsState *s) { rnnoise_part1(s->st, s->parts, tbs_in); }
__attribute__((export_name("tbs_p2"))) void tbs_p2(TbsState *s) { rnnoise_part2(s->st, s->parts); }
__attribute__((export_name("tbs_p3"))) float tbs_p3(TbsState *s) { return rnnoise_part3(s->st, s->parts, tbs_gains); }
