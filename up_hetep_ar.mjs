import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '3e815118-ef79-4a20-a450-4fa4b1feedeb';
const SRC = 'https://ar.wikipedia.org/wiki/%D8%AD%D8%AA%D8%A8_%D8%AD%D8%B1%D8%B3_%D8%A7%D9%84%D8%AB%D8%A7%D9%86%D9%8A%D8%A9';

const wikiResp = await fetch('https://ar.wikipedia.org/api/rest_v1/page/summary/%D8%AD%D8%AA%D8%A8_%D8%AD%D8%B1%D8%B3_%D8%A7%D9%84%D8%AB%D8%A7%D9%86%D9%8A%D8%A9');
const wikiData = await wikiResp.json();
const extract = wikiData.extract || '';
console.log('Title:', wikiData.title, '\nExtract:', extract.slice(0, 300));

const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [{
      role: 'user',
      content: `بناءً على المصدر التاريخي التالي عن الملكة المصرية القديمة "حتب حرس الثانية":\n\n${extract}\n\nاكتب وصفاً تاريخياً موجزاً باللغة العربية الفصحى في حدود ثلاثة أسطر فقط، يتضمن: الأسرة الحاكمة، علاقتها بالملوك، أبرز ما عُرف عنها. بدون مقدمات أو عناوين، فقط النص الوصفي مباشرة.`
    }],
  }),
});
const aiData = await aiResp.json();
if (!aiResp.ok) { console.error(aiData); throw new Error('AI ' + aiResp.status); }
const description = aiData.choices?.[0]?.message?.content?.trim();
console.log('\nDESC:\n' + description + '\n');

const { error: dbe } = await s.from('personas').update({
  name: 'الملكة حتب حرس الثانية',
  description,
  source_image_url: SRC,
}).eq('id', PID);
if (dbe) throw dbe;
console.log('OK ✅');
