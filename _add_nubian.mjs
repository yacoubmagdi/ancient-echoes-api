import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = randomUUID();
const path = `Pharaoh/${id}_nubian_${Date.now()}.png`;
const up = await sb.storage.from('personas').upload(path, readFileSync('/tmp/nubian_portrait.png'), { contentType: 'image/png', upsert: true });
if (up.error) throw up.error;
const url = sb.storage.from('personas').getPublicUrl(path).data.publicUrl;
const { error } = await sb.from('personas').insert({
  id,
  name: 'الأسير النوبي (مقبض عصا توت عنخ آمون)',
  name_en: 'Nubian Captive (Tutankhamun\'s Walking Stick)',
  category: 'Pharaoh',
  role: 'شخصية تاريخية',
  gender: 'male',
  image_url: url,
  source_image_url: 'https://en.wikipedia.org/wiki/Tutankhamun',
  description: 'شخصية مستوحاة من المقبض المنحوت لإحدى عصي توت عنخ آمون الاحتفالية (الأسرة الثامنة عشرة، حوالي 1330 ق.م)، المعروضة بالمتحف المصري. صُنع المقبض من خشب الأبنوس المطعّم بالذهب على هيئة أسير نوبي مكبّل اليدين، يرتدي عصابة رأس مزخرفة. تمثل هذه القطعة التقليد الفني الفرعوني في تصوير "الأعداء التسعة" (الشعوب التي كان الفرعون يخضعها رمزياً)، وكانت العصي والصنادل التي تحمل صور الأسرى تعبيراً رمزياً عن انتصار الملك على أعدائه من النوبة وآسيا.',
  description_en: 'A figure inspired by the carved handle of one of Tutankhamun\'s ceremonial walking sticks (18th Dynasty, c.1330 BCE), now in the Egyptian Museum. The handle is made of ebony inlaid with gold in the form of a bound Nubian captive wearing an ornate headband. This piece represents the pharaonic artistic tradition of depicting the "Nine Bows" (peoples symbolically subjugated by the pharaoh); sticks and sandals bearing prisoner imagery symbolized the king\'s triumph over his Nubian and Asiatic enemies.'
});
if (error) throw error;
console.log('OK', id, url);
