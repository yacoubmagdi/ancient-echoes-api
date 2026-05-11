import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import fs from 'fs';
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const MODELS = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);
const img = await loadImage('/dev-server/wenennefer_v1.jpg');
let det;
for (const sz of [416, 512, 608]) {
  det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: sz, scoreThreshold: 0.3 }))
    .withFaceLandmarks().withFaceDescriptor();
  if (det) break;
}
if (!det) { console.error('no face'); process.exit(1); }
fs.writeFileSync('/tmp/wnf_desc.json', JSON.stringify(Array.from(det.descriptor)));
console.log('OK len=', det.descriptor.length);
