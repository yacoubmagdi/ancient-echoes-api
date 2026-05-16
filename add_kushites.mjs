import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://egypt-museum.com/egyptians-in-battle-against-the-nubians/';

const items = [
  {
    name: 'محارب كوشي',
    name_en: 'Kushite Warrior',
    file: '/tmp/kushite1.jpg',
    description: 'محارب من بلاد كوش (النوبة العليا) جنوب النيل، صوّرته النقوش المصرية في عصر الدولة الحديثة بين جيوش الأعداء الذين حاربهم الفراعنة لتأمين مناجم الذهب وطرق التجارة في الجنوب. يتميز ببشرة داكنة وشعر مجعد قصير وأقراط ذهبية كبيرة وعقود من الخرز، ويحمل قوسه ورماحه. يظهر مشهد مماثل على صندوق توت عنخ آمون الخشبي المزخرف بمناظر الحرب ضد النوبيين.',
  },
  {
    name: 'حامل جزية نوبي',
    name_en: 'Nubian Tribute Bearer',
    file: '/tmp/kushite2.jpg',
    description: 'رجل نوبي من حاملي الجزية الذين كانوا يقدّمون إلى بلاط الفرعون حلقات الذهب وأخشاب الأبنوس وجلود الفهد والحيوانات النادرة من بلاد كوش ووواوات جنوب مصر. صُوّر هؤلاء الحاملون في مقابر نواب الملك على كوش مثل مقبرة "حوي" نائب توت عنخ آمون، حُلق الرأس، أقراط ذهبية قرصية، عقد عريض من الخرز، وإزار كتاني أبيض بحزام أحمر.',
  },
  {
    name: 'أمير كوشي',
    name_en: 'Kushite Prince',
    file: '/tmp/kushite3.jpg',
    description: 'أمير من نبلاء كوش، صوّرته الفنون المصرية في عصر الدولة الحديثة بهيئة مهيبة: بشرة داكنة، تسريحة نوبية مضفّرة، عصابة ذهبية وريشة نعام على الرأس، أقراط حلقية كبيرة، أساور ذهبية، ووشاح من جلد الفهد. كان أمراء كوش يُرسلون أحياناً إلى البلاط الملكي المصري كرهائن شرف ليتربّوا مع أبناء الفرعون ثم يعودوا حكاماً موالين لبلادهم تحت السيادة المصرية.',
  },
];

for (const it of items) {
  const id = crypto.randomUUID();
  const bytes = fs.readFileSync(it.file);
  const path = `Pharaoh/${id}_kushite_${Date.now()}.jpg`;
  const up = await s.storage.from('personas').upload(path, bytes, { contentType:'image/jpeg', upsert:true });
  if (up.error) { console.error(it.name, up.error); continue; }
  const { data: { publicUrl } } = s.storage.from('personas').getPublicUrl(path);
  const ins = await s.from('personas').insert({
    id, name: it.name, name_en: it.name_en,
    category: 'Pharaoh', role: 'شخصية تاريخية', gender: 'male',
    description: it.description, image_url: publicUrl,
    source_image_url: SRC, is_drawing: false,
  });
  console.log(ins.error ? `❌ ${it.name}: ${ins.error.message}` : `✅ ${it.name} ${id}`);
}
