import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: p } = await s.from('personas').select('id').eq('name_en','Nykara').single();
if (!p) { console.error('not found'); process.exit(1); }
const bytes = fs.readFileSync('/tmp/nykara_user.jpg');
const path = `Pharaoh/${p.id}_nykara_${Date.now()}.jpg`;
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType:'image/jpeg', upsert:true });
if (ue) throw ue;
const { data: u } = s.storage.from('personas').getPublicUrl(path);
const { error: e } = await s.from('personas').update({ image_url: u.publicUrl, face_descriptor: null }).eq('id', p.id);
if (e) throw e;
console.log('OK', u.publicUrl);
