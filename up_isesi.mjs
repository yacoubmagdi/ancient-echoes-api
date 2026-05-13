import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '9198be0f-fe5c-4360-8610-3dab6e2c49ba';
const SRC = 'https://en.wikipedia.org/wiki/Djedkare_Isesi';

// 1) Upload image
const path = `Pharaoh/${PID}_isesi_${Date.now()}.jpg`;
const bytes = fs.readFileSync('/tmp/isesi.jpg');
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
if (ue) throw ue;
const { data: pu } = s.storage.from('personas').getPublicUrl(path);
console.log('Image uploaded:', pu.publicUrl);

// 2) Fetch Wikipedia summary
const wikiTitle = 'Djedkare_Isesi';
const wikiResp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`);
const wikiData = await wikiResp.json();
const extract = wikiData.extract || '';
console.log('Wiki extract length:', extract.length);

// 3) Generate Arabic description (3 lines) via Lovable AI
const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [{
      role: 'user',
      content: `بناءً على المصدر التاريخي التالي عن الفرعون "جد كارع إسيسي" (Djedkare Isesi):

${extract}

اكتب وصفاً تاريخياً موجزاً باللغة العربية الفصحى في حدود ثلاثة أسطر فقط (لا أكثر)، يتضمن: الأسرة الحاكمة، فترة حكمه التقريبية، أبرز إنجازاته. بدون مقدمات أو عناوين، فقط النص الوصفي مباشرة.`
    }],
  }),
});
const aiData = await aiResp.json();
if (!aiResp.ok) { console.error(aiData); throw new Error('AI failed: ' + aiResp.status); }
const description = aiData.choices?.[0]?.message?.content?.trim();
console.log('\n=== Description ===\n' + description + '\n');

// 4) Update DB
const { error: dbe } = await s.from('personas').update({
  image_url: pu.publicUrl,
  description,
  face_descriptor: null,
}).eq('id', PID);
if (dbe) throw dbe;
console.log('OK ✅ DB updated');
