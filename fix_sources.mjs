// This script uses Lovable AI to find correct Wikipedia source URLs for each persona
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LOVABLE_KEY = process.env.LOVABLE_API_KEY;

// Get ALL personas with shared URLs
const { data: shared } = await supabase.rpc('', {}).catch(() => ({data: null}));

// Get shared URLs
const { data: allPersonas } = await supabase
  .from('personas')
  .select('id, name, role, description, source_image_url')
  .order('name');

// Find URLs used more than once
const urlCounts = {};
for (const p of allPersonas) {
  urlCounts[p.source_image_url] = (urlCounts[p.source_image_url] || 0) + 1;
}

// Personas that need fixing: shared URL OR generic URL
const needsFix = allPersonas.filter(p => {
  const url = p.source_image_url;
  // Generic URLs
  if (url.includes('Ancient_Egyptian_officials') || 
      url.includes('Ancient_Egyptian_literature') ||
      url.includes('Ancient_Egyptian_law') ||
      url.includes('Military_of_ancient_Egypt') ||
      url.includes('Deir_el-Medina') ||
      url.includes('Dynasty_of_Egypt') ||
      url.includes('Book_of_the_Dead') ||
      url.includes('Dendera_Temple') ||
      url.includes('Serabit_el-Khadim') ||
      url.includes('Royal_Cache') ||
      url.includes('Battle_of_Kadesh') ||
      url.includes('Vizier_(Ancient_Egypt)')) {
    return true;
  }
  // URL count > 1 AND persona name doesn't match the URL
  if (urlCounts[url] > 1) {
    const urlName = url.split('/wiki/')[1]?.replace(/_/g, ' ').toLowerCase() || '';
    const pName = p.name.toLowerCase();
    // If URL clearly belongs to a different person
    if (!urlName.includes(pName.slice(0,4)) && !pName.includes(urlName.slice(0,4))) {
      return true;
    }
  }
  return false;
});

console.log(`Total personas needing source fix: ${needsFix.length}`);

// Process in batches using AI
const BATCH = 15;
let updated = 0;
let errors = [];

for (let i = 0; i < needsFix.length; i += BATCH) {
  const batch = needsFix.slice(i, i + BATCH);
  const prompt = `You are an Egyptologist. For each persona below, provide the most specific and accurate English Wikipedia URL that is about THIS specific person or their most relevant archaeological artifact/tomb/inscription.

Rules:
- URL must be a real Wikipedia page that exists
- Must be specific to THIS person, not a generic category page
- If the person has their own Wikipedia page, use it
- If not, use their tomb page (e.g. TT55), their archaeological site, their papyrus, or the most relevant specific artifact
- For lesser-known figures, use their most relevant specific archaeological context (specific tomb, specific papyrus, specific stela)
- NEVER use generic pages like "Ancient_Egyptian_officials" or dynasty overview pages

Personas:
${batch.map((p, idx) => `${idx+1}. Name: ${p.name} | Role: ${p.role} | Current URL: ${p.source_image_url}
   Description: ${(p.description || '').slice(0, 200)}`).join('\n')}

Respond ONLY with a JSON array of objects: [{"id": "uuid", "url": "https://en.wikipedia.org/wiki/..."}]
Use these exact IDs:
${batch.map((p, idx) => `${idx+1}. ${p.id}`).join('\n')}`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error(`AI error batch ${i}: ${resp.status} ${t.slice(0,200)}`);
      if (resp.status === 402) break;
      continue;
    }

    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content || '';
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error(`No JSON in batch ${i}`);
      continue;
    }

    const results = JSON.parse(match[0]);
    for (const r of results) {
      if (!r.id || !r.url || !r.url.startsWith('https://en.wikipedia.org/wiki/')) continue;
      
      const { error } = await supabase
        .from('personas')
        .update({ source_image_url: r.url })
        .eq('id', r.id);
      
      if (error) {
        errors.push(`${r.id}: ${error.message}`);
      } else {
        updated++;
      }
    }
    console.log(`Batch ${i}-${i+batch.length}: updated ${results.length} records (total: ${updated})`);
    
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
    console.error(`Batch ${i} error: ${e.message}`);
  }
}

console.log(`\nDone: ${updated}/${needsFix.length} updated`);
if (errors.length) console.log('Errors:', errors.slice(0, 10));
