import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://arz.wikipedia.org/wiki/%D9%85%D8%A7%D9%86%D9%8A%D8%AA%D9%88%D9%86';
const description = 'مانيتون كاهن ومؤرخ مصري عاش في عهد البطالمة (القرن الثالث ق.م) في مدينة سمنود بالدلتا. كتب باليونانية مؤلفه الشهير "إيجيبتياكا" (تاريخ مصر) الذي قسّم فيه ملوك مصر القديمة إلى ثلاثين أسرة حاكمة، وهو التقسيم المعتمد حتى اليوم في علم المصريات. ويُعدّ مرجعًا أساسيًا للمؤرخين القدماء واللاحقين في دراسة تسلسل الفراعنة وتاريخ الحضارة المصرية.';
const ins = await s.from('personas').insert({
  name: 'مانيتون', name_en: 'Manetho', category: 'Pharaoh',
  role: 'priest', gender: 'male', description,
  source_image_url: SRC, image_url: 'pending', is_drawing: false,
}).select('id').single();
if (ins.error) { console.error(ins.error); process.exit(1); }
const PID = ins.data.id;
const buf = fs.readFileSync('/tmp/manetho.png');
const path = `Pharaoh/${PID}_${Date.now()}.png`;
const up = await s.storage.from('personas').upload(path, buf, { contentType:'image/png', upsert:true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data:{ publicUrl } } = s.storage.from('personas').getPublicUrl(path);
const upd = await s.from('personas').update({ image_url: publicUrl }).eq('id', PID);
console.log(upd.error || 'OK', PID, publicUrl);
