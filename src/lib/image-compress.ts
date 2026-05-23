/**
 * Mobile-optimised image normaliser.
 *
 * Goals (in priority order):
 *  1. Don't OOM on iOS Safari. Avoid `FileReader.readAsDataURL` (base64 inflates
 *     by 33% and is kept in heap for the entire decode). Use `createImageBitmap`
 *     which decodes off-thread and respects EXIF orientation.
 *  2. Honour EXIF orientation. iPhone portrait photos carry orientation=6
 *     (rotate 90° CW). Without this, face-api sees a sideways face and returns
 *     null on a perfectly good selfie.
 *  3. Convert HEIC/HEIF (iPhone) → JPEG only when the browser can't decode it
 *     natively. iOS Safari 17+ can; Android Chrome cannot.
 *  4. Avoid double-decoding: callers can use `normalizeForFaceApi` to get both
 *     the upload File AND the decoded bitmap in one pass.
 */

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

async function heicToJpeg(file: File): Promise<File> {
  const t0 = performance.now();
  console.info("[upload] step=heic-convert-start", { size: file.size, name: file.name });
  try {
    const mod = await import("heic2any");
    const heic2any = (mod as { default: (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]> }).default;
    // Use 0.7 quality — heic2any allocates a full RGBA buffer regardless, so
    // the only saving is in the output blob, but lower quality also means
    // less work for the subsequent canvas re-encode.
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.7 });
    const blob = Array.isArray(out) ? out[0] : out;
    const f = new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    console.info("[upload] step=heic-convert-done", {
      outSize: f.size,
      ms: Math.round(performance.now() - t0),
    });
    return f;
  } catch (e) {
    console.warn("[upload] FAIL stage=heic-convert", e);
    return file;
  }
}

type Decoded = {
  width: number;
  height: number;
  drawable: CanvasImageSource;
  cleanup: () => void;
};

/**
 * Try the fast path first: `createImageBitmap(blob, { imageOrientation: "from-image" })`.
 * Falls back to `<img>` + object URL on browsers that don't support the options
 * argument (older iOS Safari, some Facebook in-app browsers).
 */
async function decodeBlob(blob: Blob): Promise<Decoded> {
  // Path A — createImageBitmap with EXIF orientation. Off-thread, no base64.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      if (bitmap.width && bitmap.height) {
        return {
          width: bitmap.width,
          height: bitmap.height,
          drawable: bitmap,
          cleanup: () => bitmap.close?.(),
        };
      }
      bitmap.close?.();
    } catch (e) {
      console.warn("[upload] createImageBitmap failed, falling back to <img>", e);
    }
  }

  // Path B — object URL + <img>. Cheaper than data URL; no base64 inflation.
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  // Hint the renderer to apply EXIF orientation (Safari 13.1+, Chrome 81+).
  img.style.imageOrientation = "from-image";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("This image format isn't supported on your device. Try JPG or PNG."));
    img.src = url;
  });
  if (typeof img.decode === "function") {
    try { await img.decode(); } catch { /* ignore */ }
  }
  if (!img.naturalWidth || !img.naturalHeight) {
    URL.revokeObjectURL(url);
    throw new Error("Image appears to be corrupted.");
  }
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    drawable: img,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

/**
 * Returns both the compressed JPEG File AND the decoded image, so callers
 * don't have to decode a second time before running face-api.
 */
export async function normalizeForFaceApi(
  file: File,
  maxBytes = 1 * 1024 * 1024,
  maxDim = 1200,
): Promise<{ file: File; image: HTMLImageElement | ImageBitmap }> {
  if (!file || file.size === 0) {
    throw new Error("Empty or unreadable image file.");
  }
  console.info("[upload] step=select", {
    name: file.name,
    size: file.size,
    type: file.type,
  });

  let working = file;

  // Decode. Try native first (free for non-HEIC and for iOS Safari on HEIC);
  // only fall back to heic2any if native decode fails on a HEIC file.
  let decoded: Decoded;
  try {
    decoded = await decodeBlob(working);
  } catch (nativeErr) {
    if (!isHeic(working)) throw nativeErr;
    console.info("[upload] native HEIC decode failed, converting via heic2any");
    working = await heicToJpeg(working);
    decoded = await decodeBlob(working);
  }
  console.info("[upload] step=decode", { w: decoded.width, h: decoded.height });

  // Re-use the same canvas across encode attempts so we don't allocate a fresh
  // full-resolution buffer every iteration.
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    decoded.cleanup();
    throw new Error("Canvas is not available on this device.");
  }

  const tryEncode = (dim: number, quality: number): Promise<Blob | null> => {
    const ratio = Math.min(1, dim / Math.max(decoded.width, decoded.height));
    const w = Math.max(1, Math.round(decoded.width * ratio));
    const h = Math.max(1, Math.round(decoded.height * ratio));
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(decoded.drawable, 0, 0, w, h);
    return new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
  };

  const dims = [maxDim, 1000, 900, 800, 640];
  const qualities = [0.8, 0.72, 0.65, 0.55, 0.45];
  for (const d of dims) {
    for (const q of qualities) {
      const blob = await tryEncode(d, q);
      if (blob && blob.size <= maxBytes) {
        const outFile = new File(
          [blob],
          working.name.replace(/\.[^.]+$/, "") + ".jpg",
          { type: "image/jpeg", lastModified: Date.now() },
        );
        console.info("[upload] step=encode", { dim: d, q, outBytes: blob.size });
        // Return the SAME decoded bitmap/img — caller uses this for face-api,
        // avoiding a second full-resolution decode of the JPEG we just wrote.
        return { file: outFile, image: decoded.drawable as HTMLImageElement | ImageBitmap };
      }
    }
  }
  // Last resort: smallest encode we can manage.
  const last = await tryEncode(640, 0.4);
  if (last) {
    console.warn("[upload] encode fell through to last-resort");
    const outFile = new File(
      [last],
      working.name.replace(/\.[^.]+$/, "") + ".jpg",
      { type: "image/jpeg", lastModified: Date.now() },
    );
    return { file: outFile, image: decoded.drawable as HTMLImageElement | ImageBitmap };
  }
  // Could not encode at all — return the original and let face-api try anyway.
  return { file: working, image: decoded.drawable as HTMLImageElement | ImageBitmap };
}

/** Back-compat wrapper for callers that only need the compressed File. */
export async function compressImage(
  file: File,
  maxBytes = 1 * 1024 * 1024,
  maxDim = 1200,
): Promise<File> {
  const { file: out } = await normalizeForFaceApi(file, maxBytes, maxDim);
  return out;
}