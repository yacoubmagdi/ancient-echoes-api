import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const WIKI = 'https://ar.wikipedia.org/wiki/%D8%B3%D9%8A%D8%AA%D9%8A_%D8%A7%D9%84%D8%A3%D9%88%D9%84';
const description = 'الفرعون سيتي الأول ثاني ملوك الأسرة التاسعة عشرة في مصر القديمة، حكم نحو 1290–1279 ق.م. وهو والد الفرعون رمسيس الثاني. اشتهر بحملاته العسكرية في بلاد الشام وليبيا وضد الحيثيين لاستعادة هيبة مصر، وبمشاريعه المعمارية الكبرى ومنها قاعة الأعمدة بمعبد الكرنك ومعبده الجنائزي في أبيدوس. مقبرته KV17 في وادي الملوك من أكبر وأجمل المقابر الملكية.';
const ins = await sb.from('personas').insert({
  name: 'الفرعون سيتي الأول',
  name_en: 'Seti I',
  category: 'Pharaoh',
  role: 'pharaoh',
  gender: 'male',
  description,
  source_image_url: WIKI,
  image_url: 'pending',
  is_drawing: false,
}).select('id').single();
if (ins.error) { console.error(ins.error); process.exit(1); }
const PID = ins.data.id;
const buf = fs.readFileSync('/tmp/seti1.jpg');
const path = `Pharaoh/${PID}_${Date.now()}.jpg`;
const up = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const upd = await sb.from('personas').update({ image_url: publicUrl }).eq('id', PID);
console.log(upd.error || 'OK', PID, publicUrl);
