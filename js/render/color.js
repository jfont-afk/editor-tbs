// Corrección de color en tiempo real (WebGL2) con presets.
const VS = `#version 300 es
in vec2 p; out vec2 v_uv;
void main(){ v_uv = vec2((p.x+1.0)*0.5, 1.0-(p.y+1.0)*0.5); gl_Position = vec4(p,0.0,1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_tex; uniform vec2 u_texel; uniform float u_time;
uniform float u_exposure, u_contrast, u_saturation, u_vibrance, u_temp, u_tint, u_high, u_shad, u_fade, u_vignette, u_grain, u_sharpen, u_chroma;
uniform vec3 u_stS, u_stH;
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
void main(){
  vec3 c = texture(u_tex, v_uv).rgb;
  if (u_chroma > 0.001) {
    // aberración cromática radial (rojo hacia fuera, azul hacia dentro)
    vec2 dd = (v_uv - 0.5) * u_chroma * 0.014;
    c = vec3(texture(u_tex, v_uv + dd).r, c.g, texture(u_tex, v_uv - dd).b);
  }
  if (u_sharpen > 0.001) {
    vec3 b = (texture(u_tex, v_uv+vec2(u_texel.x,0.0)).rgb + texture(u_tex, v_uv-vec2(u_texel.x,0.0)).rgb +
              texture(u_tex, v_uv+vec2(0.0,u_texel.y)).rgb + texture(u_tex, v_uv-vec2(0.0,u_texel.y)).rgb) * 0.25;
    c = c + (c - b) * u_sharpen * 1.6;
  }
  c = pow(max(c, 0.0), vec3(2.2));
  c *= exp2(u_exposure);
  c.r *= 1.0 + u_temp * 0.16; c.b *= 1.0 - u_temp * 0.16; c.g *= 1.0 + u_tint * 0.10;
  c = pow(max(c, 0.0), vec3(1.0/2.2));
  float L = luma(c);
  float sh = 1.0 - smoothstep(0.0, 0.55, L);
  float hi = smoothstep(0.45, 1.0, L);
  c += u_shad * 0.28 * sh;
  c += u_high * 0.25 * hi;
  c = (c - 0.5) * (1.0 + u_contrast) + 0.5;
  L = luma(c);
  c = mix(vec3(L), c, 1.0 + u_saturation);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  c = mix(vec3(L), c, 1.0 + u_vibrance * (1.0 - clamp(mx - mn, 0.0, 1.0)) * 1.3);
  L = clamp(luma(c), 0.0, 1.0);
  c += u_stS * (1.0 - L) + u_stH * L;
  c = mix(c, c * 0.84 + 0.11, u_fade);
  vec2 d = v_uv - 0.5;
  float v = smoothstep(0.85, 0.25, length(d * vec2(1.1, 1.0)));
  c *= mix(1.0, v, u_vignette);
  float n = fract(sin(dot(v_uv * vec2(12.9898, 78.233) + u_time, vec2(1.0, 1.0))) * 43758.5453);
  c += (n - 0.5) * u_grain * 0.14;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export const COLOR_PRESETS = [
  { id: 'none', name: 'Original', v: {} },
  { id: 'natural', name: 'Natural', v: { contrast: 0.08, vibrance: 0.18, shadows: 0.05 } },
  { id: 'calido', name: 'Cálido', ref: 'Guille', v: { temperature: 0.32, contrast: 0.1, fade: 0.1, shadows: 0.1, vibrance: 0.12, grain: 0.12 } },
  { id: 'editorial', name: 'Editorial', ref: 'Marco', v: { contrast: 0.14, saturation: -0.12, highlights: -0.22, shadows: 0.06, vignette: 0.18, splitS: [-0.02, 0.012, 0.03], splitH: [0.035, 0.015, -0.02] } },
  { id: 'cine', name: 'Cine', v: { contrast: 0.16, saturation: -0.06, vignette: 0.25, splitS: [-0.04, 0.02, 0.06], splitH: [0.06, 0.025, -0.04] } },
  { id: 'tbs', name: 'TBS Noche', v: { exposure: -0.08, contrast: 0.2, saturation: -0.08, vignette: 0.35, splitS: [0.05, -0.02, 0.035], splitH: [0.02, 0, 0.01] } },
  { id: 'vivo', name: 'Vivo', v: { contrast: 0.14, saturation: 0.2, vibrance: 0.22 } },
  { id: 'pelicula', name: 'Película', v: { fade: 0.16, grain: 0.32, temperature: 0.14, contrast: 0.12, saturation: -0.08, vignette: 0.22 } },
  { id: 'frio', name: 'Frío', v: { temperature: -0.3, tint: 0.04, contrast: 0.1, vibrance: 0.08 } },
  { id: 'mate', name: 'Mate', v: { fade: 0.32, contrast: -0.08, saturation: -0.14 } },
  { id: 'bn', name: 'B/N', v: { saturation: -1, contrast: 0.22, grain: 0.18 } },
];

export const COLOR_SLIDERS = [
  { k: 'exposure', name: 'Exposición', min: -1.5, max: 1.5, step: 0.01 },
  { k: 'contrast', name: 'Contraste', min: -0.6, max: 0.8, step: 0.01 },
  { k: 'highlights', name: 'Altas luces', min: -1, max: 1, step: 0.01 },
  { k: 'shadows', name: 'Sombras', min: -1, max: 1, step: 0.01 },
  { k: 'saturation', name: 'Saturación', min: -1, max: 1, step: 0.01 },
  { k: 'vibrance', name: 'Intensidad', min: -1, max: 1, step: 0.01 },
  { k: 'temperature', name: 'Temperatura', min: -1, max: 1, step: 0.01 },
  { k: 'tint', name: 'Matiz', min: -1, max: 1, step: 0.01 },
  { k: 'fade', name: 'Desvanecido', min: 0, max: 0.6, step: 0.01 },
  // efectos de imagen (se editan en la pestaña Efectos)
  { k: 'sharpen', name: 'Nitidez', min: 0, max: 1, step: 0.01, fx: true },
  { k: 'grain', name: 'Ruido / grano', min: 0, max: 1, step: 0.01, fx: true },
  { k: 'chroma', name: 'Aberración cromática', min: 0, max: 1, step: 0.01, fx: true },
  { k: 'vignette', name: 'Viñeta', min: 0, max: 1, step: 0.01, fx: true },
];

// Valores finales = preset + ajustes del usuario
export function colorValues(c) {
  if (!c) return null;
  const pre = (COLOR_PRESETS.find(p => p.id === c.preset) || COLOR_PRESETS[0]).v;
  const out = {};
  for (const s of COLOR_SLIDERS) out[s.k] = (pre[s.k] || 0) + (c[s.k] || 0);
  out.splitS = pre.splitS || [0, 0, 0];
  out.splitH = pre.splitH || [0, 0, 0];
  return out;
}

export function isNeutral(v) {
  if (!v) return true;
  return COLOR_SLIDERS.every(s => Math.abs(v[s.k] || 0) < 1e-4) && v.splitS.every(x => !x) && v.splitH.every(x => !x);
}

export class ColorGL {
  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    this.gl = gl;
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.u = {};
    for (const n of ['u_tex', 'u_texel', 'u_time', 'u_exposure', 'u_contrast', 'u_saturation', 'u_vibrance', 'u_temp', 'u_tint', 'u_high', 'u_shad', 'u_fade', 'u_vignette', 'u_grain', 'u_sharpen', 'u_chroma', 'u_stS', 'u_stH']) this.u[n] = gl.getUniformLocation(prog, n);
  }

  // Devuelve un canvas con el fotograma corregido (o null si no hay WebGL2)
  render(source, sw, sh, v, time = 0, maxDim = 1920) {
    const gl = this.gl;
    if (!gl || !sw || !sh) return null;
    const k = Math.min(1, maxDim / Math.max(sw, sh));
    const w = Math.round(sw * k), h = Math.round(sh * k);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); } catch (e) { return null; }
    const U = this.u;
    gl.uniform1i(U.u_tex, 0);
    gl.uniform2f(U.u_texel, 1 / sw, 1 / sh);
    gl.uniform1f(U.u_time, (time * 7.31) % 100);
    gl.uniform1f(U.u_exposure, v.exposure); gl.uniform1f(U.u_contrast, v.contrast);
    gl.uniform1f(U.u_saturation, v.saturation); gl.uniform1f(U.u_vibrance, v.vibrance);
    gl.uniform1f(U.u_temp, v.temperature); gl.uniform1f(U.u_tint, v.tint);
    gl.uniform1f(U.u_high, v.highlights); gl.uniform1f(U.u_shad, v.shadows);
    gl.uniform1f(U.u_fade, v.fade); gl.uniform1f(U.u_vignette, v.vignette);
    gl.uniform1f(U.u_grain, v.grain); gl.uniform1f(U.u_sharpen, v.sharpen); gl.uniform1f(U.u_chroma, v.chroma || 0);
    gl.uniform3fv(U.u_stS, v.splitS); gl.uniform3fv(U.u_stH, v.splitH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

// Ajuste automático (balance de blancos "gris" + exposición) a partir de un fotograma pequeño
export function autoColor(source) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  let r = 0, g = 0, b = 0, n = 0;
  const lum = [];
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
  }
  r /= n; g /= n; b /= n;
  lum.sort((a, z) => a - z);
  const mid = lum[Math.floor(lum.length * 0.5)] / 255;
  const lo = lum[Math.floor(lum.length * 0.03)] / 255, hi = lum[Math.floor(lum.length * 0.97)] / 255;
  const exposure = Math.max(-1, Math.min(1, Math.log2(0.45 / Math.max(0.05, mid)) * 0.6));
  const temperature = Math.max(-0.6, Math.min(0.6, (b - r) / 255 * 1.6));
  const tint = Math.max(-0.5, Math.min(0.5, ((r + b) / 2 - g) / 255 * 1.4));
  const contrast = Math.max(-0.2, Math.min(0.35, (0.85 - (hi - lo)) * 0.4));
  return { exposure: +exposure.toFixed(2), temperature: +temperature.toFixed(2), tint: +tint.toFixed(2), contrast: +contrast.toFixed(2), vibrance: 0.1 };
}
