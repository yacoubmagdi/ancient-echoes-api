import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const WIKI = 'https://ar.wikipedia.org/wiki/%D8%AA%D9%8A%D9%8A';
const description = 'الملكة تيي زوجة الفرعون أمنحتب الثالث ووالدة الفرعون أخناتون من الأسرة الثامنة عشرة. تمتعت بنفوذ سياسي واسع في البلاط الملكي وشاركت في إدارة شؤون الدولة، وتُعدّ من أبرز ملكات مصر القديمة.';
const ins = await sb.from('personas').insert({
  name: 'الملكة تيي',
  name_en: 'Tiye',
  category: 'Pharaoh',
  role: 'queen',
  gender: 'female',
  description,
  source_image_url: WIKI,
  image_url: 'pending',
  is_drawing: false,
}).select('id').single();
if (ins.error) { console.error(ins.error); process.exit(1); }
const PID = ins.data.id;
const buf = fs.readFileSync('/tmp/tiye.jpg');
const path = `Pharaoh/${PID}_${Date.now()}.jpg`;
const up = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const upd = await sb.from('personas').update({ image_url: publicUrl }).eq('id', PID);
console.log(upd.error || 'OK', PID, publicUrl);
