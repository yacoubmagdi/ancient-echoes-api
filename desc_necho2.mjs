import * as faceapi from '@vladmandic/face-api';
import canvas from 'canvas';
import fs from 'fs';
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const M = './public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(M);
await faceapi.nets.faceLandmark68Net.loadFromDisk(M);
await faceapi.nets.faceRecognitionNet.loadFromDisk(M);
const img = await canvas.loadImage('/dev-server/necho2_v1.jpg');
let det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })).withFaceLandmarks().withFaceDescriptor();
if (!det) det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.2 })).withFaceLandmarks().withFaceDescriptor();
if (!det) { console.error('no face'); process.exit(1); }
fs.writeFileSync('/tmp/necho2_desc.json', JSON.stringify(Array.from(det.descriptor)));
console.log('OK', det.descriptor.length);
