import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = randomUUID();
const ts = Date.now();

// upload portrait
const portraitPath = `Pharaoh/${id}_${ts}.png`;
const up1 = await sb.storage.from('personas').upload(portraitPath, readFileSync('/tmp/hat_real.png'), { contentType: 'image/png', upsert: true });
if (up1.error) throw up1.error;
const portraitUrl = sb.storage.from('personas').getPublicUrl(portraitPath).data.publicUrl;

// upload source ref
const srcPath = `Pharaoh/${id}_source_${ts}.jpg`;
const up2 = await sb.storage.from('personas').upload(srcPath, readFileSync('/tmp/hat_src.jpg'), { contentType: 'image/jpeg', upsert: true });
if (up2.error) throw up2.error;
const srcUrl = sb.storage.from('personas').getPublicUrl(srcPath).data.publicUrl;

const description = `حتشبسوت (حوالي 1507–1458 ق.م) هي خامس فراعنة الأسرة الثامنة عشرة في الدولة الحديثة بمصر القديمة، وتُعد من أعظم الحاكمات في التاريخ. ابنة الفرعون تحتمس الأول وزوجة وأخت تحتمس الثاني. حكمت كوصية ثم كفرعون كامل الصلاحيات لأكثر من عشرين عامًا. اشتهرت بمشاريعها المعمارية الضخمة وأبرزها معبدها الجنائزي في الدير البحري بتصميم المهندس سننموت، ومسلتيها في معبد الكرنك. أعادت إحياء طرق التجارة وأرسلت بعثة شهيرة إلى بلاد بونت. كانت تُصوَّر بلحية ملكية مزيفة وغطاء رأس النمس رمزًا لسلطتها كفرعون. المراجع: تمثال الجلوس بمتحف المتروبوليتان (MET 29.3.2)، نقوش معبد الدير البحري، ويكيبيديا العربية، نصوص بعثة بونت في الدير البحري.`;

const { data, error } = await sb.from('personas').insert({
  id,
  name: 'حتشبسوت',
  name_en: 'Hatshepsut',
  category: 'Pharaoh',
  role: 'pharaoh',
  gender: 'female',
  description,
  image_url: portraitUrl,
  source_image_url: srcUrl,
  verification_status: 'verified',
  is_drawing: false
}).select().single();
if (error) { console.error(error); process.exit(1); }
console.log('OK', id, portraitUrl);
