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
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing env"); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model";
const MODEL_DIR = "/tmp/face-models2";

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const getter = url.startsWith("https") ? https : http;
    getter.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuf(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

async function loadModels() {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  
  // Download manifest + shards, then create .bin files that loadFromDisk expects
  const modelSets = [
    { name: "tiny_face_detector_model", shards: 1 },
    { name: "face_landmark_68_model", shards: 1 },
    { name: "face_recognition_model", shards: 2 },
  ];

  for (const ms of modelSets) {
    // Download manifest
    const manifestPath = path.join(MODEL_DIR, `${ms.name}-weights_manifest.json`);
    if (!fs.existsSync(manifestPath)) {
      console.log(`Downloading ${ms.name} manifest...`);
      const buf = await fetchBuf(`${MODEL_URL}/${ms.name}-weights_manifest.json`);
      fs.writeFileSync(manifestPath, buf);
    }

    // Download shards and concatenate into .bin
    const binPath = path.join(MODEL_DIR, `${ms.name}.bin`);
    if (!fs.existsSync(binPath)) {
      const shardBuffers = [];
      for (let i = 1; i <= ms.shards; i++) {
        console.log(`Downloading ${ms.name}-shard${i}...`);
        const buf = await fetchBuf(`${MODEL_URL}/${ms.name}-shard${i}`);
        shardBuffers.push(buf);
      }
      fs.writeFileSync(binPath, Buffer.concat(shardBuffers));
    }
  }

  await faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_DIR);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR);
  console.log("Models loaded.");
}

async function loadImage(url) {
  const buf = await fetchBuf(url);
  const img = new Image();
  img.src = buf;
  return img;
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

  const { data: personas, error } = await supabase
    .from("personas")
    .select("id, name, image_url")
    .is("face_descriptor", null)
    .order("name");

  if (error) { console.error("DB error:", error.message); process.exit(1); }
  console.log(`Found ${personas.length} personas without face_descriptor.`);

  let success = 0, failed = 0;
  const failedNames = [];
  
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    try {
      process.stdout.write(`[${i+1}/${personas.length}] ${p.name}... `);
      const img = await loadImage(p.image_url);
      const descriptor = await extractDescriptor(img);
      
      if (!descriptor) {
        console.log("NO_FACE");
        failed++;
        failedNames.push(p.name);
        continue;
      }

      const { error: updateErr } = await supabase
        .from("personas")
        .update({ face_descriptor: descriptor })
        .eq("id", p.id);

      if (updateErr) {
        console.log(`DB_ERR: ${updateErr.message}`);
        failed++;
        failedNames.push(p.name);
      } else {
        console.log("OK");
        success++;
      }
    } catch (e) {
      console.log(`ERR: ${e.message}`);
      failed++;
      failedNames.push(p.name);
    }
  }

  console.log(`\nDone! Success: ${success}, Failed: ${failed}, Total: ${personas.length}`);
  if (failedNames.length > 0) console.log("Failed:", failedNames.join(", "));
}

main().catch(console.error);
