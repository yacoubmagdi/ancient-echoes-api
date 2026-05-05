import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage, ImageData } from "canvas";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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
  .is("face_descriptor", null)
  .order("name")
  .limit(200);

if (error) { console.error("DB error:", error); process.exit(1); }
console.error(`Found ${personas.length} personas without descriptors`);

let ok = 0, fail = 0;
for (const p of personas) {
  try {
    const img = await loadImage(p.image_url);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    let det = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!det) {
      det = await faceapi
        .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.15 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    }

    if (!det) {
      console.error(`NO FACE: ${p.name}`);
      fail++;
      continue;
    }

    const descriptor = Array.from(det.descriptor);
    const { error: upErr } = await supabase
      .from("personas")
      .update({ face_descriptor: descriptor })
      .eq("id", p.id);
    if (upErr) { console.error(`UPDATE ERR: ${p.name}: ${upErr.message}`); fail++; }
    else { ok++; console.error(`OK: ${p.name}`); }
  } catch (e) {
    console.error(`ERROR: ${p.name}: ${e.message}`);
    fail++;
  }
}

console.log(JSON.stringify({ ok, fail, total: personas.length }));
