import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const URL = `${process.env.SUPABASE_URL}/functions/v1/analyze-face`;
const KEY = process.env.SUPABASE_ANON_KEY;
const { data: rows } = await s.from('personas')
  .select('id,name,face_descriptor,is_drawing')
  .not('face_descriptor','is',null)
  .eq('is_drawing', false);
console.log(`Testing ${rows.length} non-drawing personas (search pool)...`);
let perfect=0, wrong=0;
const issues=[];
for (let i=0;i<rows.length;i++) {
  const p = rows[i];
  const resp = await fetch(URL, {
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':`Bearer ${KEY}`,'x-forwarded-for':`10.${Math.floor(i/65000)}.${Math.floor(i/256)%256}.${i%256}`},
    body: JSON.stringify({ descriptor: p.face_descriptor, lang:'ar' })
  });
  const b = await resp.json();
  if (!resp.ok) { issues.push({name:p.name, status:resp.status, err:b.error}); continue; }
  if (b.match_name === p.name && b.similarity >= 95) perfect++;
  else { wrong++; issues.push({name:p.name, got:b.match_name, sim:b.similarity}); }
}
console.log(`Perfect: ${perfect}/${rows.length}`);
console.log(`Wrong: ${wrong}`);
if (issues.length) console.log(JSON.stringify(issues, null, 2));
