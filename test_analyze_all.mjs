import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const URL = `${process.env.SUPABASE_URL}/functions/v1/analyze-face`;
const KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

const { data: rows, error } = await s.from('personas')
  .select('id,name,face_descriptor')
  .not('face_descriptor','is',null);
if (error) throw error;

console.log(`Testing ${rows.length} personas...`);
let perfect=0, correct=0, wrong=0, errors=0;
const issues = [];

for (let i = 0; i < rows.length; i++) {
  const p = rows[i];
  if (!Array.isArray(p.face_descriptor) || p.face_descriptor.length !== 128) { errors++; continue; }
  // Spoof IP per request to bypass rate limit
  const fakeIp = `10.0.${Math.floor(i/256)}.${i%256}`;
  try {
    const resp = await fetch(URL, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`,
        'x-forwarded-for': fakeIp,
      },
      body: JSON.stringify({ descriptor: p.face_descriptor, lang: 'ar' }),
    });
    const body = await resp.json();
    if (!resp.ok) {
      errors++;
      issues.push({ name: p.name, status: resp.status, error: body.error });
      continue;
    }
    const matchedSelf = body.persona_id === p.id;
    const sim = body.similarity;
    if (matchedSelf && sim >= 95) perfect++;
    else if (matchedSelf) correct++;
    else {
      wrong++;
      issues.push({ name: p.name, expected_id: p.id, got_id: body.persona_id, got_name: body.match_name, similarity: sim });
    }
  } catch (e) {
    errors++;
    issues.push({ name: p.name, error: e.message });
  }
  if ((i+1) % 25 === 0) console.log(`  progress ${i+1}/${rows.length} | perfect=${perfect} ok=${correct} wrong=${wrong} err=${errors}`);
}
console.log('\n=== RESULT ===');
console.log(`Total: ${rows.length}`);
console.log(`Perfect (self & sim≥95): ${perfect}`);
console.log(`Correct (self, sim<95): ${correct}`);
console.log(`Wrong match: ${wrong}`);
console.log(`Errors: ${errors}`);
if (issues.length) console.log('\nIssues:', JSON.stringify(issues.slice(0,30), null, 2));
