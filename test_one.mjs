import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows } = await s.from('personas').select('id,name,face_descriptor').eq('name','منتوحتب الأول');
const p = rows[0];
console.log('Self desc[0..3]:', p.face_descriptor.slice(0,3));
const URL = `${process.env.SUPABASE_URL}/functions/v1/analyze-face`;
const KEY = process.env.SUPABASE_ANON_KEY;
const resp = await fetch(URL, {
  method:'POST',
  headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':`Bearer ${KEY}`,'x-forwarded-for':'9.9.9.9'},
  body: JSON.stringify({ descriptor: p.face_descriptor, lang:'ar', debug: true })
});
const body = await resp.json();
console.log('Best:', body.match_name, 'sim=', body.similarity);
console.log('Top 3:', body.matches?.map(m => `${m.match_name}:${m.similarity}`).join(' | '));
console.log('Debug:', body._debug);

// Now query top in DB to find self distance vs winner
const { data: winner } = await s.from('personas').select('id,name,face_descriptor').eq('name', body.match_name).single();
let sd=0, wd=0;
for (let i=0;i<128;i++){ sd+=Math.pow(p.face_descriptor[i]-p.face_descriptor[i],2); wd+=Math.pow(p.face_descriptor[i]-winner.face_descriptor[i],2);}
console.log('Self distance:', Math.sqrt(sd), 'Winner distance:', Math.sqrt(wd));
