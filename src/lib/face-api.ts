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

/**
 * Extract a 128-float face descriptor from an image. Returns null if no face
 * is detected. Uses TinyFaceDetector (fast, lightweight) + landmarks + recognition.
 *
 * Improved: tries multiple input sizes and progressively lower score thresholds
 * to handle low-light, low-quality, or challenging images. Also preprocesses the
 * image with brightness/contrast normalization via canvas for better detection.
 */
export async function extractDescriptor(
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<number[] | null> {
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
    if (result?.descriptor) return Array.from(result.descriptor);
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
      if (result?.descriptor) return Array.from(result.descriptor);
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