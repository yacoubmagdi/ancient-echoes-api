import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const LOVABLE_KEY = process.env.LOVABLE_API_KEY;

const { data: allPersonas } = await supabase
  .from('personas')
  .select('id, name, role, description, source_image_url')
  .order('name');

const urlCounts = {};
for (const p of allPersonas) {
  urlCounts[p.source_image_url] = (urlCounts[p.source_image_url] || 0) + 1;
}

const genericPatterns = [
  'Ancient_Egyptian_officials', 'Ancient_Egyptian_literature', 'Ancient_Egyptian_law',
  'Military_of_ancient_Egypt', 'Deir_el-Medina', 'Dynasty_of_Egypt',
  'Book_of_the_Dead', 'Dendera_Temple', 'Serabit_el-Khadim', 'Royal_Cache',
  'Battle_of_Kadesh', 'Vizier_(Ancient_Egypt)', 'Hathor', 'Neith'
];

const needsFix = allPersonas.filter(p => {
  const url = p.source_image_url;
  if (genericPatterns.some(g => url.includes(g))) return true;
  if (urlCounts[url] > 1) {
    // Check if the URL name matches persona
    const wikiName = (url.split('/wiki/')[1] || '').replace(/_/g, ' ').toLowerCase();
    const pName = p.name.toLowerCase().replace(/^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن) /, '');
    // If clearly not about this person
    if (wikiName.length > 3 && !pName.includes(wikiName.slice(0,5))) return true;
  }
  return false;
});

console.log(`Personas needing fix: ${needsFix.length}`);

const BATCH = 15;
let updated = 0;

for (let i = 0; i < needsFix.length; i += BATCH) {
  const batch = needsFix.slice(i, i + BATCH);
  const prompt = `You are an expert Egyptologist. For each ancient Egyptian persona, provide the MOST SPECIFIC English Wikipedia URL about THIS person or their primary archaeological evidence.

Rules:
- Use the person's own Wikipedia page if it exists
- Otherwise use their specific tomb (e.g. TT71), stela, papyrus, or artifact page
- NEVER use generic category pages (like "Ancient_Egyptian_officials")
- URL must start with https://en.wikipedia.org/wiki/
- The page must actually exist on Wikipedia

${batch.map((p, idx) => `${idx+1}. ID: ${p.id}
   Name: ${p.name} | Role: ${p.role}
   Desc: ${(p.description || '').slice(0, 150)}`).join('\n\n')}

Return ONLY a JSON array: [{"id":"uuid","url":"https://en.wikipedia.org/wiki/..."}]`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages: [{ role: 'user', content: prompt }] }),
    });

    if (!resp.ok) {
      console.error(`Batch ${i}: HTTP ${resp.status}`);
      if (resp.status === 402) break;
      continue;
    }

    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content || '';
    const match = content.match(/\[[\s\S]*?\]/);
    if (!match) { console.error(`No JSON batch ${i}`); continue; }

    const results = JSON.parse(match[0]);
    for (const r of results) {
      if (!r.id || !r.url?.startsWith('https://en.wikipedia.org/wiki/')) continue;
      const { error } = await supabase.from('personas').update({ source_image_url: r.url }).eq('id', r.id);
      if (!error) updated++;
      else console.error(`Update ${r.id}: ${error.message}`);
    }
    console.log(`Batch ${Math.floor(i/BATCH)+1}: done (total updated: ${updated})`);
    await new Promise(r => setTimeout(r, 1500));
  } catch (e) { console.error(`Batch ${i}: ${e.message}`); }
}

console.log(`\nComplete: ${updated}/${needsFix.length} updated`);
