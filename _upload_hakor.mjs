import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = '7af13559-a1b7-449d-9c88-01d881536a6f';
const bytes = fs.readFileSync('/tmp/hakor_realistic.png');
const path = `Pharaoh/${id}_regen_${Date.now()}.png`;
const { error: ue } = await sb.storage.from('personas').upload(path, bytes, { contentType: 'image/png', upsert: true });
if (ue) { console.error(ue); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const { error: dbe } = await sb.from('personas').update({ image_url: publicUrl, face_descriptor: null }).eq('id', id);
if (dbe) { console.error(dbe); process.exit(1); }
console.log('OK', publicUrl);
