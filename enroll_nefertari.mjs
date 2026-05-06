import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage, ImageData } from "canvas";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as tf from "@tensorflow/tfjs-node";
import https from "node:https";

faceapi.env.monkeyPatch({ Canvas: createCanvas, Image: loadImage, ImageData });
const MODELS = path.resolve("/dev-server/public/models");
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Try multiple Nefertari images
const urls = [
  "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/NefertariOfferingToHathor.JPG/500px-NefertariOfferingToHathor.JPG",
  "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Tomb_of_Nefertari_%2852785688763%29.jpg/500px-Tomb_of_Nefertari_%2852785688763%29.jpg",
];

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

for (const url of urls) {
  try {
    console.error(`Trying: ${url}`);
    const buf = await fetchURL(url);
    const img = await loadImage(buf);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tensor = tf.tensor3d(new Uint8Array(imgData.data.buffer), [canvas.height, canvas.width, 4]).slice([0,0,0],[-1,-1,3]);

    for (const size of [320, 416, 512, 608]) {
      for (const thresh of [0.05, 0.1, 0.15, 0.2, 0.3]) {
        const det = await faceapi
          .detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: thresh }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (det) {
          console.error(`  FOUND! size=${size} thresh=${thresh} score=${det.detection.score}`);
          const descriptor = Array.from(det.descriptor);
          const { error } = await supabase.from("personas").update({ face_descriptor: descriptor, image_url: url }).eq("id", "2429ace9-ee0a-4130-8de1-ace15fb2a4e3");
          if (error) console.error(`  UPDATE ERR: ${error.message}`);
          else console.error("  SAVED!");
          tensor.dispose();
          process.exit(0);
        }
      }
    }
    tensor.dispose();
    console.error("  No face found in this image");
  } catch (e) {
    console.error(`  Error: ${e.message}`);
  }
}
console.error("Could not find face in any Nefertari image");
