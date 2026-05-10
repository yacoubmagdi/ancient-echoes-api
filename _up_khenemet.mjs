import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = '7d9c6956-ff77-4d78-b01b-d7b26c619243';
const buf = readFileSync('/tmp/khenemet_v2.png');
const path = `Queen/${id}_v2_${Date.now()}.png`;
const { error: upErr } = await supabase.storage.from('personas').upload(path, buf, { contentType: 'image/png', upsert: true });
if (upErr) { console.error(upErr); process.exit(1); }
const { data: { publicUrl } } = supabase.storage.from('personas').getPublicUrl(path);
const { error } = await supabase.from('personas').update({ image_url: publicUrl, face_descriptor: null }).eq('id', id);
if (error) { console.error(error); process.exit(1); }
console.log('OK', publicUrl);