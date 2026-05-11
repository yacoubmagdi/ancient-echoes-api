import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = 'd7e98e13-b027-442d-9018-941c62743273';
const path = `Pharaoh/${id}_necho2_${Date.now()}.jpg`;
const bytes = fs.readFileSync('/dev-server/necho2_v1.jpg');
const { error: ue } = await sb.storage.from('personas').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
if (ue) { console.error(ue); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const { error: upe } = await sb.from('personas').update({ image_url: publicUrl }).eq('id', id);
if (upe) { console.error(upe); process.exit(1); }
console.log('OK', publicUrl);
