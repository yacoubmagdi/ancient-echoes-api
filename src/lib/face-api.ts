// Browser-side face-api.js wrapper.
// IMPORTANT: face-api auto-detects Node and tries to require @tensorflow/tfjs-node
// during SSR. We must keep all imports lazy and client-only, and explicitly
// target the browser ESM build.
type FaceApi = typeof import("@vladmandic/face-api/dist/face-api.esm.js");

// Load models from a public CDN to avoid issues with authenticated preview
// environments where /models/* requires session cookies and falls through to
// the SSR 404 handler. The @vladmandic/face-api models are mirrored on jsdelivr.
const MODEL_URL =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model";
let loadingPromise: Promise<FaceApi> | null = null;

function ensureBrowser() {
  if (typeof window === "undefined") {
    throw new Error("face-api can only be used in the browser");
  }
}

async function getFaceApi(): Promise<FaceApi> {
  ensureBrowser();
  // Dynamic import — only evaluated in the browser, never during SSR.
  // Import the browser bundle directly so Vite/SSR never resolves the Node entry.
  return await import("@vladmandic/face-api/dist/face-api.esm.js");
}

function getModelUrl(): string {
  ensureBrowser();
  return MODEL_URL;
}

export async function loadFaceModels(): Promise<void> {
  if (loadingPromise) {
    await loadingPromise;
    return;
  }
  loadingPromise = (async () => {
    const faceapi = await getFaceApi();
    const modelUrl = getModelUrl();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl),
    ]);
    return faceapi;
  })().catch((error) => {
    loadingPromise = null;
    throw error;
  });
  await loadingPromise;
}

export async function imageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
    });
    return img;
  } finally {
    // Don't revoke immediately — caller may need pixels. Caller should revoke.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export async function imageFromUrl(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
  });
  return img;
}

export type SkinTone = {
  h: number; // Hue 0-360
  s: number; // Saturation 0-100
  l: number; // Lightness 0-100
  category: "very_light" | "light" | "medium" | "olive" | "brown" | "dark";
};

export type FaceExtractionResult = {
  descriptor: number[];
  skinTone: SkinTone;
};

/**
 * Classify into a Fitzpatrick-inspired skin tone category.
 * Uses both lightness and saturation for better discrimination.
 */
function classifySkinTone(l: number, s: number): SkinTone["category"] {
  // High-lightness + low-saturation = washed-out lighting, penalise slightly
  if (l >= 75 && s < 15) return "light"; // likely overexposed, not truly very_light
  if (l >= 75) return "very_light";
  if (l >= 65) return "light";
  if (l >= 50) return s < 25 ? "light" : "medium";
  if (l >= 40) return "olive";
  if (l >= 28) return "brown";
  return "dark";
}

/**
 * Extract skin tone from the face region using face landmarks for a tight
 * skin-only mask, Grey-World color constancy to neutralise lighting bias,
 * and robust median estimation to reject outlier pixels (hair, shadows,
 * specular highlights, background bleed).
 */
function extractSkinToneFromRegion(
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number },
  landmarks?: Array<{ x: number; y: number }>,
): SkinTone {
  const w = input instanceof HTMLVideoElement ? input.videoWidth : input.width;
  const h = input instanceof HTMLVideoElement ? input.videoHeight : input.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(input, 0, 0, w, h);

  // ── Step 1: Build a tight sampling mask ──
  // If we have 68-point landmarks, build an elliptical mask from the cheek
  // and forehead points (indices 1-15 = jaw, 27-30 = nose bridge) to sample
  // only actual skin. Otherwise fall back to the inner 40% of the bbox which
  // is tighter than the old 60%.
  let sx: number, sy: number, sw: number, sh: number;
  let landmarkMask: Array<{ x: number; y: number }> | null = null;

  if (landmarks && landmarks.length >= 68) {
    // Use cheek regions (landmarks 1-5 left cheek, 11-15 right cheek)
    // and nose bridge (27-30) to define skin-only sample areas
    const cheekPts = [
      ...landmarks.slice(1, 6),   // left jaw/cheek
      ...landmarks.slice(11, 16), // right jaw/cheek
      ...landmarks.slice(27, 31), // nose bridge
      landmarks[30],              // nose tip
    ];
    landmarkMask = cheekPts;
    // Bounding rect of cheek points
    const xs = cheekPts.map(p => p.x);
    const ys = cheekPts.map(p => p.y);
    sx = Math.max(0, Math.floor(Math.min(...xs)));
    sy = Math.max(0, Math.floor(Math.min(...ys)));
    sw = Math.min(Math.ceil(Math.max(...xs)) - sx, w - sx);
    sh = Math.min(Math.ceil(Math.max(...ys)) - sy, h - sy);
  } else {
    // Tight inner 40% of bbox (forehead-to-chin center strip)
    const cx = box.x + box.width * 0.3;
    const cy = box.y + box.height * 0.2;
    const cw = box.width * 0.4;
    const ch = box.height * 0.45;
    sx = Math.max(0, Math.floor(cx));
    sy = Math.max(0, Math.floor(cy));
    sw = Math.min(Math.floor(cw), w - sx);
    sh = Math.min(Math.floor(ch), h - sy);
  }

  if (sw <= 0 || sh <= 0) {
    return { h: 25, s: 40, l: 55, category: "medium" };
  }

  const imageData = ctx.getImageData(sx, sy, sw, sh);
  const data = imageData.data;

  // ── Step 2: Grey-World illuminant estimation ──
  // Compute the average R, G, B across the WHOLE face bbox to estimate
  // the scene illuminant, then scale channels so the average becomes neutral
  // grey. This removes warm/cool colour casts from artificial lighting.
  const fullSx = Math.max(0, Math.floor(box.x));
  const fullSy = Math.max(0, Math.floor(box.y));
  const fullSw = Math.min(Math.ceil(box.width), w - fullSx);
  const fullSh = Math.min(Math.ceil(box.height), h - fullSy);
  const fullData = ctx.getImageData(fullSx, fullSy, fullSw, fullSh).data;

  let gR = 0, gG = 0, gB = 0, gN = 0;
  for (let i = 0; i < fullData.length; i += 8) {
    gR += fullData[i]; gG += fullData[i + 1]; gB += fullData[i + 2]; gN++;
  }
  const gAvg = (gR + gG + gB) / (3 * gN || 1);
  const scaleR = gAvg / (gR / gN || 1);
  const scaleG = gAvg / (gG / gN || 1);
  const scaleB = gAvg / (gB / gN || 1);

  // ── Step 3: Collect skin-likely pixels with colour-constancy correction ──
  const rVals: number[] = [];
  const gVals: number[] = [];
  const bVals: number[] = [];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue; // Skip transparent pixels

    const brightness = (r + g + b) / 3;
    if (brightness < 30 || brightness > 235) continue; // discard extremes

    // Skin-colour heuristic: human skin in RGB has R > G > B and is not
    // strongly saturated blue/green. This rejects hair, lips, eyebrows.
    if (r < g || g < b * 0.7) continue;
    // Reject very saturated non-skin (e.g. red lips, blue background)
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    if (maxC > 0 && (maxC - minC) / maxC > 0.65) continue;

    // If we have landmark mask, check distance to nearest cheek point
    if (landmarkMask) {
      const px = sx + (i / 4) % sw;
      const py = sy + Math.floor((i / 4) / sw);
      const r2 = box.width * 0.15; // radius tolerance
      const inMask = landmarkMask.some(
        lm => Math.abs(lm.x - px) < r2 * 2 && Math.abs(lm.y - py) < r2 * 2,
      );
      if (!inMask) continue;
    }

    // Apply grey-world correction
    rVals.push(Math.min(255, r * scaleR));
    gVals.push(Math.min(255, g * scaleG));
    bVals.push(Math.min(255, b * scaleB));
  }

  if (rVals.length < 10) {
    return { h: 25, s: 40, l: 55, category: "medium" };
  }

  // ── Step 4: Robust median estimation ──
  // Median is far more resistant to outliers (stray hair/shadow pixels)
  // than the arithmetic mean.
  rVals.sort((a, b) => a - b);
  gVals.sort((a, b) => a - b);
  bVals.sort((a, b) => a - b);
  const mid = Math.floor(rVals.length / 2);
  const medR = rVals[mid] / 255;
  const medG = gVals[mid] / 255;
  const medB = bVals[mid] / 255;

  // RGB to HSL conversion
  const maxV = Math.max(medR, medG, medB);
  const minV = Math.min(medR, medG, medB);
  const l = (maxV + minV) / 2;
  let hue = 0, sat = 0;

  if (maxV !== minV) {
    const d = maxV - minV;
    sat = l > 0.5 ? d / (2 - maxV - minV) : d / (maxV + minV);
    if (maxV === medR) hue = ((medG - medB) / d + (medG < medB ? 6 : 0)) / 6;
    else if (maxV === medG) hue = ((medB - medR) / d + 2) / 6;
    else hue = ((medR - medG) / d + 4) / 6;
  }

  const hDeg = Math.round(hue * 360);
  const sPct = Math.round(sat * 100);
  const lPct = Math.round(l * 100);

  return {
    h: hDeg,
    s: sPct,
    l: lPct,
    category: classifySkinTone(lPct, sPct),
  };
}

/**
 * Extract a 128-float face descriptor AND skin tone from an image.
 * Returns null if no face is detected.
 */
export async function extractDescriptor(
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<FaceExtractionResult | null> {
  await loadFaceModels();
  const faceapi = await getFaceApi();

  // Multi-pass: try different input sizes and thresholds (from strict to lenient)
  const passes: Array<{ inputSize: number; scoreThreshold: number }> = [
    { inputSize: 416, scoreThreshold: 0.5 },
    { inputSize: 512, scoreThreshold: 0.4 },
    { inputSize: 320, scoreThreshold: 0.35 },
    { inputSize: 608, scoreThreshold: 0.3 },
    { inputSize: 416, scoreThreshold: 0.2 },
  ];

  // First try with the original input
  for (const { inputSize, scoreThreshold } of passes) {
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });
    const result = await faceapi
      .detectSingleFace(input, opts)
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (result?.descriptor) {
      const lmPts = result.landmarks.positions.map((p: any) => ({ x: p.x ?? p._x, y: p.y ?? p._y }));
      const skinTone = extractSkinToneFromRegion(input, result.detection.box, lmPts);
      return { descriptor: Array.from(result.descriptor), skinTone };
    }
  }

  // If all passes failed, try with a brightness/contrast-normalized copy
  const enhanced = enhanceImage(input);
  if (enhanced) {
    for (const { inputSize, scoreThreshold } of passes) {
      const opts = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });
      const result = await faceapi
        .detectSingleFace(enhanced, opts)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (result?.descriptor) {
        // Use original input for skin tone (enhanced has altered colors)
        const lmPts = result.landmarks.positions.map((p: any) => ({ x: p.x ?? p._x, y: p.y ?? p._y }));
        const skinTone = extractSkinToneFromRegion(input, result.detection.box, lmPts);
        return { descriptor: Array.from(result.descriptor), skinTone };
      }
    }
  }

  return null;
}

/**
 * Create a brightness/contrast-enhanced copy of the image on a canvas.
 * Helps with low-light or washed-out photos.
 */
function enhanceImage(
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): HTMLCanvasElement | null {
  try {
    const w = input instanceof HTMLVideoElement ? input.videoWidth : input.width;
    const h = input instanceof HTMLVideoElement ? input.videoHeight : input.height;
    if (!w || !h) return null;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Draw original
    ctx.drawImage(input, 0, 0, w, h);

    // Apply brightness + contrast boost via CSS filter on a second pass
    ctx.filter = "brightness(1.3) contrast(1.4)";
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = "none";

    return canvas;
  } catch {
    return null;
  }
}

/** Euclidean distance between two equally-sized number arrays. */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Convert a face-api distance (typical range 0.3–1.0) into a percent
 * "resemblance" score. Smaller distance = higher score.
 * 0.3 distance ≈ 95%, 0.6 ≈ 50%, 1.0 ≈ 5%.
 */
export function distanceToSimilarity(distance: number): number {
  // Non-linear mapping for more meaningful percentages:
  // distance 0.0 → 98%, 0.3 → 90%, 0.5 → 65%, 0.7 → 40%, 1.0 → 10%
  // Uses a sigmoid-like curve centered around 0.5 distance
  const normalized = Math.max(0, Math.min(1.2, distance));
  const pct = Math.round(98 * Math.exp(-2.5 * normalized * normalized));
  return Math.max(5, Math.min(98, pct));
}