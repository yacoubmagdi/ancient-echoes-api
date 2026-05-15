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
const { data: rows } = await s.from('personas').select('id,name,image_url').eq('name','أمنمحات الثالث');
const p = rows[0];
const resp = await fetch(p.image_url);
fs.writeFileSync('/tmp/in.webp', Buffer.from(await resp.arrayBuffer()));
execSync('nix run nixpkgs#libwebp -- dwebp /tmp/in.webp -o /tmp/out.png');
const img = await loadImage(fs.readFileSync('/tmp/out.png'));
let det;
for (const sz of [416,512,608,320]) for (const th of [0.4,0.3,0.2,0.1]) { det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({inputSize:sz,scoreThreshold:th})).withFaceLandmarks().withFaceDescriptor(); if(det) break; if(det) break;}
if(!det){console.log('NO FACE');process.exit(1);}
const desc = Array.from(det.descriptor);
const { error } = await s.from('personas').update({face_descriptor: desc}).eq('id',p.id);
console.log(error?'FAIL '+error.message:'OK');
