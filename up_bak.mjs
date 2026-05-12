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
const PID = 'c6a1a135-07a6-40b8-b9c5-8893d0922020';
const path = `Pharaoh/${PID}_bakenkhonsu_${Date.now()}.jpg`;
const buf = fs.readFileSync('/tmp/bak.jpg');
const { error: ue } = await s.storage.from('personas').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
if (ue) throw ue;
const { data } = s.storage.from('personas').getPublicUrl(path);
const img = await loadImage(buf);
let det;
for (const sz of [416, 512, 608]) {
  det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: sz, scoreThreshold: 0.3 })).withFaceLandmarks().withFaceDescriptor();
  if (det) break;
}
const desc = det ? Array.from(det.descriptor) : null;
const { error: dbe } = await s.from('personas').update({ image_url: data.publicUrl, face_descriptor: desc }).eq('id', PID);
if (dbe) throw dbe;
console.log('OK', data.publicUrl, 'desc:', desc ? desc.length : 'NONE');
