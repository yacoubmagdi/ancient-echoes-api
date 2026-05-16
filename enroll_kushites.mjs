import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage, ImageData } from "canvas";
import { createClient } from "@supabase/supabase-js";
import * as tf from "@tensorflow/tfjs-node";

faceapi.env.monkeyPatch({ Canvas: createCanvas, Image: loadImage, ImageData });
const M = "/dev-server/public/models";
await faceapi.nets.tinyFaceDetector.loadFromDisk(M);
await faceapi.nets.faceLandmark68Net.loadFromDisk(M);
await faceapi.nets.faceRecognitionNet.loadFromDisk(M);

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows } = await s.from('personas')
  .select('id,name,image_url')
  .in('name', ['محارب كوشي','حامل جزية نوبي','أمير كوشي']);

for (const p of rows) {
  const res = await fetch(p.image_url);
  const buf = Buffer.from(await res.arrayBuffer());
  const img = await loadImage(buf);
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  const d = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
  const tensor = tf.tensor3d(new Uint8Array(d.data.buffer), [canvas.height, canvas.width, 4]).slice([0,0,0],[-1,-1,3]);
  let saved = false;
  for (const sz of [416,512,608,320]) {
    for (const t of [0.3,0.2,0.15,0.1]) {
      const det = await faceapi.detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({inputSize:sz,scoreThreshold:t}))
        .withFaceLandmarks().withFaceDescriptor();
      if (det) {
        const desc = Array.from(det.descriptor);
        const { error } = await s.from('personas').update({ face_descriptor: desc }).eq('id', p.id);
        console.log(error ? `❌ ${p.name}: ${error.message}` : `✅ ${p.name} sz=${sz} t=${t}`);
        saved = true; break;
      }
    }
    if (saved) break;
  }
  if (!saved) console.log(`⚠️ no face: ${p.name}`);
  tensor.dispose();
}
