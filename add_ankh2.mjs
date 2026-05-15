import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Statue_of_Ankhenesneferibre_by_John_Campana.jpg';
const WIKI = 'https://ar.wikipedia.org/wiki/%D8%B9%D9%86%D8%AE%D9%86%D8%B3_%D9%86%D9%81%D8%B1_%D8%A5%D8%A8_%D8%B1%D8%B9';
const description = 'عنخنس نفر إب رع أميرة فرعونية وكاهنة مصرية من الأسرة السادسة والعشرين، ابنة الفرعون بسماتيك الثاني من زوجته تاخويت. شغلت منصب المتعبدة الإلهية لآمون ثم زوجة آمون بين 595 و525 ق.م في عهد بسماتيك الثاني وأبريس وأحمس الثاني وبسماتيك الثالث. استمرت في منصبها حتى الغزو الأخميني لمصر.';

const imgResp = await fetch(SRC);
const buf = Buffer.from(await imgResp.arrayBuffer());

const ins = await sb.from('personas').insert({
  name: 'الأميرة عنخنس نفر إب رع',
  name_en: 'Ankhnesneferibre',
  category: 'Pharaoh',
  role: 'priestess',
  gender: 'female',
  description,
  source_image_url: WIKI,
  image_url: 'pending',
  is_drawing: true,
}).select('id').single();
if (ins.error) { console.error(ins.error); process.exit(1); }
const PID = ins.data.id;

const path = `Pharaoh/${PID}_${Date.now()}.jpg`;
const up = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const upd = await sb.from('personas').update({ image_url: publicUrl }).eq('id', PID);
console.log(upd.error || 'OK', PID, publicUrl);
