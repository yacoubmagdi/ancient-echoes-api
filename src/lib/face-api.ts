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
 * Classify lightness into a Fitzpatrick-inspired skin tone category.
 */
function classifySkinTone(l: number, s: number): SkinTone["category"] {
  if (l >= 75) return "very_light";
  if (l >= 65) return "light";
  if (l >= 50) return "medium";
  if (l >= 40) return "olive";
  if (l >= 28) return "brown";
  return "dark";
}

/**
 * Extract average skin tone HSL from the face bounding box in an image.
 * Samples the central 60% of the face region to avoid hair/background.
 */
function extractSkinToneFromRegion(
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number },
): SkinTone {
  const w = input instanceof HTMLVideoElement ? input.videoWidth : input.width;
  const h = input instanceof HTMLVideoElement ? input.videoHeight : input.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(input, 0, 0, w, h);

  // Sample central 60% of face box to avoid hair/background
  const cx = box.x + box.width * 0.2;
  const cy = box.y + box.height * 0.25;
  const cw = box.width * 0.6;
  const ch = box.height * 0.5;

  const sx = Math.max(0, Math.floor(cx));
  const sy = Math.max(0, Math.floor(cy));
  const sw = Math.min(Math.floor(cw), w - sx);
  const sh = Math.min(Math.floor(ch), h - sy);

  if (sw <= 0 || sh <= 0) {
    return { h: 25, s: 40, l: 55, category: "medium" };
  }

  const imageData = ctx.getImageData(sx, sy, sw, sh);
  const data = imageData.data;

  let totalR = 0, totalG = 0, totalB = 0;
  let count = 0;

  // Sample every 4th pixel for performance
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue; // Skip transparent pixels

    // Filter out extreme values (likely background/hair)
    const brightness = (r + g + b) / 3;
    if (brightness < 20 || brightness > 245) continue;

    totalR += r;
    totalG += g;
    totalB += b;
    count++;
  }

  if (count === 0) {
    return { h: 25, s: 40, l: 55, category: "medium" };
  }

  const avgR = totalR / count / 255;
  const avgG = totalG / count / 255;
  const avgB = totalB / count / 255;

  // RGB to HSL conversion
  const max = Math.max(avgR, avgG, avgB);
  const min = Math.min(avgR, avgG, avgB);
  const l = (max + min) / 2;
  let hue = 0, sat = 0;

  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === avgR) hue = ((avgG - avgB) / d + (avgG < avgB ? 6 : 0)) / 6;
    else if (max === avgG) hue = ((avgB - avgR) / d + 2) / 6;
    else hue = ((avgR - avgG) / d + 4) / 6;
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
      const skinTone = extractSkinToneFromRegion(input, result.detection.box);
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
        const skinTone = extractSkinToneFromRegion(input, result.detection.box);
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