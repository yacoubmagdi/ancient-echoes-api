import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage, ImageData } from "canvas";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as tf from "@tensorflow/tfjs-node";
import https from "node:https";
import http from "node:http";

faceapi.env.monkeyPatch({ Canvas: createCanvas, Image: loadImage, ImageData });

const MODELS = path.resolve("/dev-server/public/models");
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);
console.error("Models loaded");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: personas, error } = await supabase
  .from("personas")
  .select("id, name, image_url")
  .in("name", ["سنفرو", "منتوحتب الثاني", "نفرتاري"]);

if (error) { console.error("DB error:", error); process.exit(1); }
console.error(`Found ${personas.length} personas`);

function fetchWithUA(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/*,*/*",
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchWithUA(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

for (const p of personas) {
  try {
    console.error(`Processing: ${p.name} -> ${p.image_url}`);
    const buf = await fetchWithUA(p.image_url);
    console.error(`  Downloaded ${buf.length} bytes`);
    
    const img = await loadImage(buf);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tensor = tf.tensor3d(
      new Uint8Array(imgData.data.buffer),
      [canvas.height, canvas.width, 4]
    ).slice([0, 0, 0], [-1, -1, 3]);

    let det = await faceapi
      .detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!det) {
      det = await faceapi
        .detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.1 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    }

    tensor.dispose();

    if (!det) {
      console.error(`  NO FACE DETECTED: ${p.name}`);
      continue;
    }

    const descriptor = Array.from(det.descriptor);
    const { error: upErr } = await supabase
      .from("personas")
      .update({ face_descriptor: descriptor })
      .eq("id", p.id);
    if (upErr) console.error(`  UPDATE ERR: ${upErr.message}`);
    else console.error(`  OK: ${p.name}`);
  } catch (e) {
    console.error(`  ERROR: ${p.name}: ${e.message}`);
  }
}
