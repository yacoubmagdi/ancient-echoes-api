import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import fs from 'fs';

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const MODELS = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);

const img = await loadImage('/dev-server/src/assets/personas/tutankhamun.jpg');
const canvas = new Canvas(img.width, img.height);
canvas.getContext('2d').drawImage(img, 0, 0);

const result = await faceapi
  .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
  .withFaceLandmarks()
  .withFaceDescriptor();

if (!result) { console.error('NO_FACE'); process.exit(1); }
fs.writeFileSync('/tmp/descriptor.json', JSON.stringify(Array.from(result.descriptor)));
console.log('OK', result.descriptor.length);
