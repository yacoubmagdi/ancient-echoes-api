/* Ancient Echoes — Facebook Instant Games standalone client.
   Same flow as the React app: name + photo -> 128d face descriptor
   -> POST to Lovable backend -> show top match. */

const APP_BASE = "https://ancient-echoes-api.lovable.app";
const MODELS_URL = APP_BASE + "/models";
const ANALYZE_URL = APP_BASE + "/api/public/hooks/game-analyze";

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

  // Web fallback: try Web Share with file, else download
  try {
    const blob = await (await fetch(image)).blob();
    const file = new File([blob], "ancient-echoes.jpg", { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Ancient Echoes", text: msg });
      return;
    }
  } catch (_) {}

  // Download fallback
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
}

/* ---------- Boot ---------- */
fbBoot();
show("start");

/* ---------- Image normalisation (HEIC convert + resize + compress) ---------- */
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
    s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    s.onload = () => resolve(window.heic2any);
    s.onerror = () => reject(new Error("Could not load HEIC support. Check your connection."));
    document.head.appendChild(s);
  });
  return heic2anyPromise;
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read the image file."));
    r.readAsDataURL(blob);
  });
}

function decodeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error("Image is empty or corrupted."));
      } else resolve(img);
    };
    img.onerror = () => reject(new Error("This image format isn't supported on your device. Try JPG or PNG."));
    img.src = dataUrl;
  });
}

async function normalizeImage(file) {
  if (!file || file.size === 0) throw new Error("Empty file.");

  let blob = file;
  if (isHeic(file)) {
    $("preview-wrap").classList.add("hidden");
    $("form-error").textContent = "Converting iPhone photo… one moment.";
    try {
      const heic2any = await loadHeic2any();
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      blob = Array.isArray(out) ? out[0] : out;
    } catch (e) {
      console.warn("[upload] HEIC conversion failed, trying native decode", e);
    }
    $("form-error").textContent = "";
  }

  const sourceDataUrl = await readAsDataUrl(blob);
  const img = await decodeImage(sourceDataUrl);

  const MAX_DIM = 1200;
  const MAX_BYTES = 1 * 1024 * 1024;
  const dims = [MAX_DIM, 1000, 900, 800, 640];
  const qualities = [0.8, 0.72, 0.65, 0.55, 0.45];

  const tryEncode = (dim, q) => new Promise((res) => {
    const ratio = Math.min(1, dim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return res(null);
    ctx.drawImage(img, 0, 0, w, h);
    res(c.toDataURL("image/jpeg", q));
  });

  for (const d of dims) {
    for (const q of qualities) {
      const url = await tryEncode(d, q);
      if (!url) continue;
      const approxBytes = Math.floor((url.length - "data:image/jpeg;base64,".length) * 0.75);
      if (approxBytes <= MAX_BYTES) return url;
    }
  }
  return (await tryEncode(640, 0.4)) || sourceDataUrl;
}
