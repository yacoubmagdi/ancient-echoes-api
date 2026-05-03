import { createClient } from '@supabase/supabase-js';
import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';
import https from 'https';
import http from 'http';

const SUPABASE_URL = 'https://kfycwzfhyermjhupyrpk.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) { console.error('missing key'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const MODELS = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

// Fetch all personas
const { data: personas, error } = await sb.from('personas').select('id, name, image_url, face_descriptor').order('name');
if (error) { console.error(error); process.exit(1); }

console.log(`Total personas: ${personas.length}`);

const mismatches = [];
const noFaceDetected = [];
const downloadFailed = [];

for (let i = 0; i < personas.length; i++) {
  const p = personas[i];
  const storedDesc = p.face_descriptor;
  if (!storedDesc || storedDesc.length !== 128) {
    console.log(`${i} ${p.name} - NO STORED DESCRIPTOR`);
    continue;
  }

  let buf;
  try {
    buf = await downloadImage(p.image_url);
    if (buf.length < 1000) { downloadFailed.push({ id: p.id, name: p.name, reason: 'too small' }); continue; }
  } catch (e) {
    downloadFailed.push({ id: p.id, name: p.name, reason: e.message });
    continue;
  }

  let det = null;
  try {
    const tensor = tf.node.decodeImage(buf, 3);
    for (const s of [416, 512, 320]) {
      for (const t of [0.3, 0.2]) {
        det = await faceapi.detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: s, scoreThreshold: t }))
          .withFaceLandmarks().withFaceDescriptor();
        if (det) break;
      }
      if (det) break;
    }
    tensor.dispose();
  } catch (e) {
    noFaceDetected.push({ id: p.id, name: p.name, reason: e.message });
    continue;
  }

  if (!det) {
    noFaceDetected.push({ id: p.id, name: p.name, reason: 'no face detected' });
    continue;
  }

  const freshDesc = Array.from(det.descriptor);
  const dist = euclidean(storedDesc, freshDesc);
  const similarity = Math.round((1 - dist) * 100);

  const status = dist > 0.8 ? '❌ MISMATCH' : dist > 0.5 ? '⚠️ LOW' : '✅ OK';
  if (dist > 0.5) {
    mismatches.push({ id: p.id, name: p.name, dist: dist.toFixed(3), similarity, freshDesc });
  }
  
  if (i % 10 === 0 || dist > 0.5) {
    console.log(`${i}/${personas.length} ${p.name}: dist=${dist.toFixed(3)} sim=${similarity}% ${status}`);
  }
}

console.log('\n=== SUMMARY ===');
console.log(`Total: ${personas.length}`);
console.log(`Download failed: ${downloadFailed.length}`);
console.log(`No face detected: ${noFaceDetected.length}`);
console.log(`Mismatches (dist>0.5): ${mismatches.length}`);

if (downloadFailed.length) {
  console.log('\n--- Download Failed ---');
  downloadFailed.forEach(m => console.log(`  ${m.name}: ${m.reason}`));
}
if (noFaceDetected.length) {
  console.log('\n--- No Face Detected ---');
  noFaceDetected.forEach(m => console.log(`  ${m.name}: ${m.reason}`));
}
if (mismatches.length) {
  console.log('\n--- Mismatches ---');
  mismatches.forEach(m => console.log(`  ${m.name}: dist=${m.dist} sim=${m.similarity}%`));
}

// Save results for next step
import fs from 'fs';
fs.writeFileSync('/tmp/face_verify_results.json', JSON.stringify({ mismatches, noFaceDetected, downloadFailed }, null, 2));
console.log('\nResults saved to /tmp/face_verify_results.json');
