import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';

const SUPABASE_URL = 'https://kfycwzfhyermjhupyrpk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) { console.error('missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const MODELS = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);
console.log('models loaded');

const personas = JSON.parse(fs.readFileSync('/tmp/personas.json','utf8'));
const imgDir = '/tmp/persona_imgs';
const files = fs.readdirSync(imgDir).sort((a,b)=>parseInt(a)-parseInt(b));

const results = [];
for (let i=0; i<personas.length; i++){
  const p = personas[i];
  const fname = files.find(f => f.startsWith(i+'_'));
  if (!fname) { console.log(`no file for ${i}`); continue; }
  const fpath = path.join(imgDir, fname);
  const buf = fs.readFileSync(fpath);

  // extract descriptor
  const tensor = tf.node.decodeImage(buf, 3);
  let det = null;
  for (const s of [416, 512, 320]) {
    for (const t of [0.3, 0.2]) {
      det = await faceapi.detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: s, scoreThreshold: t }))
        .withFaceLandmarks().withFaceDescriptor();
      if (det) break;
    }
    if (det) break;
  }
  tensor.dispose();
  const descriptor = det ? Array.from(det.descriptor) : null;

  // upload
  const storagePath = `pharaonic/${i}_${Date.now()}.jpg`;
  const { error: upErr } = await sb.storage.from('personas').upload(storagePath, buf, {
    contentType: 'image/jpeg', upsert: true
  });
  if (upErr) { console.log(`upload fail ${i}: ${upErr.message}`); continue; }
  const { data: urlData } = sb.storage.from('personas').getPublicUrl(storagePath);
  const image_url = urlData.publicUrl;

  results.push({
    name: p.name, gender: p.gender, category: p.category, role: p.role,
    description: p.desc, image_url, face_descriptor: descriptor
  });
  console.log(`${i} ${p.name} ${descriptor?'✓face':'✗noface'}`);
}

fs.writeFileSync('/tmp/inserts.json', JSON.stringify(results));
console.log('total:', results.length, 'with-face:', results.filter(r=>r.face_descriptor).length);
