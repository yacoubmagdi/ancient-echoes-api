import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = 'ee59d7fb-5de9-4470-8e7d-7a0d938e6730';
const path = `Pharaoh/${id}_regen_${Date.now()}.png`;
const file = fs.readFileSync('/tmp/nefertem_realistic.png');
const { error: ue } = await s.storage.from('personas').upload(path, file, { contentType: 'image/png', upsert: true });
if (ue) { console.error(ue); process.exit(1); }
const { data: { publicUrl } } = s.storage.from('personas').getPublicUrl(path);
const { error: dbe } = await s.from('personas').update({ image_url: publicUrl, face_descriptor: null }).eq('id', id);
if (dbe) { console.error(dbe); process.exit(1); }
console.log('OK', publicUrl);
