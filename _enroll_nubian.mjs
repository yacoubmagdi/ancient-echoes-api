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

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = "8454ca57-1bae-45f0-bc65-d763c2fc1e8c";
const { data: p } = await sb.from("personas").select("id,name,image_url").eq("id", ID).single();
console.error("persona:", p.name, p.image_url);
const buf = Buffer.from(await (await fetch(p.image_url)).arrayBuffer());
const img = await loadImage(buf);
const canvas = createCanvas(img.width, img.height);
canvas.getContext("2d").drawImage(img, 0, 0);
const imgData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
const tensor = tf.tensor3d(new Uint8Array(imgData.data.buffer), [canvas.height, canvas.width, 4]).slice([0,0,0],[-1,-1,3]);

for (const sz of [608, 416, 320, 224]) {
  for (const th of [0.2, 0.1, 0.05]) {
    const det = await faceapi.detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: sz, scoreThreshold: th }))
      .withFaceLandmarks().withFaceDescriptor();
    if (det) {
      console.error(`DETECTED size=${sz} th=${th} score=${det.detection.score}`);
      const desc = Array.from(det.descriptor);
      const { error } = await sb.from("personas").update({ face_descriptor: desc }).eq("id", ID);
      if (error) { console.error(error); process.exit(1); }
      console.log("OK saved", desc.length);
      process.exit(0);
    }
  }
}
console.error("NO FACE DETECTED at any setting");
process.exit(2);
