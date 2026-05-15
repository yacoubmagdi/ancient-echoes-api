import { createClient } from '@supabase/supabase-js';
import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const M = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(M);
await faceapi.nets.faceLandmark68Net.loadFromDisk(M);
await faceapi.nets.faceRecognitionNet.loadFromDisk(M);

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows, error } = await s.from('personas')
  .select('id, name, image_url, face_descriptor')
  .order('name');
if (error) throw error;

const missing = rows.filter(r => !r.face_descriptor || (Array.isArray(r.face_descriptor) && r.face_descriptor.length !== 128));
console.log('Missing:', missing.length);

let ok = 0, fail = 0;
const failed = [];
for (const p of missing) {
  try {
    const resp = await fetch(p.image_url);
    if (!resp.ok) { console.log('FETCH FAIL', p.name, resp.status); fail++; failed.push(p.name); continue; }
    const buf = Buffer.from(await resp.arrayBuffer());
    const img = await loadImage(buf);
    let det = null;
    for (const sz of [416, 512, 608, 320]) {
      for (const th of [0.4, 0.3, 0.2, 0.1]) {
        det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: sz, scoreThreshold: th }))
          .withFaceLandmarks().withFaceDescriptor();
        if (det) break;
      }
      if (det) break;
    }
    if (!det) { console.log('NO FACE', p.name); fail++; failed.push(p.name); continue; }
    const desc = Array.from(det.descriptor);
    const { error: ue } = await s.from('personas').update({ face_descriptor: desc }).eq('id', p.id);
    if (ue) { console.log('DB FAIL', p.name, ue.message); fail++; failed.push(p.name); continue; }
    ok++;
    console.log('OK', p.name);
  } catch (e) {
    console.log('ERR', p.name, e.message);
    fail++; failed.push(p.name);
  }
}
console.log('---');
console.log('OK:', ok, 'FAIL:', fail);
console.log('Failed:', JSON.stringify(failed, null, 2));
