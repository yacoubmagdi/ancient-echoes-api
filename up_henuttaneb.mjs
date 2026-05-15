import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://egypt-museum.com/henuttaneb-daughter-of-amenhotep-iii-queen-tiye/';

const ex = `Henuttaneb's name means "Mistress of All Lands"; daughter of Amenhotep III and Queen Tiye, 18th Dynasty. Less prominent than sisters Sitamun and Iset; depicted at the Colossi of Memnon and the Mortuary Temple of Amenhotep III at Kom el-Hetan; also a limestone statuette in Cairo Museum (JE33906).`;

const description = 'الأميرة حنوت تا نب ("سيدة كل الأراضي") من الأسرة الثامنة عشرة في عصر الدولة الحديثة، وهي إحدى بنات الفرعون أمنحتب الثالث والملكة تيي. عُرفت من تصويرها إلى جانب والديها وإخوتها في آثار أبيها، خاصة عند تماثيل ممنون ومعبد الكوم الحيتان الجنازي. ومن أبرز ما تبقى من تماثيلها تمثال جيري محفوظ في المتحف المصري بالقاهرة (JE33906).';
console.log('DESC:', description);

const ins = await s.from('personas').insert({
  name: 'الأميرة حنوت تا نب',
  name_en: 'Henuttaneb',
  category: 'Pharaoh',
  role: 'princess',
  gender: 'female',
  description,
  source_image_url: SRC,
  image_url: 'pending',
  is_drawing: false,
}).select('id').single();
if (ins.error) { console.error(ins.error); process.exit(1); }
const PID = ins.data.id;

const buf = fs.readFileSync('/tmp/henuttaneb.jpg');
const path = `Pharaoh/${PID}_${Date.now()}.jpg`;
const up = await s.storage.from('personas').upload(path, buf, { contentType:'image/jpeg', upsert:true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data:{ publicUrl } } = s.storage.from('personas').getPublicUrl(path);
const upd = await s.from('personas').update({ image_url: publicUrl }).eq('id', PID);
console.log(upd.error || 'OK ✅', PID, publicUrl);
