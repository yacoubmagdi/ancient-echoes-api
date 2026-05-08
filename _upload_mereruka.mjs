import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = 'e253bc5a-eeba-4ea3-9b42-5931d46e8b3a';
const path = `Pharaoh/${id}_regen_${Date.now()}.png`;
const bytes = fs.readFileSync('/tmp/mereruka_portrait.png');
const { error: ue } = await sb.storage.from('personas').upload(path, bytes, { contentType: 'image/png', upsert: true });
if (ue) { console.error(ue); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const { error: dbe } = await sb.from('personas').update({ image_url: publicUrl, source_image_url: 'https://upload.wikimedia.org/wikipedia/commons/7/74/S10.08_Sakkara%2C_image_9953.jpg', face_descriptor: null }).eq('id', id);
if (dbe) { console.error(dbe); process.exit(1); }
console.log('OK', publicUrl);
