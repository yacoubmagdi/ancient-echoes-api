import * as faceapi from "@vladmandic/face-api";
import * as tf from "@tensorflow/tfjs-node";
import path from "node:path";
import fs from "node:fs";

const MODELS = path.resolve("public/models");
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);

const files = process.argv.slice(2);
const out = {};
for (const f of files) {
  const buf = fs.readFileSync(f);
  const tensor = tf.node.decodeImage(buf, 3);
  // try multiple input sizes/thresholds
  const sizes = [416, 512, 608, 320];
  const thresholds = [0.3, 0.2, 0.1];
  let det = null;
  for (const s of sizes) {
    for (const t of thresholds) {
      det = await faceapi
        .detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: s, scoreThreshold: t }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (det) break;
    }
    if (det) break;
  }
  tensor.dispose();
  if (!det) {
    console.error("NO FACE:", f);
    out[path.basename(f)] = null;
  } else {
    out[path.basename(f)] = Array.from(det.descriptor);
    console.error("OK:", f, "score=", det.detection.score);
  }
}
fs.writeFileSync("/tmp/descriptors.json", JSON.stringify(out));
console.error("WROTE /tmp/descriptors.json");
