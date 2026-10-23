/* Función añadida al final de src/denoise.c de RNNoise v0.1.1 (usa sus funciones estáticas) */

/* --- Editor TBS: solo análisis (ganancias por banda y probabilidad de voz), sin síntesis ---
   El editor aplica las ganancias en su propio STFT junto al supresor espectral. */
float rnnoise_analyze(DenoiseState *st, float *gains, const float *in) {
  int i;
  kiss_fft_cpx X[FREQ_SIZE];
  kiss_fft_cpx P[WINDOW_SIZE];
  float x[FRAME_SIZE];
  float Ex[NB_BANDS], Ep[NB_BANDS];
  float Exp[NB_BANDS];
  float features[NB_FEATURES];
  float g[NB_BANDS];
  float vad_prob = 0;
  int silence;
  static const float a_hp[2] = {-1.99599, 0.99600};
  static const float b_hp[2] = {-2, 1};
  biquad(x, st->mem_hp_x, in, b_hp, a_hp, FRAME_SIZE);
  silence = compute_frame_features(st, X, P, Ex, Ep, Exp, features, x);
  if (!silence) {
    compute_rnn(&st->rnn, g, &vad_prob, features);
    for (i=0;i<NB_BANDS;i++) {
      g[i] = MAX16(g[i], .6f*st->lastg[i]);
      st->lastg[i] = g[i];
    }
  } else {
    for (i=0;i<NB_BANDS;i++) g[i] = 1;
  }
  for (i=0;i<NB_BANDS;i++) gains[i] = g[i];
  return vad_prob;
}
