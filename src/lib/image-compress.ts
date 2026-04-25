/**
 * Compress/resize an image file in the browser so it fits within `maxBytes`.
 * - Downscales to a max dimension (starting 2048px, decreasing on retry)
 * - Re-encodes as JPEG with decreasing quality until it fits
 * - Returns the original file if it's already small enough or not an image
 */
export async function compressImage(file: File, maxBytes = 7 * 1024 * 1024): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= maxBytes) return file;

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const tryEncode = (maxDim: number, quality: number): Promise<Blob | null> => {
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
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

  const dims = [2048, 1600, 1280, 1024, 800];
  const qualities = [0.85, 0.75, 0.65, 0.55, 0.45];
  for (const d of dims) {
    for (const q of qualities) {
      const blob = await tryEncode(d, q);
      if (blob && blob.size <= maxBytes) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    }
  }
  // Fallback: smallest attempt even if still > maxBytes
  const last = await tryEncode(800, 0.4);
  if (last) {
    return new File([last], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }
  return file;
}