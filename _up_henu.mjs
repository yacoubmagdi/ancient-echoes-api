import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = '64083de3-11d0-450b-9049-9d72f533790c';
const path = `Pharaoh/${id}_henu_real_${Date.now()}.png`;
const up = await sb.storage.from('personas').upload(path, readFileSync('/tmp/henu_real.png'), { contentType: 'image/png', upsert: true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const { error } = await sb.from('personas').update({ image_url: publicUrl, face_descriptor: null, source_image_url: 'https://en.wikipedia.org/wiki/Henenu_(high_steward)' }).eq('id', id);
if (error) { console.error(error); process.exit(1); }
console.log(publicUrl);
