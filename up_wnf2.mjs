import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = 'c6b649a1-f25f-4d0e-b1db-4ca412811330';
const url = 'https://kfycwzfhyermjhupyrpk.supabase.co/storage/v1/object/public/personas/Pharaoh/c6b649a1-f25f-4d0e-b1db-4ca412811330_wenennefer_1778532314456.jpg';
const { error } = await sb.from('personas').update({ image_url: url, is_drawing: false }).eq('id', ID);
if (error) throw error;
console.log('image_url updated OK');
