import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = randomUUID();
const path = `Pharaoh/${id}_maatkare_${Date.now()}.png`;
const up = await sb.storage.from('personas').upload(path, readFileSync('/tmp/maatkare.png'), { contentType:'image/png', upsert:true });
if (up.error) throw up.error;
const url = sb.storage.from('personas').getPublicUrl(path).data.publicUrl;
const { error } = await sb.from('personas').insert({
  id,
  name: 'ماعت كا رع',
  name_en: 'Maatkare Mutemhat',
  category: 'Pharaoh',
  role: 'priestess',
  gender: 'female',
  description: 'ماعت كا رع موت إم حات، زوجة الإله آمون والكاهنة الكبرى في طيبة خلال الأسرة الحادية والعشرين (حوالي 1050 ق.م). ابنة الفرعون والكاهن الأكبر بينجم الأول، وحفيدة حريحور. حملت أعلى لقب ديني للنساء في مصر القديمة، ودُفنت في الدير البحري، ووُجدت موميائها ضمن مخبأ الموميات الملكية في الدير البحري.',
  description_en: 'Maatkare Mutemhat, God\'s Wife of Amun and high priestess in Thebes during the 21st Dynasty (c. 1050 BCE). Daughter of Pharaoh and High Priest Pinedjem I, granddaughter of Herihor. She held the highest religious title for women in ancient Egypt. Her mummy was found in the Deir el-Bahari royal cache.',
  image_url: url,
  source_image_url: 'https://ar.wikipedia.org/wiki/%D9%85%D8%A7%D8%B9%D8%AA_%D9%83%D8%A7_%D8%B1%D8%B9',
  is_drawing: false,
});
if (error) throw error;
console.log('OK', id, url);
