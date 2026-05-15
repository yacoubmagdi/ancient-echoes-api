import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://egypt-museum.com/henuttaneb-daughter-of-amenhotep-iii-queen-tiye/';

const ex = `Henuttaneb's name means "Mistress of All Lands"; daughter of Amenhotep III and Queen Tiye, 18th Dynasty. Less prominent than sisters Sitamun and Iset; depicted at the Colossi of Memnon and the Mortuary Temple of Amenhotep III at Kom el-Hetan; also a limestone statuette in Cairo Museum (JE33906).`;

const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({model:'google/gemini-2.5-flash',messages:[{role:'user',content:`بناءً على المصدر التاريخي التالي عن الأميرة المصرية القديمة "حنوت تا نب":\n\n${ex}\n\nاكتب وصفاً تاريخياً موجزاً باللغة العربية الفصحى في حدود ثلاثة أسطر فقط، يتضمن: الأسرة الحاكمة، نسبها (والداها)، وأبرز ما عُرف عنها. بدون مقدمات أو عناوين، فقط النص مباشرة.`}]})
});
const j = await r.json();
if (!r.ok) { console.error(j); process.exit(1); }
const description = j.choices[0].message.content.trim();
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
