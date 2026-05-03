import { createClient } from "@supabase/supabase-js";
import * as faceapi from "@vladmandic/face-api";
import canvas from "canvas";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Download model files
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model";
const MODEL_DIR = "/tmp/face-models";

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const getter = url.startsWith("https") ? https : http;
    getter.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", reject);
  });
}

async function loadModels() {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  
  const models = [
    "tiny_face_detector_model-weights_manifest.json",
    "tiny_face_detector_model-shard1",
    "face_landmark_68_model-weights_manifest.json", 
    "face_landmark_68_model-shard1",
    "face_recognition_model-weights_manifest.json",
    "face_recognition_model-shard1",
    "face_recognition_model-shard2",
  ];

  for (const m of models) {
    const dest = path.join(MODEL_DIR, m);
    if (!fs.existsSync(dest)) {
      console.log(`Downloading ${m}...`);
      await downloadFile(`${MODEL_URL}/${m}`, dest);
    }
  }

  await faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_DIR);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR);
  console.log("Models loaded.");
}

async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const getter = url.startsWith("https") ? https : http;
    getter.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return loadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error("Image load error"));
        img.src = buf;
      });
    }).on("error", reject);
  });
}

async function extractDescriptor(img) {
  const passes = [
    { inputSize: 416, scoreThreshold: 0.5 },
    { inputSize: 512, scoreThreshold: 0.4 },
    { inputSize: 320, scoreThreshold: 0.35 },
    { inputSize: 608, scoreThreshold: 0.3 },
    { inputSize: 416, scoreThreshold: 0.2 },
    { inputSize: 320, scoreThreshold: 0.15 },
  ];

  for (const { inputSize, scoreThreshold } of passes) {
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });
    const result = await faceapi.detectSingleFace(img, opts)
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (result?.descriptor) return Array.from(result.descriptor);
  }
  return null;
}

async function main() {
  await loadModels();

  // Fetch all personas without face_descriptor
  const { data: personas, error } = await supabase
    .from("personas")
    .select("id, name, image_url")
    .is("face_descriptor", null)
    .order("name");

  if (error) { console.error("DB error:", error.message); process.exit(1); }
  console.log(`Found ${personas.length} personas without face_descriptor.`);

  let success = 0, failed = 0;
  
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    try {
      process.stdout.write(`[${i+1}/${personas.length}] ${p.name}... `);
      const img = await loadImage(p.image_url);
      const descriptor = await extractDescriptor(img);
      
      if (!descriptor) {
        console.log("❌ No face detected");
        failed++;
        continue;
      }

      const { error: updateErr } = await supabase
        .from("personas")
        .update({ face_descriptor: descriptor })
        .eq("id", p.id);

      if (updateErr) {
        console.log(`❌ DB error: ${updateErr.message}`);
        failed++;
      } else {
        console.log("✅");
        success++;
      }
    } catch (e) {
      console.log(`❌ ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone! Success: ${success}, Failed: ${failed}, Total: ${personas.length}`);
}

main().catch(console.error);
