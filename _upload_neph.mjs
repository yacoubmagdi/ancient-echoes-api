import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = '87c6b8d1-e64c-4968-a090-e9b79d0784a4';
const path = `Pharaoh/${id}_regen_${Date.now()}.png`;
const bytes = fs.readFileSync('/tmp/nepherites_portrait.png');
const { error: ue } = await sb.storage.from('personas').upload(path, bytes, { contentType: 'image/png', upsert: true });
if (ue) { console.error(ue); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const { error: dbe } = await sb.from('personas').update({ image_url: publicUrl, source_image_url: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Neferites_sphinx_cropped.jpg', face_descriptor: null }).eq('id', id);
if (dbe) { console.error(dbe); process.exit(1); }
console.log('OK', publicUrl);
