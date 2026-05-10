import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';

const sb = createClient('https://kfycwzfhyermjhupyrpk.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = '40fbbe9d-c0eb-4cbe-ad2f-053e2911193b';
const M = '/dev-server/public/models';
await faceapi.nets.tinyFaceDetector.loadFromDisk(M);
await faceapi.nets.faceLandmark68Net.loadFromDisk(M);
await faceapi.nets.faceRecognitionNet.loadFromDisk(M);

const buf = fs.readFileSync('/tmp/useramen_portrait.png');
const path = `Pharaoh/${ID}_v2_${Date.now()}.png`;
const { error: upErr } = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/png', upsert: true });
if (upErr) throw upErr;
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);

const t = tf.node.decodeImage(buf, 3);
let det = null;
for (const s of [416,512,320]) for (const th of [0.3,0.2]) { det = await faceapi.detectSingleFace(t, new faceapi.TinyFaceDetectorOptions({inputSize:s,scoreThreshold:th})).withFaceLandmarks().withFaceDescriptor(); if (det) break; if (det) break; }
t.dispose();
const desc = det ? Array.from(det.descriptor) : null;
console.log('face score:', det?.detection.score);

const description = 'الوزير وسر آمون (يُعرف أيضًا بـ "وسر" أو "آمون وسر")، وزير الجنوب في عهد الفرعونة حتشبسوت والفرعون تحتمس الثالث من الأسرة الثامنة عشرة. تولّى منصب الوزير في السنة التاسعة من حكم حتشبسوت (الموافقة للسنة الخامسة من حكم تحتمس الثالث) وظل في منصبه عشرين عامًا. كان ابن الوزير "أمتو الملقب أحمس" ووالد عمّ الوزير الشهير "رخميرع". لُقّب بـ "أمير" و"عمدة المدينة" و"الوزير". دُفن في طيبة في المقبرتين TT61 وTT131، وعُثر على باب وهمي من الجرانيت الأحمر له ولزوجته "تويو" في الكرنك.';
const description_en = 'Useramen (also called User, Amenuser, or Useramun) was vizier of the South under pharaohs Hatshepsut and Thutmose III of the 18th Dynasty. Installed in year 9 of Hatshepsut\'s reign, he held the office for 20 years. Son of vizier Amethu called Ahmose and uncle of the famous vizier Rekhmire. His titles included Prince, Mayor of the City, and Vizier. Buried at Thebes in tombs TT61 and TT131; a red granite false door of him and his wife Tuiu was found at Karnak.';

const { error: updErr } = await sb.from('personas').update({
  image_url: publicUrl,
  source_image_url: 'https://en.wikipedia.org/wiki/Useramen',
  description, description_en,
  ...(desc ? { face_descriptor: desc } : {})
}).eq('id', ID);
if (updErr) throw updErr;
console.log('✅ updated', publicUrl);
