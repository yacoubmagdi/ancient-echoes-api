import { createClient } from '@supabase/supabase-js';
import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const M = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(M);
await faceapi.nets.faceLandmark68Net.loadFromDisk(M);
await faceapi.nets.faceRecognitionNet.loadFromDisk(M);
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ids = ['97d1dc90-c52a-495a-9f7a-7fc6705970ec','d2c7b6f8-82c9-4d7f-b057-b80518cad0f0','52ac7616-e942-463d-a53d-f1b73b9ad78c'];
const { data: rows } = await s.from('personas').select('id,name,image_url').in('id', ids);
for (const p of rows) {
  const buf = Buffer.from(await (await fetch(p.image_url)).arrayBuffer());
  const img = await loadImage(buf);
  let det=null;
  for (const sz of [416,512,608,320]) { for (const th of [0.4,0.3,0.2,0.1]) { det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({inputSize:sz,scoreThreshold:th})).withFaceLandmarks().withFaceDescriptor(); if(det) break;} if(det) break;}
  if(!det){console.log('NO FACE',p.name);continue;}
  const { error } = await s.from('personas').update({face_descriptor: Array.from(det.descriptor)}).eq('id',p.id);
  console.log(error?'FAIL '+p.name+': '+error.message:'OK '+p.name);
}
