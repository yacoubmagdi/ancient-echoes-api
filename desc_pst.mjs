import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import { createClient } from '@supabase/supabase-js';
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const M = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(M);
await faceapi.nets.faceLandmark68Net.loadFromDisk(M);
await faceapi.nets.faceRecognitionNet.loadFromDisk(M);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = 'bd2c7f89-bbf5-44c0-b097-dadddafbbbde';
const { data: p } = await sb.from('personas').select('image_url').eq('id', PID).single();
const buf = Buffer.from(await (await fetch(p.image_url)).arrayBuffer());
const img = await loadImage(buf);
let det;
for (const sz of [416, 512, 608]) {
  det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: sz, scoreThreshold: 0.3 }))
    .withFaceLandmarks().withFaceDescriptor();
  if (det) break;
}
if (!det) { console.error('no face'); process.exit(1); }
const desc = Array.from(det.descriptor);
const { error } = await sb.from('personas').update({ face_descriptor: desc }).eq('id', PID);
console.log(error ? `ERR ${error.message}` : `OK len=${desc.length}`);
