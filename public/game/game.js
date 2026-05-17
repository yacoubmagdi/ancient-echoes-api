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
  const reader = new FileReader();
  reader.onload = () => {
    state.fileDataUrl = reader.result;
    $("preview-img").src = state.fileDataUrl;
    $("preview-wrap").classList.remove("hidden");
    refreshStartButton();
  };
  reader.readAsDataURL(file);
});

$("btn-start").addEventListener("click", () => {
  setError("");
  runAnalysis().catch((err) => {
    console.error(err);
    show("start");
    setError(err.message || "Something went wrong. Try a clearer photo.");
  });
});

$("btn-restart").addEventListener("click", () => {
  show("start");
  setError("");
});

$("btn-share").addEventListener("click", () => {
  const name = $("result-name").textContent;
  const sim  = $("sim-value").textContent;
  const msg  = `I'm ${sim} ${name} on Ancient Echoes!`;
  if (window.FBInstant && FBInstant.shareAsync) {
    FBInstant.shareAsync({
      intent: "SHARE",
      image: state.fileDataUrl,
      text: msg,
    }).catch(() => {});
  } else if (navigator.share) {
    navigator.share({ title: "Ancient Echoes", text: msg }).catch(() => {});
  } else {
    alert(msg);
  }
});

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
