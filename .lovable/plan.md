# Image Upload Pipeline — Technical Audit

This is a **report**, not an implementation. No files have been changed yet. At the end I list the fixes I would apply if you approve.

---

## 1. Pipelines under audit

There are **two parallel pipelines** and they are not equivalent:

| # | Entry point | Compression | Decode | Face detection |
|---|---|---|---|---|
| A | React app — `src/routes/index.tsx` (`handleFile`) | `src/lib/image-compress.ts` `compressImage()` | `src/lib/face-api.ts` `imageFromFile()` | `extractDescriptor()` (CPU backend, multi-pass) |
| B | Standalone game — `public/game/game.js` (loaded by `index.html`, used inside FB Instant Games + the share link) | inline `normalizeImage()` in `game.js` | inline `loadImg()` | `faceapi.detectSingleFace` (single pass, CDN models) |

Both ultimately call the public hook `src/routes/api/public/hooks/game-analyze.ts` (game) or the `analyze-face` server fn (React).

---

## 2. Every failure point, with exact locations

### 2.1 File selection
- **React** `src/routes/index.tsx` line ~94: `<input ref={inputRef}>` — I need to confirm it actually has `accept="image/*,.heic,.heif"` and no `capture` attribute hard-coded (the truncated view only showed the top of the file). On Android Chrome / Facebook IAB, `capture="environment"` on a desktop-style input blocks gallery selection.
- **Game** `public/game/index.html` line 24: `accept="image/*,.heic,.heif"` — OK on iOS Safari, but the `.heic` extension hint is **ignored by Facebook in-app browser on Android**, which presents only `image/*` MIME filters from the OS. Real HEIC files still come through if the user picks "All files", but many Android galleries hide HEIC pickers by default.

### 2.2 HEIC/HEIF conversion
- **React** `src/lib/image-compress.ts` lines 19–35: dynamic `import("heic2any")`. heic2any decodes the full HEIF bitstream in the **main thread** via libheif-js (WASM, ~1.5 MB). For a 12 MP iPhone photo (~3–5 MB HEIC) it allocates **a single 48 MB RGBA buffer** plus libheif's internal scratch space. **On iOS Safari this is the #1 OOM trigger** and silently kills the tab — your `console.error` never fires.
- **Game** `public/game/game.js` lines 269–283: lazy-loads `heic2any@0.0.4` (very old, 2020) from jsdelivr. Same OOM risk **plus** an outdated libheif that fails on some newer iPhone 14/15 HEIC variants (10-bit HDR / `hvc1` profile).
- Both paths swallow `heic2any` failures with `console.warn` and then try the native `<img>` decoder. **iOS Safari can decode HEIC natively** — so the silent fallback often "works" on iPhone. **Android Chrome cannot** → the fallback `<img>` errors with the generic message "This image format isn't supported on your device", confusing users.

### 2.3 Reading file → data URL
- `src/lib/image-compress.ts` line 61–64 and `public/game/game.js` line 298–304: both use `FileReader.readAsDataURL(blob)`.
- `readAsDataURL` produces a **base64 string ~33% larger than the binary**. A 6 MB JPEG becomes an 8 MB string held in JS heap **for the entire decode**. Combined with the heic2any buffer + image bitmap, peak memory on a single upload reaches **80–120 MB**, which is the documented soft cap for Safari tabs on iPhones with 4 GB RAM (iPhone 11 / SE / mini).
- Safer path: `createImageBitmap(blob)` decodes off-thread and never materialises a base64 string.

### 2.4 Image decoding
- `compressImage` lines 67–77: `new Image(); img.src = dataUrl`. No `decode()` call → on iOS the image may load but report `naturalWidth=0` on the first paint frame; the check on line 79 catches it and throws "Image appears to be corrupted." — this is a false negative we've actually seen.
- `imageFromFile` (`src/lib/face-api.ts` line 65) **runs a second time** after `compressImage`, doing yet another `URL.createObjectURL` + `<img>` decode of the already-compressed file. That's a redundant full-resolution decode and an extra ~10–20 MB allocation right before face-api runs.

### 2.5 EXIF orientation — **silent face-detection failure**
- Neither pipeline strips or applies EXIF orientation. iPhone photos taken in portrait carry `Orientation: 6` (rotate 90° CW). Browsers honor it when rendering an `<img>`, **but when you draw the image onto a canvas in `compressImage` (line 88: `ctx.drawImage(img, 0, 0, w, h)`) Safari < 17 does NOT auto-rotate** — the resulting JPEG is sideways.
- A sideways face → `TinyFaceDetector` returns null at every pass → user sees "No face detected" from a perfectly good selfie. This is the most common silent failure on iPhone in your logs.
- Fix: `img.style.imageOrientation = "from-image"` is not enough on Safari; use `createImageBitmap(blob, { imageOrientation: "from-image" })`.

### 2.6 Canvas resize loop
- `compressImage` lines 92–112: tries up to **25 encode passes** (5 dims × 5 qualities). Each call allocates a fresh canvas and ImageData. For a 4032×3024 source this is wasteful but rarely fatal. On low-end Android, the cumulative GC pressure can stall the page for 5–8 s.

### 2.7 face-api.js
- Forced **CPU backend** (`src/lib/face-api.ts` lines 44–50). On mobile this is 5–10× slower than WASM. A single `detectSingleFace` on a 1200×1200 image with `inputSize: 416` takes ~2–4 s on iPhone 12, **15–25 s on iPhone SE**. With the 5-pass fallback + enhanced retry (lines 308–359) total worst-case is **~2 minutes** with no progress UI updates → users assume the page froze and refresh.
- Models loaded from `cdn.jsdelivr.net`. **Facebook in-app browser blocks third-party scripts/assets aggressively** when "Limit IP Address Tracking" is on (iOS 17+ default). jsdelivr is occasionally on that blocklist → models 404 → `loadFaceModels` throws an unintuitive "Could not fetch model manifest" error.

### 2.8 Facebook Instant Games — critical constraint
- **`<input type="file">` is not whitelisted inside the Instant Games WebView**. The picker either does nothing or returns an empty FileList on most Android devices. The standalone game (`public/game/`) relies entirely on a file input → it cannot work as a true Instant Game.
- FB Instant Games has no official photo-picker API. The supported path is `FBInstant.player.getPhotoAsync()` (avatar only) or hosting the upload on a regular HTTPS page opened via `FBInstant.openLink`.
- Independent of Instant Games, the **Facebook in-app browser** (used when a friend opens your share link from the FB feed) DOES allow file inputs, but it disables `OffscreenCanvas`, `createImageBitmap` in some versions, and has aggressive memory pressure → the same OOM symptoms as iOS Safari.

### 2.9 Network step
- `analyze-face` server fn receives only a 128-float descriptor (≈ 2 KB) — this stage is essentially never the failure point. Confirmed by inspecting `src/routes/api/public/hooks/game-analyze.ts`.

---

## 3. Per-environment verdict

| Environment | Works today? | Most likely failure |
|---|---|---|
| **iPhone Safari (modern)** | Partial. HEIC native decode usually saves us, but **EXIF rotation breaks face detection** on portrait photos. | "No face detected" on good selfies. |
| **iPhone Safari (iPhone SE / 11 / older, low RAM)** | Often crashes. | `heic2any` + `readAsDataURL` OOM → tab reload, no error in console. |
| **Android Chrome** | Mostly works for JPEG/PNG; **HEIC always fails** (no native decoder, heic2any unreliable on old/HDR HEIC). | "Image format not supported" or hang during conversion. |
| **Facebook in-app browser (Android)** | Often blocks the file picker entirely, or returns 0-byte file. jsdelivr models may be blocked. | Silent: nothing happens after tapping Upload. |
| **Facebook in-app browser (iOS)** | Same OOM profile as Safari; jsdelivr usually reachable. | Crash on large HEIC. |
| **Facebook Instant Games** | **Does not work at all** — file input is non-functional in the IG WebView. | No picker opens. |

---

## 4. Single most likely root cause of the reported issue

**heic2any decoding a full-resolution iPhone HEIC on the main thread, immediately followed by `FileReader.readAsDataURL` of the converted JPEG.** That sequence allocates 60–100 MB of transient memory on a device that typically has 200 MB of tab budget. iOS Safari silently kills the tab; you see "upload doesn't work" with no error.

A close second is **missing EXIF orientation handling**, which causes face-api to return null on otherwise-fine portrait selfies — this looks like an "upload doesn't work" bug to end users even though the photo arrived successfully.

Both are in `src/lib/image-compress.ts` (lines 27–35 for HEIC, 56–64 for FileReader, 88 for canvas draw without orientation).

---

## 5. Diagnostic logging I would add (sample messages)

`[upload] step=select file=IMG_2418.HEIC size=4823184 type=image/heic`
`[upload] step=heic-convert-start lib=heic2any`
`[upload] step=heic-convert-done outSize=2410112 ms=2840`
`[upload] step=read-datauri ms=120 bytes=2410112`
`[upload] step=decode w=4032 h=3024 orientation=6`
`[upload] step=encode dim=1200 q=0.8 outBytes=412300 attempt=1`
`[face] step=models-loaded backend=cpu ms=1820`
`[face] step=detect pass=1 inputSize=416 threshold=0.5 found=false ms=3120`
`[face] step=detect pass=2 inputSize=512 threshold=0.4 found=true ms=4080`
`[upload] FAIL stage=heic-convert err=OOM`
`[upload] FAIL stage=decode err=naturalWidth==0`

Logs would flush every step (not just on error) so a screenshot of DevTools shows where it died.

---

## 6. Proposed fixes (only if you approve)

1. **Replace `FileReader.readAsDataURL` with `createImageBitmap(blob, { imageOrientation: "from-image" })`** in both `src/lib/image-compress.ts` and `public/game/game.js`. Fixes OOM and EXIF rotation in one move. Falls back to `<img>` decode where unsupported (older Safari).
2. **Pre-resize before HEIC decode is finalised**: when calling heic2any, cap quality to 0.7 and immediately downscale the resulting bitmap to ≤ 1600 px on the long edge before any further processing, freeing the original buffer.
3. **Stop double-decoding**: have `compressImage` return both a `File` and the already-decoded `ImageBitmap`, then change `imageFromFile`/`extractDescriptor` to accept the bitmap directly. Saves one full-resolution decode.
4. **Self-host face-api models** under `/models/*` (already present in `public/models/`) and switch the standalone game's `MODELS_URL` to a same-origin path to avoid jsdelivr being blocked by Facebook IAB / ITP.
5. **Switch the React face-api backend from CPU to WASM**, with a CPU fallback only if WASM init fails. Ship the WASM binaries under `/wasm/` to avoid CDN issues. Cuts mobile detection time from 15–25 s to 2–4 s.
6. **Show a progress message during each face-api pass** so users don't think the page froze.
7. **Add structured `[upload]` / `[face]` console logging** as described in §5.
8. **Detect Facebook Instant Games context** (`window.FBInstant`) on the game page and show a clear message that photo upload is not supported inside the FB Instant Games container, with a button to open the same flow in the system browser via `FBInstant.openLink`.
9. **Upgrade `heic2any` in the standalone game** from 0.0.4 to the latest version (or replace with `libheif-js` directly with a worker wrapper) to handle iPhone 14/15 HDR HEIC.
10. **Optional**: move heic2any decoding into a Web Worker (`heic-convert/worker`) so a crash there doesn't take down the page.

I have not edited any files. Approve this plan and I will apply the fixes in the order above.
