import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = process.env.LOVABLE_API_KEY;

const { data: rows, error } = await s.from('personas')
  .select('id, name, name_en, description')
  .not('description', 'is', null)
  .or('description_en.is.null,description_en.eq.')
  .limit(300);
if (error) { console.error(error); process.exit(1); }

const todo = rows.filter(r => (r.description || '').trim().length > 0);
console.log('To translate:', todo.length);

async function translate(p) {
  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: `Translate the following Arabic historical biography into clear, natural English. Output ONLY the English translation, no preface, no quotes, no labels. Keep the same length and historical detail. The persona's English name is "${p.name_en || ''}".\n\nArabic:\n${p.description}`
      }],
    }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
}

const CONC = 5;
let done = 0, failed = 0;
async function worker(slice) {
  for (const p of slice) {
    try {
      const en = await translate(p);
      const { error: uerr } = await s.from('personas').update({ description_en: en }).eq('id', p.id);
      if (uerr) throw uerr;
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${todo.length}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${p.name_en || p.name}: ${e.message}`);
    }
  }
}
const slices = Array.from({length: CONC}, (_, i) => todo.filter((_, idx) => idx % CONC === i));
await Promise.all(slices.map(worker));
console.log(`\nDone: ${done}, Failed: ${failed}`);
