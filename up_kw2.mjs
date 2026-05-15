import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://egypt-museum.com/nubian-women-and-children-depicted-within-the-procession-of-tribute-for-king-thutmose-iv/';

const ai = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({model:'google/gemini-2.5-flash',messages:[{role:'user',content:'اكتب وصفاً تاريخياً موجزاً (3-4 أسطر) باللغة العربية الفصحى عن "امرأة نبيلة كوشية نوبية" من بلاد كوش جنوب مصر، كما صُوّرت في النقوش المصرية القديمة في عصر الدولة الحديثة (الأسرة الثامنة عشرة) ضمن مواكب الجزية النوبية المقدّمة للبلاط الفرعوني. اذكر: البشرة الداكنة، الشعر الأسود الكثيف بقصة قصيرة، التاج الذهبي المرصّع بالأحجار الخضراء، الأقراط الذهبية الكبيرة، الياقة العريضة من الذهب والخرز الأخضر (المالاكيت)، الرداء الكتاني الأبيض، الأساور الذهبية في الذراعين. ومكانتها كأميرة أو ابنة زعيم نوبي. بدون مقدمات ولا عناوين.'}]}),
});
const j = await ai.json();
if (!ai.ok) { console.error(j); process.exit(1); }
const description = j.choices[0].message.content.trim();
console.log('DESC:', description);

const id = crypto.randomUUID();
const bytes = fs.readFileSync('/tmp/kushite_woman2.jpg');
const path = `Pharaoh/${id}_kushite_noble_${Date.now()}.jpg`;
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType:'image/jpeg', upsert:true });
if (ue) throw ue;
const { data: urlData } = s.storage.from('personas').getPublicUrl(path);

const { error: ie } = await s.from('personas').insert({
  id,
  name: 'أميرة كوشية',
  name_en: 'Kushite Princess',
  category: 'Pharaoh',
  role: 'شخصية تاريخية',
  gender: 'female',
  description,
  image_url: urlData.publicUrl,
  source_image_url: SRC,
  is_drawing: false,
});
if (ie) throw ie;
console.log('OK ✅', id, urlData.publicUrl);
