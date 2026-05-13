import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '3e815118-ef79-4a20-a450-4fa4b1feedeb';
const SRC = 'https://en.wikipedia.org/wiki/Hetepheres_III';

const path = `Pharaoh/${PID}_hetep3_${Date.now()}.jpg`;
const bytes = fs.readFileSync('/tmp/hetep3.jpg');
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
if (ue) throw ue;
const { data: pu } = s.storage.from('personas').getPublicUrl(path);
console.log('Image:', pu.publicUrl);

const wikiResp = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Hetepheres_III');
const wikiData = await wikiResp.json();
const extract = wikiData.extract || '';
console.log('Wiki len:', extract.length);

const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [{
      role: 'user',
      content: `بناءً على المصدر التاريخي عن الملكة المصرية القديمة "حتب حرس الثالثة" (Hetepheres III):\n\n${extract}\n\nاكتب وصفاً تاريخياً موجزاً باللغة العربية الفصحى في حدود ثلاثة أسطر فقط، يتضمن: الأسرة الحاكمة، علاقتها بالملوك، أبرز ما عُرف عنها. بدون مقدمات أو عناوين، فقط النص الوصفي مباشرة.`
    }],
  }),
});
const aiData = await aiResp.json();
if (!aiResp.ok) { console.error(aiData); throw new Error('AI ' + aiResp.status); }
const description = aiData.choices?.[0]?.message?.content?.trim();
console.log('\n' + description + '\n');

const { error: dbe } = await s.from('personas').update({
  image_url: pu.publicUrl,
  description,
  source_image_url: SRC,
  face_descriptor: null,
}).eq('id', PID);
if (dbe) throw dbe;
console.log('OK ✅');
