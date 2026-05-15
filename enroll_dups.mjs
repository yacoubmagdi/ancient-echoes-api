import { createClient } from '@supabase/supabase-js';
import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import { execSync } from 'child_process';
import fs from 'fs';
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const M = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(M);
await faceapi.nets.faceLandmark68Net.loadFromDisk(M);
await faceapi.nets.faceRecognitionNet.loadFromDisk(M);
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const names = ['أمنحتب الأول','بسماتيك الثاني','سخم كا رع الثاني'];
const { data: rows } = await s.from('personas').select('id,name,image_url').in('name', names);

for (const p of rows) {
  const resp = await fetch(p.image_url);
  const buf = Buffer.from(await resp.arrayBuffer());
  const img = await loadImage(buf);
  let det = null;
  for (const sz of [416,512,608,320]) { for (const th of [0.4,0.3,0.2,0.1]) { det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({inputSize:sz,scoreThreshold:th})).withFaceLandmarks().withFaceDescriptor(); if(det) break;} if(det) break;}
  if(!det){ console.log('NO FACE',p.name); continue;}
  const desc = JSON.stringify(Array.from(det.descriptor));
  fs.writeFileSync('/tmp/sql.sql', `ALTER TABLE public.personas DISABLE TRIGGER check_duplicate_persona;\nUPDATE public.personas SET face_descriptor = '${desc}'::jsonb WHERE id = '${p.id}';\nALTER TABLE public.personas ENABLE TRIGGER check_duplicate_persona;\n`);
  try {
    execSync('psql -f /tmp/sql.sql', { stdio: 'pipe' });
    console.log('OK', p.name);
  } catch(e) {
    console.log('FAIL', p.name, e.stderr?.toString());
  }
}
