import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage, ImageData } from "canvas";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as tf from "@tensorflow/tfjs-node";
import fs from "node:fs";

faceapi.env.monkeyPatch({ Canvas: createCanvas, Image: loadImage, ImageData });
const MODELS = path.resolve("/dev-server/public/models");
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: p } = await supabase.from("personas").select("id,image_url").eq("name_en","Nykara").single();
console.error("persona:", p.id, p.image_url);

const buf = fs.readFileSync("/tmp/nykara_user.jpg");
const img = await loadImage(buf);
const canvas = createCanvas(img.width, img.height);
canvas.getContext("2d").drawImage(img, 0, 0);
const imgData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
const tensor = tf.tensor3d(new Uint8Array(imgData.data.buffer), [canvas.height, canvas.width, 4]).slice([0,0,0],[-1,-1,3]);

for (const size of [416, 512, 608, 320]) {
  for (const thresh of [0.3, 0.2, 0.15, 0.1, 0.05]) {
    const det = await faceapi.detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: thresh }))
      .withFaceLandmarks().withFaceDescriptor();
    if (det) {
      console.error(`FOUND size=${size} thresh=${thresh} score=${det.detection.score}`);
      const descriptor = Array.from(det.descriptor);
      const { error } = await supabase.from("personas").update({ face_descriptor: descriptor }).eq("id", p.id);
      if (error) { console.error("ERR:", error.message); process.exit(1); }
      console.log("SAVED ✅ length=", descriptor.length);
      process.exit(0);
    }
  }
}
console.error("No face found");
process.exit(1);
