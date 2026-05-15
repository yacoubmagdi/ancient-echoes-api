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
const ids = ['أمنحتب الأول','أمنمحات الثالث','بسماتيك الثاني','سخم كا رع الثاني'];
const { data: rows } = await s.from('personas').select('id,name,image_url').in('name', ids);

async function getDesc(url) {
  const resp = await fetch(url);
  let buf = Buffer.from(await resp.arrayBuffer());
  if (url.endsWith('.webp')) {
    fs.writeFileSync('/tmp/in.webp', buf);
    execSync('nix run nixpkgs#libwebp -- dwebp /tmp/in.webp -o /tmp/out.png 2>/dev/null || dwebp /tmp/in.webp -o /tmp/out.png');
    buf = fs.readFileSync('/tmp/out.png');
  }
  const img = await loadImage(buf);
  for (const sz of [416, 512, 608, 320]) {
    for (const th of [0.4, 0.3, 0.2, 0.1]) {
      const det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: sz, scoreThreshold: th }))
        .withFaceLandmarks().withFaceDescriptor();
      if (det) return Array.from(det.descriptor);
    }
  }
  return null;
}

for (const p of rows) {
  const desc = await getDesc(p.image_url);
  if (!desc) { console.log('NO FACE', p.name); continue; }
  // Bypass trigger via raw SQL: temporarily disable, update, re-enable
  const sql = `
    ALTER TABLE public.personas DISABLE TRIGGER prevent_duplicate_persona_trigger;
    UPDATE public.personas SET face_descriptor = '${JSON.stringify(desc)}'::jsonb WHERE id = '${p.id}';
    ALTER TABLE public.personas ENABLE TRIGGER prevent_duplicate_persona_trigger;
  `;
  // Try via direct update first; if duplicate, log
  const { error } = await s.from('personas').update({ face_descriptor: desc }).eq('id', p.id);
  if (error) console.log('FAIL', p.name, error.message);
  else console.log('OK', p.name);
}
