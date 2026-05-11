import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const desc = JSON.parse(fs.readFileSync('/tmp/necho2_desc.json','utf8'));
const { error } = await sb.from('personas').update({ face_descriptor: desc }).eq('id','d7e98e13-b027-442d-9018-941c62743273');
console.log(error || 'OK');
