// Browser-side face-api.js wrapper.
// IMPORTANT: face-api auto-detects Node and tries to require @tensorflow/tfjs-node
// during SSR. We must keep all imports lazy and client-only.
type FaceApi = typeof import("@vladmandic/face-api");

const MODEL_URL = "/models";
let loadingPromise: Promise<FaceApi> | null = null;

function ensureBrowser() {
  if (typeof window === "undefined") {
    throw new Error("face-api can only be used in the browser");
  }
}

async function getFaceApi(): Promise<FaceApi> {
  ensureBrowser();
  // Dynamic import — only evaluated in the browser, never during SSR.
  return await import("@vladmandic/face-api");
}

export async function loadFaceModels(): Promise<void> {
  if (loadingPromise) {
    await loadingPromise;
    return;
  }
  loadingPromise = (async () => {
    const faceapi = await getFaceApi();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    return faceapi;
  })();
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
 */
export async function extractDescriptor(
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<number[] | null> {
  await loadFaceModels();
  const faceapi = await getFaceApi();
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.5,
  });
  const result = await faceapi
    .detectSingleFace(input, options)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!result || !result.descriptor) return null;
  return Array.from(result.descriptor);
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
  // Linear-ish map clamped 5–98%.
  const pct = Math.round((1 - distance) * 100);
  return Math.max(5, Math.min(98, pct));
}