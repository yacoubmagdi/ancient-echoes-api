import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage, ImageData } from "canvas";
import { createClient } from "@supabase/supabase-js";

faceapi.env.monkeyPatch({ Canvas: createCanvas, Image: loadImage, ImageData });
const MODELS = "/dev-server/public/models";
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);

const PID = '1ab47c2f-b7a1-4f40-97b3-a182eee9959a';
const img = await loadImage('/tmp/senusret1.jpg');
const canvas = createCanvas(img.width, img.height);
canvas.getContext('2d').drawImage(img, 0, 0);

let det = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 })).withFaceLandmarks().withFaceDescriptor();
if (!det) det = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.2 })).withFaceLandmarks().withFaceDescriptor();
if (!det) { console.error('NO FACE'); process.exit(1); }

const desc = Array.from(det.descriptor);
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { error } = await s.from('personas').update({ face_descriptor: desc }).eq('id', PID);
if (error) throw error;
console.log('OK descriptor length=', desc.length);
