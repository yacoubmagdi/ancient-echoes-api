import { createClient } from '@supabase/supabase-js';
import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import fs from 'fs';
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const M = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(M);
await faceapi.nets.faceLandmark68Net.loadFromDisk(M);
await faceapi.nets.faceRecognitionNet.loadFromDisk(M);
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '9198be0f-fe5c-4360-8610-3dab6e2c49ba';
const buf = fs.readFileSync('/tmp/isesi.jpg');
const img = await loadImage(buf);
let det;
for (const sz of [416, 512, 608, 320]) {
  for (const th of [0.5, 0.3, 0.2]) {
    det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: sz, scoreThreshold: th })).withFaceLandmarks().withFaceDescriptor();
    if (det) { console.log('detected sz=',sz,'th=',th); break; }
  }
  if (det) break;
}
if (!det) { console.log('NO FACE'); process.exit(1); }
const desc = Array.from(det.descriptor);
const { error } = await s.from('personas').update({ face_descriptor: desc }).eq('id', PID);
if (error) throw error;
console.log('OK desc len:', desc.length);
