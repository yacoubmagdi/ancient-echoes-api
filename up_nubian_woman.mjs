import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://egypt-museum.com/nubian-women-and-children-depicted-within-the-procession-of-tribute-for-king-thutmose-iv/';

const ai = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({model:'google/gemini-2.5-flash',messages:[{role:'user',content:'اكتب وصفاً تاريخياً موجزاً (3-4 أسطر) باللغة العربية الفصحى عن "امرأة كوشية نوبية" كما صُوّرت في مشهد موكب الجزية المقدّم للملك تحتمس الرابع من الدولة الحديثة (الأسرة الثامنة عشرة) في مقبرة سوبك حتب بطيبة. اذكر: البشرة الداكنة، تسريحة الشعر النوبية الكثيفة، الأقراط الذهبية الكبيرة، العقود متعددة الصفوف، الرداء الكتاني الأبيض المزخرف، الحزام الذهبي. وأنها كانت ضمن وفود النوبة الجنوبية التي حملت الذهب والعاج والجلود إلى البلاط الفرعوني. بدون مقدمات ولا عناوين.'}]}),
});
const j = await ai.json();
if (!ai.ok) { console.error(j); process.exit(1); }
const description = j.choices[0].message.content.trim();
console.log('DESC:', description);

const id = crypto.randomUUID();
const bytes = fs.readFileSync('/tmp/nubian_woman.png');
const path = `Pharaoh/${id}_nubian_woman_${Date.now()}.png`;
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType:'image/png', upsert:true });
if (ue) throw ue;
const { data: urlData } = s.storage.from('personas').getPublicUrl(path);

const { error: ie } = await s.from('personas').insert({
  id,
  name: 'امرأة كوشية',
  name_en: 'Kushite Woman',
  category: 'Pharaoh',
  role: 'شخصية تاريخية',
  gender: 'female',
  description,
  image_url: urlData.publicUrl,
  source_image_url: SRC,
  is_drawing: false,
});
if (ie) throw ie;
console.log('OK ✅', id);
