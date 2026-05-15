import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage, ImageData } from "canvas";
import { createClient } from "@supabase/supabase-js";
import * as tf from "@tensorflow/tfjs-node";
import fs from "node:fs";

faceapi.env.monkeyPatch({ Canvas: createCanvas, Image: loadImage, ImageData });
const MODELS = "/dev-server/public/models";
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);

const PID = '1ab47c2f-b7a1-4f40-97b3-a182eee9959a';
const buf = fs.readFileSync('/tmp/senusret1.jpg');
const img = await loadImage(buf);
const canvas = createCanvas(img.width, img.height);
canvas.getContext('2d').drawImage(img, 0, 0);
const imgData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
const tensor = tf.tensor3d(new Uint8Array(imgData.data.buffer), [canvas.height, canvas.width, 4]).slice([0,0,0],[-1,-1,3]);

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const size of [416, 512, 608, 320]) {
  for (const t of [0.3, 0.2, 0.15, 0.1]) {
    const det = await faceapi.detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: t }))
      .withFaceLandmarks().withFaceDescriptor();
    if (det) {
      const desc = Array.from(det.descriptor);
      const { error } = await s.from('personas').update({ face_descriptor: desc }).eq('id', PID);
      if (error) { console.error(error.message); process.exit(1); }
      console.log(`SAVED ✅ size=${size} thresh=${t} score=${det.detection.score.toFixed(3)} len=${desc.length}`);
      process.exit(0);
    }
  }
}
console.error('NO FACE');
process.exit(1);
