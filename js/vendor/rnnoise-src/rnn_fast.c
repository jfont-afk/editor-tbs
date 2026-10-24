/* Copyright (c) 2008-2011 Octasic Inc.
                 2012-2017 Jean-Marc Valin */
/*
   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions
   are met:

   - Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.

   - Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.

   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
   ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
   LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
   A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE FOUNDATION OR
   CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
   EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
   PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
   PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
   LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
   NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#include <math.h>
#include "opus_types.h"
#include "common.h"
#include "arch.h"
#include "tansig_table.h"
#include "rnn.h"
#include "rnn_data.h"
#include <stdio.h>
#include <stdlib.h>

/* Editor TBS: los pesos (int8) se pasan a float la primera vez que se usa cada capa, así los bucles
   de abajo son multiplicaciones y sumas de float que el compilador vectoriza (mismo resultado). */
typedef struct { const rnn_weight *key; float *w; } WCache;
static WCache wcache[16];
static int nwcache = 0;
static const float *fweights(const rnn_weight *w, int n)
{
   int i;
   float *f;
   for (i=0;i<nwcache;i++) if (wcache[i].key == w) return wcache[i].w;
   f = malloc(n*sizeof(float));
   if (!f || nwcache == 16) __builtin_trap();
   for (i=0;i<n;i++) f[i] = w[i];
   wcache[nwcache].key = w; wcache[nwcache].w = f; nwcache++;
   return f;
}

static OPUS_INLINE float tansig_approx(float x)
{
    int i;
    float y, dy;
    float sign=1;
    /* Tests are reversed to catch NaNs */
    if (!(x<8))
        return 1;
    if (!(x>-8))
        return -1;
#ifndef FIXED_POINT
    /* Another check in case of -ffast-math */
    if (celt_isnan(x))
       return 0;
#endif
    if (x<0)
    {
       x=-x;
       sign=-1;
    }
    i = (int)floor(.5f+25*x);
    x -= .04f*i;
    y = tansig_table[i];
    dy = 1-y*y;
    y = y + x*dy*(1 - y*x);
    return sign*y;
}

static OPUS_INLINE float sigmoid_approx(float x)
{
   return .5 + .5*tansig_approx(.5*x);
}

static OPUS_INLINE float relu(float x)
{
   return x < 0 ? 0 : x;
}

/* Editor TBS: mismos cálculos que el original con los bucles intercambiados (pesos contiguos por neurona),
   para que el compilador los vectorice (WebAssembly SIMD). Solo cambia el orden de las sumas. */
static void compute_dense(const DenseLayer *layer, float *output, const float *input)
{
   int i, j;
   int N, M;
   int stride;
   M = layer->nb_inputs;
   N = layer->nb_neurons;
   stride = N;
   const float *W = fweights(layer->input_weights, M*N);
   for (i=0;i<N;i++) output[i] = layer->bias[i];
   for (j=0;j<M;j++)
   {
      const float *w = &W[j*stride];
      const float x = input[j];
      for (i=0;i<N;i++) output[i] += w[i]*x;
   }
   for (i=0;i<N;i++) output[i] *= WEIGHTS_SCALE;
   if (layer->activation == ACTIVATION_SIGMOID) {
      for (i=0;i<N;i++)
         output[i] = sigmoid_approx(output[i]);
   } else if (layer->activation == ACTIVATION_TANH) {
      for (i=0;i<N;i++)
         output[i] = tansig_approx(output[i]);
   } else if (layer->activation == ACTIVATION_RELU) {
      for (i=0;i<N;i++)
         output[i] = relu(output[i]);
   } else {
     __builtin_trap();
   }
}

static void compute_gru(const GRULayer *gru, float *state, const float *input)
{
   int i, j;
   int N, M;
   int stride;
   float zr[2*MAX_NEURONS];
   float h[MAX_NEURONS];
   float rs[MAX_NEURONS];
   M = gru->nb_inputs;
   N = gru->nb_neurons;
   stride = 3*N;
   const float *Wi = fweights(gru->input_weights, M*stride), *Wr = fweights(gru->recurrent_weights, N*stride);
   /* puertas de actualización (z) y de reinicio (r) a la vez: columnas 0..2N-1 */
   for (i=0;i<2*N;i++) zr[i] = gru->bias[i];
   for (j=0;j<M;j++)
   {
      const float *w = &Wi[j*stride];
      const float x = input[j];
      for (i=0;i<2*N;i++) zr[i] += w[i]*x;
   }
   for (j=0;j<N;j++)
   {
      const float *w = &Wr[j*stride];
      const float x = state[j];
      for (i=0;i<2*N;i++) zr[i] += w[i]*x;
   }
   for (i=0;i<2*N;i++) zr[i] = sigmoid_approx(WEIGHTS_SCALE*zr[i]);
   /* salida candidata: columnas 2N..3N-1, con el estado multiplicado por r */
   for (j=0;j<N;j++) rs[j] = state[j]*zr[N+j];
   for (i=0;i<N;i++) h[i] = gru->bias[2*N + i];
   for (j=0;j<M;j++)
   {
      const float *w = &Wi[2*N + j*stride];
      const float x = input[j];
      for (i=0;i<N;i++) h[i] += w[i]*x;
   }
   for (j=0;j<N;j++)
   {
      const float *w = &Wr[2*N + j*stride];
      const float x = rs[j];
      for (i=0;i<N;i++) h[i] += w[i]*x;
   }
   for (i=0;i<N;i++)
   {
      float sum = h[i];
      if (gru->activation == ACTIVATION_SIGMOID) sum = sigmoid_approx(WEIGHTS_SCALE*sum);
      else if (gru->activation == ACTIVATION_TANH) sum = tansig_approx(WEIGHTS_SCALE*sum);
      else if (gru->activation == ACTIVATION_RELU) sum = relu(WEIGHTS_SCALE*sum);
      else __builtin_trap();
      state[i] = zr[i]*state[i] + (1-zr[i])*sum;
   }
}

#define INPUT_SIZE 42

/* Editor TBS: compute_rnn partido en dos (para repartir el cálculo): a) capa de entrada, GRU de voz
   (probabilidad de voz) y GRU de ruido; b) GRU de limpieza y ganancias. */
void compute_rnn_a(RNNState *rnn, float *vad, const float *input) {
  int i;
  float dense_out[MAX_NEURONS];
  float noise_input[MAX_NEURONS*3];
  compute_dense(rnn->model->input_dense, dense_out, input);
  compute_gru(rnn->model->vad_gru, rnn->vad_gru_state, dense_out);
  compute_dense(rnn->model->vad_output, vad, rnn->vad_gru_state);
  for (i=0;i<rnn->model->input_dense_size;i++) noise_input[i] = dense_out[i];
  for (i=0;i<rnn->model->vad_gru_size;i++) noise_input[i+rnn->model->input_dense_size] = rnn->vad_gru_state[i];
  for (i=0;i<INPUT_SIZE;i++) noise_input[i+rnn->model->input_dense_size+rnn->model->vad_gru_size] = input[i];
  compute_gru(rnn->model->noise_gru, rnn->noise_gru_state, noise_input);
}
void compute_rnn_b(RNNState *rnn, float *gains, const float *input) {
  int i;
  float denoise_input[MAX_NEURONS*3];
  for (i=0;i<rnn->model->vad_gru_size;i++) denoise_input[i] = rnn->vad_gru_state[i];
  for (i=0;i<rnn->model->noise_gru_size;i++) denoise_input[i+rnn->model->vad_gru_size] = rnn->noise_gru_state[i];
  for (i=0;i<INPUT_SIZE;i++) denoise_input[i+rnn->model->vad_gru_size+rnn->model->noise_gru_size] = input[i];
  compute_gru(rnn->model->denoise_gru, rnn->denoise_gru_state, denoise_input);
  compute_dense(rnn->model->denoise_output, gains, rnn->denoise_gru_state);
}

void compute_rnn(RNNState *rnn, float *gains, float *vad, const float *input) {
  int i;
  float dense_out[MAX_NEURONS];
  float noise_input[MAX_NEURONS*3];
  float denoise_input[MAX_NEURONS*3];
  compute_dense(rnn->model->input_dense, dense_out, input);
  compute_gru(rnn->model->vad_gru, rnn->vad_gru_state, dense_out);
  compute_dense(rnn->model->vad_output, vad, rnn->vad_gru_state);
  for (i=0;i<rnn->model->input_dense_size;i++) noise_input[i] = dense_out[i];
  for (i=0;i<rnn->model->vad_gru_size;i++) noise_input[i+rnn->model->input_dense_size] = rnn->vad_gru_state[i];
  for (i=0;i<INPUT_SIZE;i++) noise_input[i+rnn->model->input_dense_size+rnn->model->vad_gru_size] = input[i];
  compute_gru(rnn->model->noise_gru, rnn->noise_gru_state, noise_input);

  for (i=0;i<rnn->model->vad_gru_size;i++) denoise_input[i] = rnn->vad_gru_state[i];
  for (i=0;i<rnn->model->noise_gru_size;i++) denoise_input[i+rnn->model->vad_gru_size] = rnn->noise_gru_state[i];
  for (i=0;i<INPUT_SIZE;i++) denoise_input[i+rnn->model->vad_gru_size+rnn->model->noise_gru_size] = input[i];
  compute_gru(rnn->model->denoise_gru, rnn->denoise_gru_state, denoise_input);
  compute_dense(rnn->model->denoise_output, gains, rnn->denoise_gru_state);
}
