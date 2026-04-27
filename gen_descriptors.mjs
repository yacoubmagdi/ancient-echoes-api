import * as faceapi from "@vladmandic/face-api";
import * as tf from "@tensorflow/tfjs-node";
import { createCanvas, loadImage, ImageData } from "canvas";
import path from "node:path";
import fs from "node:fs";

faceapi.env.monkeyPatch({ Canvas: createCanvas, Image: loadImage, ImageData });

const MODELS = path.resolve("public/models");
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);

const files = process.argv.slice(2);
const out = {};
for (const f of files) {
  const img = await loadImage(f);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const det = await faceapi
    .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) {
    console.error("NO FACE:", f);
    out[path.basename(f)] = null;
  } else {
    out[path.basename(f)] = Array.from(det.descriptor);
    console.error("OK:", f);
  }
}
process.stdout.write(JSON.stringify(out));
