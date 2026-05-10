import { createClient } from "@supabase/supabase-js";
import * as faceapi from "@vladmandic/face-api";
import * as tf from "@tensorflow/tfjs-node";
import fs from "node:fs";
import path from "node:path";

const ID = "98b81d01-ff9d-49ed-a038-0547cfc0151a";
const FILE = "/tmp/yuya_v2.png";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const buf = fs.readFileSync(FILE);
const key = `Pharaoh/${ID}_v2_${Date.now()}.png`;
const { error: ue } = await sb.storage.from("personas").upload(key, buf, { contentType: "image/png", upsert: true });
if (ue) throw ue;
const { data: { publicUrl } } = sb.storage.from("personas").getPublicUrl(key);
console.log("URL:", publicUrl);

const MODELS = path.resolve("public/models");
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);
const t = tf.node.decodeImage(buf, 3);
const det = await faceapi.detectSingleFace(t, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 })).withFaceLandmarks().withFaceDescriptor();
t.dispose();
if (!det) throw new Error("no face");
console.log("score:", det.detection.score);

const { error: upe } = await sb.from("personas").update({ image_url: publicUrl, face_descriptor: Array.from(det.descriptor) }).eq("id", ID);
if (upe) throw upe;
console.log("OK");
