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

/* --- Lo mismo en tres llamadas, para repartir el cálculo en cuantos de audio de 128 muestras:
   1) FFT de la trama, energía por bandas y búsqueda del tono; 2) resto de características y primeras capas
   de la red (probabilidad de voz); 3) última capa (ganancias). Mismos cálculos que rnnoise_analyze. */
typedef struct {
  kiss_fft_cpx X[FREQ_SIZE];
  float Ex[NB_BANDS];
  float pitch_buf[PITCH_BUF_SIZE>>1];
  int pitch_index;
  float features[NB_FEATURES];
  int silence;
  float vad;
} AnalyzeParts;
void compute_rnn_a(RNNState *rnn, float *vad, const float *input);
void compute_rnn_b(RNNState *rnn, float *gains, const float *input);
int rnnoise_parts_size(void) { return sizeof(AnalyzeParts); }
void rnnoise_part1(DenoiseState *st, AnalyzeParts *a, const float *in) {
  float x[FRAME_SIZE];
  float *(pre[1]);
  int pitch_index;
  static const float a_hp[2] = {-1.99599, 0.99600};
  static const float b_hp[2] = {-2, 1};
  biquad(x, st->mem_hp_x, in, b_hp, a_hp, FRAME_SIZE);
  frame_analysis(st, a->X, a->Ex, x);
  RNN_MOVE(st->pitch_buf, &st->pitch_buf[FRAME_SIZE], PITCH_BUF_SIZE-FRAME_SIZE);
  RNN_COPY(&st->pitch_buf[PITCH_BUF_SIZE-FRAME_SIZE], x, FRAME_SIZE);
  pre[0] = &st->pitch_buf[0];
  rnn_pitch_downsample(pre, a->pitch_buf, PITCH_BUF_SIZE, 1);
  rnn_pitch_search(a->pitch_buf+(PITCH_MAX_PERIOD>>1), a->pitch_buf, PITCH_FRAME_SIZE,
               PITCH_MAX_PERIOD-3*PITCH_MIN_PERIOD, &pitch_index);
  a->pitch_index = PITCH_MAX_PERIOD-pitch_index;
}
void rnnoise_part2(DenoiseState *st, AnalyzeParts *a) {
  int i;
  float E = 0;
  float *ceps_0, *ceps_1, *ceps_2;
  float spec_variability = 0;
  float Ly[NB_BANDS];
  float p[WINDOW_SIZE];
  kiss_fft_cpx P[WINDOW_SIZE];
  float Ep[NB_BANDS], Exp[NB_BANDS];
  float gain;
  float tmp[NB_BANDS];
  float follow, logMax;
  float *features = a->features, *Ex = a->Ex;
  int pitch_index = a->pitch_index;
  gain = rnn_remove_doubling(a->pitch_buf, PITCH_MAX_PERIOD, PITCH_MIN_PERIOD,
          PITCH_FRAME_SIZE, &pitch_index, st->last_period, st->last_gain);
  st->last_period = pitch_index;
  st->last_gain = gain;
  for (i=0;i<WINDOW_SIZE;i++)
    p[i] = st->pitch_buf[PITCH_BUF_SIZE-WINDOW_SIZE-pitch_index+i];
  apply_window(p);
  forward_transform(P, p);
  compute_band_energy(Ep, P);
  compute_band_corr(Exp, a->X, P);
  for (i=0;i<NB_BANDS;i++) Exp[i] = Exp[i]/sqrt(.001+Ex[i]*Ep[i]);
  dct(tmp, Exp);
  for (i=0;i<NB_DELTA_CEPS;i++) features[NB_BANDS+2*NB_DELTA_CEPS+i] = tmp[i];
  features[NB_BANDS+2*NB_DELTA_CEPS] -= 1.3;
  features[NB_BANDS+2*NB_DELTA_CEPS+1] -= 0.9;
  features[NB_BANDS+3*NB_DELTA_CEPS] = .01*(pitch_index-300);
  logMax = -2;
  follow = -2;
  for (i=0;i<NB_BANDS;i++) {
    Ly[i] = log10(1e-2+Ex[i]);
    Ly[i] = MAX16(logMax-7, MAX16(follow-1.5, Ly[i]));
    logMax = MAX16(logMax, Ly[i]);
    follow = MAX16(follow-1.5, Ly[i]);
    E += Ex[i];
  }
  a->vad = 0;
  if (E < 0.04) {
    /* If there's no audio, avoid messing up the state. */
    RNN_CLEAR(features, NB_FEATURES);
    a->silence = 1;
    return;
  }
  a->silence = 0;
  dct(features, Ly);
  features[0] -= 12;
  features[1] -= 4;
  ceps_0 = st->cepstral_mem[st->memid];
  ceps_1 = (st->memid < 1) ? st->cepstral_mem[CEPS_MEM+st->memid-1] : st->cepstral_mem[st->memid-1];
  ceps_2 = (st->memid < 2) ? st->cepstral_mem[CEPS_MEM+st->memid-2] : st->cepstral_mem[st->memid-2];
  for (i=0;i<NB_BANDS;i++) ceps_0[i] = features[i];
  st->memid++;
  for (i=0;i<NB_DELTA_CEPS;i++) {
    features[i] = ceps_0[i] + ceps_1[i] + ceps_2[i];
    features[NB_BANDS+i] = ceps_0[i] - ceps_2[i];
    features[NB_BANDS+NB_DELTA_CEPS+i] =  ceps_0[i] - 2*ceps_1[i] + ceps_2[i];
  }
  /* Spectral variability features. */
  if (st->memid == CEPS_MEM) st->memid = 0;
  for (i=0;i<CEPS_MEM;i++)
  {
    int j;
    float mindist = 1e15f;
    for (j=0;j<CEPS_MEM;j++)
    {
      int k;
      float dist=0;
      for (k=0;k<NB_BANDS;k++)
      {
        float tmp;
        tmp = st->cepstral_mem[i][k] - st->cepstral_mem[j][k];
        dist += tmp*tmp;
      }
      if (j!=i)
        mindist = MIN32(mindist, dist);
    }
    spec_variability += mindist;
  }
  features[NB_BANDS+3*NB_DELTA_CEPS+1] = spec_variability/CEPS_MEM-2.1;
  compute_rnn_a(&st->rnn, &a->vad, features);
}
float rnnoise_part3(DenoiseState *st, AnalyzeParts *a, float *gains) {
  int i;
  float g[NB_BANDS];
  if (!a->silence) {
    compute_rnn_b(&st->rnn, g, a->features);
    for (i=0;i<NB_BANDS;i++) {
      g[i] = MAX16(g[i], .6f*st->lastg[i]);
      st->lastg[i] = g[i];
    }
  } else {
    for (i=0;i<NB_BANDS;i++) g[i] = 1;
  }
  for (i=0;i<NB_BANDS;i++) gains[i] = g[i];
  return a->vad;
}
