import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '7ad4ff11-f0c6-42fd-9ac7-b43ac0572854';

const path = `Pharaoh/${PID}_hapu_${Date.now()}.jpg`;
const bytes = fs.readFileSync('/tmp/hapu.jpg');
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
if (ue) throw ue;
const { data: pu } = s.storage.from('personas').getPublicUrl(path);
console.log('Image:', pu.publicUrl);

const wikiResp = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Hapuseneb');
const extract = (await wikiResp.json()).extract || '';
console.log('Wiki len:', extract.length);

const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content: `بناءً على المصدر التاريخي التالي عن "حابو سنب" (Hapuseneb):\n\n${extract}\n\nاكتب وصفاً تاريخياً موجزاً باللغة العربية الفصحى في حدود ثلاثة أسطر فقط، يتضمن: منصبه، الفترة الزمنية، أبرز إنجازاته. بدون مقدمات، فقط النص مباشرة.` }],
  }),
});
const aiData = await aiResp.json();
if (!aiResp.ok) { console.error(aiData); throw new Error('AI ' + aiResp.status); }
const description = aiData.choices?.[0]?.message?.content?.trim();
console.log('\n' + description + '\n');

const { error: dbe } = await s.from('personas').update({ image_url: pu.publicUrl, description, face_descriptor: null }).eq('id', PID);
if (dbe) throw dbe;
console.log('OK ✅');
