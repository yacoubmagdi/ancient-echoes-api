import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = '43f941e6-5ae3-47fe-8d39-3f44c79436cf';
const path = `Pharaoh/${id}_real_${Date.now()}.png`;
const buf = readFileSync('/tmp/herihor_real.png');
const up = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/png', upsert: true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const { error } = await sb.from('personas').update({ image_url: publicUrl, face_descriptor: null }).eq('id', id);
if (error) { console.error(error); process.exit(1); }
console.log('OK', publicUrl);
