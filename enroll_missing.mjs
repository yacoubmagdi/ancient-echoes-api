import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage, ImageData } from "canvas";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as tf from "@tensorflow/tfjs-node";

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
    const resp = await fetch(p.image_url);
    if (!resp.ok) { console.error(`FETCH FAIL: ${p.name} (${resp.status})`); fail++; continue; }
    const buf = Buffer.from(await resp.arrayBuffer());
    
    const img = await loadImage(buf);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    
    // Convert to tensor
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tensor = tf.tensor3d(
      new Uint8Array(imgData.data.buffer),
      [canvas.height, canvas.width, 4]
    ).slice([0, 0, 0], [-1, -1, 3]); // drop alpha

    let det = await faceapi
      .detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!det) {
      det = await faceapi
        .detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.15 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    }

    tensor.dispose();

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

console.error(`Done. ${ok} ok, ${fail} fail out of ${personas.length}`);
console.log(JSON.stringify({ ok, fail, total: personas.length }));
