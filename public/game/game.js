/* Ancient Echoes — Facebook Instant Games standalone client.
   Same flow as the React app: name + photo -> 128d face descriptor
   -> POST to Lovable backend -> show top match. */

const APP_BASE = (() => {
  try {
    if (window.location && /^https?:$/.test(window.location.protocol)) {
      return window.location.origin;
    }
  } catch (_) {}
  return "https://ancient-echoes-api.lovable.app";
})();
const MODELS_URL = "./models";
const ANALYZE_URL = APP_BASE + "/api/public/hooks/game-analyze";
const SAVE_URL = APP_BASE + "/api/public/hooks/save-result";

const $ = (id) => document.getElementById(id);
const screens = {
  start:   $("screen-start"),
  loading: $("screen-loading"),
  result:  $("screen-result"),
};
function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}
function setStep(msg) { $("loading-step").textContent = msg; }
function setError(msg) { $("form-error").textContent = msg || ""; }

let state = {
  name: "",
  fileDataUrl: null,
  modelsLoaded: false,
  lastResult: null,
  shareUrl: null,
};

/* ---------- FB Instant Games bootstrap (optional) ---------- */
function fbBoot() {
  if (!window.FBInstant) return Promise.resolve();
  return FBInstant.initializeAsync()
    .then(() => {
      let p = 0;
      const i = setInterval(() => {
        p += 20;
        FBInstant.setLoadingProgress(Math.min(p, 100));
        if (p >= 100) {
          clearInterval(i);
          FBInstant.startGameAsync().catch(() => {});
        }
      }, 80);
    })
    .catch(() => {});
}

/* ---------- Form ---------- */
function refreshStartButton() {
  $("btn-start").disabled = !(state.name.trim() && state.fileDataUrl);
}

$("user-name").addEventListener("input", (e) => {
  state.name = e.target.value;
  refreshStartButton();
});

$("user-photo").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  setError("");
  normalizeImage(file)
    .then((dataUrl) => {
      state.fileDataUrl = dataUrl;
      $("preview-img").src = dataUrl;
      $("preview-wrap").classList.remove("hidden");
      refreshStartButton();
    })
    .catch((err) => {
      console.error("[upload] normalize failed:", err);
      state.fileDataUrl = null;
      $("preview-wrap").classList.add("hidden");
      refreshStartButton();
      setError(err.message || "Could not read that photo. Try JPG or PNG.");
    });
});

$("btn-start").addEventListener("click", () => {
  setError("");
  runAnalysis().catch((err) => {
    console.error("[analysis] failed:", err);
    show("start");
    setError(err.message || "Something went wrong. Try a clearer photo.");
  });
});

$("btn-restart").addEventListener("click", () => {
  show("start");
  setError("");
});

$("btn-share").addEventListener("click", () => {
  shareResult().catch((e) => console.error(e));
});

async function buildShareImage() {
  const userImg  = await loadImg($("result-user-img").src);
  const matchImg = await loadImg($("result-match-img").src);
  const name     = $("result-name").textContent;
  const category = $("result-category").textContent;
  const sim      = $("sim-value").textContent;

  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background
  const grad = ctx.createRadialGradient(W/2, 200, 100, W/2, H/2, W);
  grad.addColorStop(0, "#3a2410");
  grad.addColorStop(1, "#1a120a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = "#d4a84c";
  ctx.font = "bold 56px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("Ancient Echoes", W/2, 110);

  // Two portraits
  const size = 360;
  const y = 200;
  const xLeft  = W/2 - size - 40;
  const xRight = W/2 + 40;

  const drawPortrait = (img, x, label) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
    ctx.strokeStyle = "#d4a84c";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI*2);
    ctx.stroke();
    ctx.fillStyle = "#f5ecd6";
    ctx.font = "32px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + size/2, y + size + 50);
  };
  drawPortrait(userImg, xLeft, "You");
  drawPortrait(matchImg, xRight, name);

  // Match name + similarity
  ctx.fillStyle = "#f0d78c";
  ctx.font = "bold 64px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(name, W/2, 720);

  ctx.fillStyle = "#b6a486";
  ctx.font = "italic 36px Georgia, serif";
  ctx.fillText(category, W/2, 770);

  ctx.fillStyle = "#c44a2a";
  ctx.font = "bold 96px Georgia, serif";
  ctx.fillText(sim + " match", W/2, 900);

  ctx.fillStyle = "#b6a486";
  ctx.font = "28px Georgia, serif";
  ctx.fillText("ancient-echoes-api.lovable.app", W/2, 1020);

  return canvas.toDataURL("image/jpeg", 0.9);
}

async function shareResult() {
  const name = $("result-name").textContent;
  const sim  = $("sim-value").textContent;
  const msg  = `I'm ${sim} ${name} on Ancient Echoes!`;

  let image;
  try { image = await buildShareImage(); }
  catch (e) { console.warn("share image build failed", e); image = state.fileDataUrl; }

  if (window.FBInstant && FBInstant.shareAsync) {
    FBInstant.shareAsync({ intent: "SHARE", image, text: msg }).catch(()=>{});
    return;
  }

  // Make sure we have a shareable URL that unfurls with the result image on Facebook/WhatsApp/etc.
  const shareUrl = await saveAndGetShareUrl();

  // 1) Try Web Share with the actual image file (best on mobile)
  try {
    const blob = await (await fetch(image)).blob();
    const file = new File([blob], "ancient-echoes.jpg", { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Ancient Echoes",
        text: msg,
        url: shareUrl || undefined,
      });
      return;
    }
  } catch (_) {}

  // 2) Web Share with URL only — Facebook/WhatsApp will unfurl the OG image
  if (shareUrl && navigator.share) {
    try {
      await navigator.share({ title: "Ancient Echoes", text: msg, url: shareUrl });
      return;
    } catch (_) {}
  }

  // 2.5) Browser fallback for desktop/embedded previews: open our own redirect route
  if (shareUrl) {
    const redirectUrl = `${APP_BASE}/api/public/hooks/share-facebook?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(msg)}`;
    try {
      window.top.location.href = redirectUrl;
      return;
    } catch (_) {
      try {
        window.open(redirectUrl, "_blank", "noopener,noreferrer");
        return;
      } catch (_) {}
    }
  }

  // 3) Desktop fallback: copy URL to clipboard + download the image
  if (shareUrl) {
    try { await navigator.clipboard.writeText(shareUrl); alert("Share link copied! Paste it on Facebook — it will show your result image.\n\n" + shareUrl); }
    catch { window.prompt("Copy this share link:", shareUrl); }
  }
  const a = document.createElement("a");
  a.href = image;
  a.download = "ancient-echoes.jpg";
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- Face descriptor (face-api.js) ---------- */
async function ensureModels() {
  if (state.modelsLoaded) return;
  setStep("Loading face models…");
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL);
  state.modelsLoaded = true;
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function extractDescriptor(dataUrl) {
  const img = await loadImg(dataUrl);
  const detection = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection) throw new Error("No face detected. Please use a clear front-facing photo.");
  return Array.from(detection.descriptor);
}

/* ---------- Main flow ---------- */
async function runAnalysis() {
  show("loading");
  await ensureModels();

  setStep("Reading your face…");
  const descriptor = await extractDescriptor(state.fileDataUrl);

  setStep("Searching the archives…");
  const resp = await fetch(ANALYZE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ descriptor, lang: "en" }),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) throw new Error(data.error || "Match service failed.");

  renderResult(data);
  show("result");
}

function renderResult(data) {
  const name = data.match_name || data.name || "Unknown";
  const category = data.category || "";
  const similarity = Math.round(Number(data.similarity) || 0);
  const matchImg = data.image_url || "";
  const desc = data.description || "";

  $("result-greeting").textContent = `${state.name.trim()}, your echo is`;
  $("result-name").textContent = name;
  $("result-category").textContent = category;
  $("result-user-img").src = state.fileDataUrl;
  $("result-match-img").src = matchImg;
  $("result-match-label").textContent = name;
  $("sim-value").textContent = similarity + "%";
  $("result-description").textContent = desc;

  // Animate bar after paint
  requestAnimationFrame(() => {
    $("sim-fill").style.width = similarity + "%";
  });

  state.lastResult = { match_name: name, category, similarity, description: desc, match_image_url: matchImg };
  state.shareUrl = null;
  // Fire-and-forget: save to backend so the share URL unfurls with OG image
  saveAndGetShareUrl().catch((e) => console.warn("save failed", e));
}

async function saveAndGetShareUrl() {
  if (!state.lastResult || !state.lastResult.match_image_url) return null;
  if (state.shareUrl) return state.shareUrl;
  try {
    const r = await fetch(SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.lastResult),
    });
    if (!r.ok) return null;
    const { id } = await r.json();
    if (!id) return null;
    state.shareUrl = `${APP_BASE}/api/public/hooks/share-page?id=${id}`;
    return state.shareUrl;
  } catch { return null; }
}

/* ---------- Boot ---------- */
fbBoot();
show("start");

/* ---------- Facebook Instant Games guard ----------
   The Instant Games WebView does NOT support <input type="file">. When we
   detect the IG container, swap the file input for a hybrid UI:
    1. "Use my Facebook photo" -> FBInstant.player.getPhoto() -> same
       normalize + face-api pipeline as a normal upload.
    2. "Choose another photo"  -> FBInstant.openLink(...) opens the same
       experience in the system browser, where the file input works.
*/
(function guardInstantGames() {
  if (!window.FBInstant || !FBInstant.getPlatform) return;
  try {
    const plat = FBInstant.getPlatform && FBInstant.getPlatform();
    // 'IOS' / 'ANDROID' / 'WEB' / 'MOBILE_WEB'. IOS/ANDROID = native IG WebView.
    if (plat !== "IOS" && plat !== "ANDROID") return;

    const input = document.getElementById("user-photo");
    const inputLabel = input && input.closest("label.field");
    const fbActions = document.getElementById("fb-actions");
    if (inputLabel) inputLabel.classList.add("hidden");
    if (input) input.disabled = true;
    if (fbActions) fbActions.classList.remove("hidden");

    const externalUrl = "https://ancient-echoes-api.lovable.app/game/";
    const btnExternal = document.getElementById("btn-open-external");
    if (btnExternal) btnExternal.addEventListener("click", () => {
      if (FBInstant.openLink) FBInstant.openLink(externalUrl).catch(() => {});
      else window.open(externalUrl, "_blank");
    });

    const btnFb = document.getElementById("btn-fb-photo");
    if (btnFb) btnFb.addEventListener("click", async () => {
      setError("");
      btnFb.disabled = true;
      const originalLabel = btnFb.textContent;
      btnFb.textContent = "Loading your photo…";
      try {
        if (!FBInstant.player || !FBInstant.player.getPhoto) {
          throw new Error("Facebook photo isn't available right now.");
        }
        const url = await FBInstant.player.getPhoto();
        if (!url) throw new Error("Couldn't read your Facebook photo.");
        console.info("[upload] step=fb-photo-url", { hasUrl: !!url });
        // Fetch the URL into a Blob so the same normalize pipeline runs.
        const resp = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!resp.ok) throw new Error("Couldn't download your Facebook photo.");
        const blob = await resp.blob();
        const file = new File(
          [blob],
          "facebook-photo.jpg",
          { type: blob.type || "image/jpeg", lastModified: Date.now() },
        );
        const dataUrl = await normalizeImage(file);
        state.fileDataUrl = dataUrl;
        $("preview-img").src = dataUrl;
        $("preview-wrap").classList.remove("hidden");
        refreshStartButton();
      } catch (e) {
        console.error("[upload] FAIL stage=fb-photo", e);
        setError(e.message || "Couldn't use your Facebook photo. Try 'Choose another photo' instead.");
      } finally {
        btnFb.disabled = false;
        btnFb.textContent = originalLabel;
      }
    });
  } catch (_) { /* not in IG context */ }
})();

/* ---------- Image normalisation (HEIC convert + resize + compress) ----------
   Mobile-safe pipeline:
    - Prefer createImageBitmap({ imageOrientation: "from-image" }) — decodes
      off-thread AND auto-rotates iPhone portrait photos (EXIF orientation 6).
    - Avoid FileReader.readAsDataURL: base64 inflates the file 33% and is
      held in heap for the full decode → OOM on low-RAM iPhones.
    - Only fall back to heic2any if the native decoder rejects a HEIC file
      (iOS Safari 17+ decodes HEIC natively; Android Chrome does not).
*/
function isHeic(file) {
  const n = (file.name || "").toLowerCase();
  const t = (file.type || "").toLowerCase();
  return t === "image/heic" || t === "image/heif" ||
         t === "image/heic-sequence" || t === "image/heif-sequence" ||
         n.endsWith(".heic") || n.endsWith(".heif");
}

let heic2anyPromise = null;
function loadHeic2any() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (heic2anyPromise) return heic2anyPromise;
  heic2anyPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    // Newer build than 0.0.4 — handles iPhone 14/15 HDR HEIC variants.
    s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    s.onload = () => resolve(window.heic2any);
    s.onerror = () => reject(new Error("Could not load HEIC support. Check your connection."));
    document.head.appendChild(s);
  });
  return heic2anyPromise;
}

async function decodeBlob(blob) {
  // Path A — createImageBitmap with EXIF orientation. Off-thread, no base64.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      if (bmp.width && bmp.height) {
        return { drawable: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close && bmp.close() };
      }
      bmp.close && bmp.close();
    } catch (e) {
      console.warn("[upload] createImageBitmap failed, falling back to <img>", e);
    }
  }
  // Path B — object URL + <img>. Cheaper than data URL; no base64 inflation.
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  img.style.imageOrientation = "from-image";
  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("This image format isn't supported on your device. Try JPG or PNG."));
    img.src = url;
  });
  if (typeof img.decode === "function") { try { await img.decode(); } catch (_) {} }
  if (!img.naturalWidth || !img.naturalHeight) {
    URL.revokeObjectURL(url);
    throw new Error("Image is empty or corrupted.");
  }
  return { drawable: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
}

async function normalizeImage(file) {
  if (!file || file.size === 0) throw new Error("Empty file.");
  console.info("[upload] step=select", { name: file.name, size: file.size, type: file.type });

  // Try native decode first (works for JPEG/PNG/WEBP everywhere, and HEIC on
  // iOS Safari 17+). Only invoke heic2any if HEIC and native decode failed.
  let blob = file;
  let decoded;
  try {
    decoded = await decodeBlob(blob);
  } catch (nativeErr) {
    if (!isHeic(blob)) throw nativeErr;
    $("preview-wrap").classList.add("hidden");
    $("form-error").textContent = "Converting iPhone photo… one moment.";
    try {
      const heic2any = await loadHeic2any();
      const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.7 });
      blob = Array.isArray(out) ? out[0] : out;
    } catch (e) {
      console.warn("[upload] FAIL stage=heic-convert", e);
      throw new Error("Could not read this iPhone photo. Try saving it as JPG first.");
    }
    $("form-error").textContent = "";
    decoded = await decodeBlob(blob);
  }
  console.info("[upload] step=decode", { w: decoded.width, h: decoded.height });

  const MAX_DIM = 1200;
  const MAX_BYTES = 1 * 1024 * 1024;
  const dims = [MAX_DIM, 1000, 900, 800, 640];
  const qualities = [0.8, 0.72, 0.65, 0.55, 0.45];

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    decoded.cleanup();
    throw new Error("Canvas is not available on this device.");
  }
  const tryEncode = (dim, q) => new Promise((res) => {
    const ratio = Math.min(1, dim / Math.max(decoded.width, decoded.height));
    const w = Math.max(1, Math.round(decoded.width * ratio));
    const h = Math.max(1, Math.round(decoded.height * ratio));
    canvas.width = w; canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(decoded.drawable, 0, 0, w, h);
    res(canvas.toDataURL("image/jpeg", q));
  });

  for (const d of dims) {
    for (const q of qualities) {
      const url = await tryEncode(d, q);
      if (!url) continue;
      const approxBytes = Math.floor((url.length - "data:image/jpeg;base64,".length) * 0.75);
      if (approxBytes <= MAX_BYTES) {
        console.info("[upload] step=encode", { dim: d, q, approxBytes });
        return url;
      }
    }
  }
  console.warn("[upload] encode fell through to last-resort");
  return await tryEncode(640, 0.4);
}
