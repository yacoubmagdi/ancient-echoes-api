import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://www.istockphoto.com/photo/stone-hieroglyphic-carvings-at-kom-ombo-temple-gm1278106509-377146920';

const ai1 = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({model:'google/gemini-2.5-flash',messages:[{role:'user',content:'اكتب وصفاً تاريخياً موجزاً (3-4 أسطر) باللغة العربية الفصحى عن "أسير كوشي" — أحد أسرى مملكة كوش (النوبة) الذين صوّرتهم النقوش المصرية القديمة على جدران المعابد كرمز لانتصارات الفراعنة في الجنوب، خاصة في عصر الدولة الحديثة. اذكر سماته المميزة: البشرة الداكنة، الأقراط الكبيرة، تسريحة الشعر النوبية، والعقد المنقوش، والأصل من بلاد كوش جنوب النيل. بدون مقدمات.'}]}),
});
const j1 = await ai1.json();
if (!ai1.ok) { console.error(j1); process.exit(1); }
const description = j1.choices[0].message.content.trim();
console.log('DESC:', description);

const id = crypto.randomUUID();
const bytes = fs.readFileSync('/tmp/kushite.png');
const path = `Pharaoh/${id}_kushite_${Date.now()}.png`;
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType:'image/png', upsert:true });
if (ue) throw ue;
const { data: urlData } = s.storage.from('personas').getPublicUrl(path);

const { error: ie } = await s.from('personas').insert({
  id,
  name: 'أسير كوشي',
  name_en: 'Kushite Captive',
  category: 'Pharaoh',
  role: 'شخصية تاريخية',
  gender: 'male',
  description,
  image_url: urlData.publicUrl,
  source_image_url: SRC,
  is_drawing: false,
});
if (ie) throw ie;
console.log('OK ✅', id, urlData.publicUrl);
