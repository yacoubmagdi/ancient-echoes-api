import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = 'acb384ee-d69d-495d-b041-690293f7f98c';
const SRC = 'https://ar.wikipedia.org/wiki/%D8%B1%D9%85%D8%B3%D9%8A%D8%B3_%D8%B3%D8%A8%D8%AA%D8%A7%D8%AD';

const w = await (await fetch('https://ar.wikipedia.org/api/rest_v1/page/summary/%D8%B1%D9%85%D8%B3%D9%8A%D8%B3_%D8%B3%D8%A8%D8%AA%D8%A7%D8%AD')).json();
const extract = w.extract || '';
console.log('Extract:', extract.slice(0, 400));

const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content: `بناءً على المصدر التاريخي التالي عن الفرعون "سيبتاح" (رمسيس سبتاح):\n\n${extract}\n\nاكتب وصفاً تاريخياً موجزاً باللغة العربية الفصحى في حدود ثلاثة أسطر فقط لا أكثر، يتضمن: الأسرة الحاكمة، فترة حكمه، وأبرز ما عُرف عنه. بدون مقدمات أو عناوين، فقط النص مباشرة.` }],
  }),
});
const j = await r.json();
if (!r.ok) { console.error(j); process.exit(1); }
const description = j.choices[0].message.content.trim();
console.log('\n' + description + '\n');
const { error } = await s.from('personas').update({ description, source_image_url: SRC }).eq('id', PID);
if (error) throw error;
console.log('OK ✅');
