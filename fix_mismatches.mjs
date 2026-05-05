import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const LOVABLE_KEY = process.env.LOVABLE_API_KEY;
const toFix = JSON.parse(readFileSync('/tmp/to_fix.json','utf8'));

console.log(`Fixing ${toFix.length} personas in batches...`);

// Also fetch descriptions from DB for better context
const ids = toFix.map(p => p.id);
const { data: fullPersonas } = await supabase.from('personas').select('id,name,role,description,category').in('id', ids);
const descMap = {};
for (const p of fullPersonas) descMap[p.id] = p;

const BATCH = 20;
let updated = 0;
const results = [];

for (let i = 0; i < toFix.length; i += BATCH) {
  const batch = toFix.slice(i, i + BATCH);
  const prompt = `You are an expert Egyptologist. For each ancient Egyptian persona below, provide the MOST SPECIFIC and CORRECT English Wikipedia URL.

CRITICAL RULES:
- The URL MUST be about THIS SPECIFIC person, not a different person or generic topic
- Use the person's own Wikipedia page if it exists
- If no personal page exists, use their specific tomb (TT##), stela, papyrus, or artifact
- NEVER use generic category/period/location pages
- URL must start with https://en.wikipedia.org/wiki/
- Verify the Wikipedia page title matches the person described

${batch.map((p, idx) => {
  const full = descMap[p.id] || {};
  return `${idx+1}. ID: ${p.id}
   Name: ${p.name} | Role: ${full.role || p.role} | Category: ${full.category || ''}
   Current (WRONG): ${p.url} → "${p.wiki_title}"
   Description: ${(full.description || '').slice(0, 200)}`;
}).join('\n\n')}

Return ONLY a JSON array: [{"id":"uuid","url":"https://en.wikipedia.org/wiki/..."}]
No explanations.`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages: [{ role: 'user', content: prompt }], temperature: 0.1 }),
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

    const fixes = JSON.parse(match[0]);
    for (const r of fixes) {
      if (!r.id || !r.url?.startsWith('https://en.wikipedia.org/wiki/')) continue;
      // Don't update if same URL
      const orig = toFix.find(p => p.id === r.id);
      if (orig && orig.url === r.url) { results.push({...r, status:'unchanged'}); continue; }
      
      const { error } = await supabase.from('personas').update({ source_image_url: r.url }).eq('id', r.id);
      if (!error) { updated++; results.push({...r, name: orig?.name, status:'updated'}); }
      else { console.error(`Update ${r.id}: ${error.message}`); results.push({...r, status:'error', error: error.message}); }
    }
    console.log(`Batch ${Math.floor(i/BATCH)+1}/${Math.ceil(toFix.length/BATCH)}: done (updated: ${updated})`);
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) { console.error(`Batch ${i}: ${e.message}`); }
}

console.log(`\n✅ Complete: ${updated}/${toFix.length} updated`);
writeFileSync('/tmp/fix_results.json', JSON.stringify(results, null, 2));
