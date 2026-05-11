import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage, ImageData } from "canvas";
import path from "node:path";
import * as tf from "@tensorflow/tfjs-node";
import fs from "node:fs";

faceapi.env.monkeyPatch({ Canvas: createCanvas, Image: loadImage, ImageData });
const MODELS = path.resolve("/dev-server/public/models");
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);

const buf = fs.readFileSync("/dev-server/nect2_v1.jpg");
const img = await loadImage(buf);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);
const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const tensor = tf.tensor3d(new Uint8Array(imgData.data.buffer), [canvas.height, canvas.width, 4]).slice([0,0,0],[-1,-1,3]);

let det = await faceapi.detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })).withFaceLandmarks().withFaceDescriptor();
if (!det) det = await faceapi.detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.15 })).withFaceLandmarks().withFaceDescriptor();
tensor.dispose();
if (!det) { console.error("NO FACE"); process.exit(1); }
fs.writeFileSync("/tmp/nect2_desc.json", JSON.stringify(Array.from(det.descriptor)));
console.log("OK", det.descriptor.length);
