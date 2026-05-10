import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = 'e3a79ae2-1664-44ed-8781-23c942d829a1';
const buf = readFileSync('/tmp/rahotep_v2.png');
const path = `Pharaoh/${id}_v2_${Date.now()}.png`;
const up = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/png', upsert: true });
if (up.error) throw up.error;
const url = sb.storage.from('personas').getPublicUrl(path).data.publicUrl;

const MODELS = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);
const t = tf.node.decodeImage(buf, 3);
let det = null;
for (const s of [512,416,320]) for (const th of [0.3,0.2]) {
  det = await faceapi.detectSingleFace(t, new faceapi.TinyFaceDetectorOptions({ inputSize: s, scoreThreshold: th })).withFaceLandmarks().withFaceDescriptor();
  if (det) break;
}
t.dispose();
const desc = det ? Array.from(det.descriptor) : null;
console.log('face?', !!desc, 'score:', det?.detection?.score);

const { error } = await sb.from('personas').update({ image_url: url, face_descriptor: desc }).eq('id', id);
if (error) throw error;
console.log('OK', url);
