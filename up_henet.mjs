import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '4b84bc89-96a8-43eb-bfe3-6a562ee00f68';

const w = await (await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Henuttawy_C')).json();
const extract = w.extract || '';
console.log('Wiki:', extract.slice(0,300));

const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content: `بناءً على المصدر التاريخي عن "حنوت تاوي" (Henuttawy C):\n\n${extract}\n\nاكتب وصفاً تاريخياً مختصراً جداً باللغة العربية الفصحى في حدود سطرين فقط لا أكثر، يذكر الأسرة وعلاقتها بالملوك ومنصبها. بدون مقدمات، فقط النص مباشرة.` }],
  }),
});
const j = await r.json();
if (!r.ok) { console.error(j); process.exit(1); }
const description = j.choices[0].message.content.trim();
console.log('\n' + description + '\n');
const { error } = await s.from('personas').update({ description }).eq('id', PID);
if (error) throw error;
console.log('OK ✅');
