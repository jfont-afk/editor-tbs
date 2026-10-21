// Segmentación de persona (texto detrás) y detección de caras (evitar tapar la cara) con MediaPipe.
const VER = '0.10.21';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let fileset = null, visionMod = null;
let segmenter = null, faceDet = null;
let segLoading = null, faceLoading = null;
let lastTs = 0;
const nextTs = () => { const t = Math.max(performance.now(), lastTs + 1); lastTs = t; return t; };

async function base() {
  if (!visionMod) visionMod = await import(`${BASE}/vision_bundle.mjs`);
  if (!fileset) fileset = await visionMod.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
  return visionMod;
}

async function create(Cls, opts) {
  try {
    return await Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } });
  } catch (e) {
    console.warn('MediaPipe GPU no disponible, uso CPU', e);
    return await Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } });
  }
}

export function segmenterReady() { return !!segmenter; }
export function loadSegmenter() {
  if (segmenter) return Promise.resolve(segmenter);
  if (!segLoading) {
    segLoading = (async () => {
      const m = await base();
      segmenter = await create(m.ImageSegmenter, {
        baseOptions: { modelAssetPath: SEG_MODEL }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
      });
      return segmenter;
    })().catch(e => { segLoading = null; throw e; });
  }
  return segLoading;
}

export function faceReady() { return !!faceDet; }
export function loadFaces() {
  if (faceDet) return Promise.resolve(faceDet);
  if (!faceLoading) {
    faceLoading = (async () => {
      const m = await base();
      faceDet = await create(m.FaceDetector, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: 'VIDEO', minDetectionConfidence: 0.5 });
      return faceDet;
    })().catch(e => { faceLoading = null; throw e; });
  }
  return faceLoading;
}

// ---- Máscara de persona ----
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d');
let maskImg = null;
let maskKey = null;

/** Devuelve un canvas con la máscara (alfa = persona) del fotograma actual de "source". */
export function personMask(source, key) {
  if (!segmenter) { loadSegmenter().catch(() => {}); return null; }
  if (key && key === maskKey) return maskCanvas;
  try {
    segmenter.segmentForVideo(source, nextTs(), (res) => {
      const masks = res.confidenceMasks;
      if (!masks || !masks.length) return;
      const bg = masks[0];
      const w = bg.width, h = bg.height;
      const data = bg.getAsFloat32Array();
      if (maskCanvas.width !== w || maskCanvas.height !== h) { maskCanvas.width = w; maskCanvas.height = h; maskImg = null; }
      if (!maskImg) maskImg = maskCtx.createImageData(w, h);
      const px = maskImg.data;
      for (let i = 0; i < data.length; i++) {
        let a = 1 - data[i];
        a = a <= 0.3 ? 0 : a >= 0.7 ? 1 : (a - 0.3) / 0.4;
        const j = i * 4;
        px[j] = 255; px[j + 1] = 255; px[j + 2] = 255; px[j + 3] = a * 255;
      }
      maskCtx.putImageData(maskImg, 0, 0);
    });
    maskKey = key;
    return maskCanvas;
  } catch (e) {
    console.warn('segmentación', e);
    return null;
  }
}

// Máscara de una imagen fija (miniaturas), a mayor calidad
export async function personMaskImage(source) {
  await loadSegmenter();
  return personMask(source, 'img_' + Math.random());
}

// Detección directa (sin caché) — para el análisis de encuadre
export async function detectFaces(source) {
  await loadFaces();
  const vw = source.videoWidth || source.naturalWidth || source.width;
  const vh = source.videoHeight || source.naturalHeight || source.height;
  const r = faceDet.detectForVideo(source, nextTs());
  return (r.detections || []).map(d => d.boundingBox).filter(Boolean)
    .map(b => ({ x: b.originX / vw, y: b.originY / vh, w: b.width / vw, h: b.height / vh }));
}

// ---- Caras ----
const faceCache = new Map();
/** Caras ya detectadas para ese instante (undefined si aún no se han buscado). */
export function facesCached(assetId, srcTime) { return faceCache.get(`${assetId}@${Math.round(srcTime * 4)}`); }
/** Cajas de cara normalizadas [{x,y,w,h}] del fotograma, con caché por intervalos de 0,25 s. */
export function facesAt(source, assetId, srcTime) {
  const key = `${assetId}@${Math.round(srcTime * 4)}`;
  if (faceCache.has(key)) return faceCache.get(key);
  if (!faceDet) { loadFaces().catch(() => {}); return null; }
  const vw = source.videoWidth || source.naturalWidth || source.width;
  const vh = source.videoHeight || source.naturalHeight || source.height;
  if (!vw || !vh) return null;
  try {
    const r = faceDet.detectForVideo(source, nextTs());
    const boxes = (r.detections || []).map(d => d.boundingBox).filter(Boolean)
      .map(b => ({ x: b.originX / vw, y: b.originY / vh, w: b.width / vw, h: b.height / vh }));
    faceCache.set(key, boxes);
    return boxes;
  } catch (e) {
    return null;
  }
}
