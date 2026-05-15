import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const PID = 'ad8fc042-2668-4012-9429-d96eb4a8a15d';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const buf = fs.readFileSync('/tmp/merneptah.jpg');
const path = `Pharaoh/${PID}_${Date.now()}.jpg`;
const up = await s.storage.from('personas').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data: { publicUrl } } = s.storage.from('personas').getPublicUrl(path);
const { error } = await s.from('personas').update({ image_url: publicUrl, is_drawing: false }).eq('id', PID);
if (error) { console.error(error); process.exit(1); }
console.log('OK', publicUrl);