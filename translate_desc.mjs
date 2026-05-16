import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = process.env.LOVABLE_API_KEY;

const { data: rows, error } = await s.from('personas')
  .select('id, name, name_en, role, description')
  .or('description_en.is.null,description_en.eq.')
  .not('description', 'is', null);
if (error) throw error;
console.log(`Found ${rows.length} to translate`);

let ok = 0, fail = 0;
for (let i = 0; i < rows.length; i++) {
  const p = rows[i];
  if (!p.description || p.description.trim().length < 5) { fail++; continue; }
  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: `Translate this Arabic historical description of "${p.name_en || p.name}" into clear, natural English. Output ONLY the English translation, no preface, no quotes, no notes:\n\n${p.description}` }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error(`[${i+1}/${rows.length}] ${p.name}: HTTP ${r.status} ${t.slice(0,120)}`);
      if (r.status === 402 || r.status === 429) { console.error('STOP'); break; }
      fail++; continue;
    }
    const j = await r.json();
    const en = j.choices?.[0]?.message?.content?.trim();
    if (!en || en.length < 5) { fail++; continue; }
    const { error: ue } = await s.from('personas').update({ description_en: en }).eq('id', p.id);
    if (ue) { console.error(`update ${p.id}:`, ue.message); fail++; }
    else { ok++; if ((i+1) % 10 === 0) console.log(`[${i+1}/${rows.length}] ok=${ok} fail=${fail}`); }
    await new Promise(r => setTimeout(r, 400));
  } catch (e) { console.error(p.name, e.message); fail++; }
}
console.log(`\nDONE ok=${ok} fail=${fail}`);
