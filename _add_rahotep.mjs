import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = randomUUID();
const path = `Pharaoh/${id}_rahotep_${Date.now()}.png`;
const buf = readFileSync('/tmp/rahotep_portrait.png');
const up = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/png', upsert: true });
if (up.error) throw up.error;
const url = sb.storage.from('personas').getPublicUrl(path).data.publicUrl;

// face descriptor
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

const { error } = await sb.from('personas').insert({
  id,
  name: 'الأمير رع حتب',
  name_en: 'Prince Rahotep',
  category: 'Pharaoh',
  role: 'noble',
  gender: 'male',
  image_url: url,
  source_image_url: 'https://ar.wikipedia.org/wiki/%D8%B1%D8%B9_%D8%AD%D8%AA%D8%A8',
  face_descriptor: desc,
  description: 'الأمير رع حُتپ (رعحوتب) شخصية مصرية قديمة من الأسرة الرابعة (القرن 26 ق.م)، يُعتقد أنه ابن الملك سنفرو مؤسس الأسرة الرابعة وأخ غير شقيق للملك خوفو. شغل منصب رئيس كهنة رع في مدينة أون (هليوپوليس/عين شمس)، وكان جنرالًا وأميرًا على مدينة پي (بوتو) في شمال الدلتا، إلى جانب توليه إدارة البعثات والإشراف على الأشغال الملكية، وحمل لقب "ابن الملك المولود من جسده". تزوج من الأميرة نُفرت وأنجب منها ثلاثة أبناء (جدي، إيتو، نفركاو) وثلاث بنات (ميريريت، نجميب، ستتت). تُوفي شابًا، وقد اشتُهر بتمثاله المنحوت من الحجر الجيري الملوّن مع تمثال زوجته نفرت، اللذين اكتشفهما عالم الآثار الفرنسي أوجوست مارييت عام 1871م في مصطبته بميدوم، وهما اليوم من أبرز روائع المتحف المصري بالقاهرة.',
  description_en: 'Prince Rahotep was an ancient Egyptian noble of the 4th Dynasty (c.2600 BCE), believed to be a son of King Sneferu (founder of the 4th Dynasty) and a half-brother of King Khufu. He served as High Priest of Ra at Heliopolis (Iunu/On), General and Prince of the sacred city of Pe (Buto) in the northern Delta, and held the titles of Director of Expeditions and Overseer of Works, along with the noble title "King\'s Son of his Body." He married Princess Nofret and fathered three sons (Djedi, Itu, Neferkau) and three daughters (Mereret, Nedjemib, Sethtet). He died young. He is famous for his exquisite painted limestone seated statue, paired with that of his wife Nofret, discovered by the French archaeologist Auguste Mariette in 1871 in his mastaba at Meidum; both statues are masterpieces of the Egyptian Museum in Cairo.'
});
if (error) throw error;
console.log('OK', id, url);
