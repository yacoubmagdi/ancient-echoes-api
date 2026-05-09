import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = 'ee59d7fb-5de9-4470-8e7d-7a0d938e6730';
const path = `Pharaoh/${id}_regen_${Date.now()}.png`;
const buf = readFileSync('/tmp/nefertem_real_v2.png');
const up = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/png', upsert: true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const { error } = await sb.from('personas').update({ image_url: publicUrl, face_descriptor: null }).eq('id', id);
if (error) { console.error(error); process.exit(1); }
console.log('OK', publicUrl);
