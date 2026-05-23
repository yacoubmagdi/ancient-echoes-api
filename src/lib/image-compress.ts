/** True if the file is HEIC/HEIF (iPhone camera default). Detects by MIME or extension. */
function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/**
 * Convert HEIC/HEIF to a JPEG File using `heic2any` (browser-only, dynamically
 * imported so it doesn't bloat the main bundle). Falls back to original file
 * if conversion fails or the browser already decodes HEIC natively (Safari 17+).
 */
async function heicToJpeg(file: File): Promise<File> {
  try {
    const mod = await import("heic2any");
    const heic2any = (mod as { default: (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]> }).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (e) {
    console.warn("[image-compress] HEIC conversion failed, trying original", e);
    return file;
  }
}

/**
 * Mobile-friendly image normaliser.
 * - Converts HEIC/HEIF (iPhone) to JPEG via heic2any
 * - Downscales so the largest dimension is ≤ `maxDim` (default 1200px)
 * - Re-encodes as JPEG at ~80% quality, retrying smaller until ≤ `maxBytes` (default 1 MB)
 * - Validates the file actually decodes (rejects corrupted uploads)
 * - Returns a JPEG File ready for face-api / upload
 */
export async function compressImage(
  file: File,
  maxBytes = 1 * 1024 * 1024,
  maxDim = 1200,
): Promise<File> {
  if (!file || file.size === 0) {
    throw new Error("Empty or unreadable image file.");
  }

  // 1. Convert HEIC/HEIF if needed (iPhone photos).
  let working = file;
  if (isHeic(file)) {
    working = await heicToJpeg(file);
  }

  // 2. Read as data URL.
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image file. It may be corrupted."));
    reader.readAsDataURL(working);
  });

  // 3. Decode the image. Reject corrupted/unsupported files clearly.
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("This image format isn't supported on your device. Try JPG or PNG."));
    i.src = dataUrl;
  });
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error("Image appears to be corrupted.");
  }

  const tryEncode = (dim: number, quality: number): Promise<Blob | null> => {
    const ratio = Math.min(1, dim / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  };

  // 4. Try the target dimension at ~80% first, then back off both dim and quality.
  const dims = [maxDim, 1000, 900, 800, 640];
  const qualities = [0.8, 0.72, 0.65, 0.55, 0.45];
  for (const d of dims) {
    for (const q of qualities) {
      const blob = await tryEncode(d, q);
      if (blob && blob.size <= maxBytes) {
        return new File([blob], working.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    }
  }
  // 5. Last-resort smallest attempt — better to send a slightly larger file
  //    than to fail outright.
  const last = await tryEncode(640, 0.4);
  if (last) {
    return new File([last], working.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }
  return working;
}