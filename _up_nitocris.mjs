import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';

const sb = createClient('https://kfycwzfhyermjhupyrpk.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = '399938b3-8cb5-487a-b2a7-b31badcbb1c5';
const M = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(M);
await faceapi.nets.faceLandmark68Net.loadFromDisk(M);
await faceapi.nets.faceRecognitionNet.loadFromDisk(M);

const buf = fs.readFileSync('/tmp/nitocris_v2.png');
const path = `Pharaoh/${ID}_v2_${Date.now()}.png`;
const { error: upErr } = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/png', upsert: true });
if (upErr) throw upErr;
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);

const t = tf.node.decodeImage(buf, 3);
let det = null;
for (const s of [416,512,320]) { for (const th of [0.3,0.2]) { det = await faceapi.detectSingleFace(t, new faceapi.TinyFaceDetectorOptions({inputSize:s,scoreThreshold:th})).withFaceLandmarks().withFaceDescriptor(); if (det) break; } if (det) break; }
t.dispose();
const desc = det ? Array.from(det.descriptor) : null;
console.log('face score:', det?.detection.score);

const { error: updErr } = await sb.from('personas').update({
  image_url: publicUrl,
  ...(desc ? { face_descriptor: desc } : {})
}).eq('id', ID);
if (updErr) throw updErr;
console.log('✅', publicUrl);
