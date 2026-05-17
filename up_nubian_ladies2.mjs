import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://egypt-museum.com/tribute-from-the-south-lower-nubia-wawat-upper-nubia-kush/';
const items = [
  {
    name:'أميرة كوش', name_en:'Princess of Kush', file:'/tmp/princess_kush.jpg',
    description:'أميرة من كوش (النوبة العليا) صُوّرت في مقبرة "حوي" نائب الملك على كوش، ضمن مشهد تقديم الجزية الجنوبية إلى الفرعون توت عنخ آمون في الأسرة الثامنة عشرة من الدولة الحديثة. تظهر بزيّ مصري راقٍ: ثوب كتاني أبيض مطوّي، وعقد عريض من الذهب والعقيق، وأقراط ذهبية كبيرة، وعصابة نوبية مزيّنة بريشة نعام تعلو شعرها المضفّر. كانت بنات أمراء كوش يُربَّين أحياناً في البلاط المصري ليصبحن جسراً بين الثقافتين تحت السيادة المصرية.',
  },
  {
    name:'سيدة نوبية', name_en:'Nubian Lady', file:'/tmp/nubian_woman2.jpg',
    description:'سيدة نوبية من بلاد كوش صُوّرت في مقبرة "حوي" نائب الملك على كوش في عهد توت عنخ آمون، ضمن موكب الجزية الجنوبية الذي وصل إلى طيبة. تتميز ببشرة داكنة وشعر أسود مضفر بالطريقة النوبية التقليدية مع عصابة من الخرز الأحمر والذهبي، وأقراط ذهبية حلقية كبيرة، وعقود متعددة من العقيق والخرز الذهبي، وثوب كتاني فاتح يكشف عن أحد الكتفين بحزام أحمر على الطريقة النوبية. تمثّل صورتها مكانة المرأة في وفود كوش التي حملت الذهب والعاج إلى البلاط الفرعوني.',
  },
];
for (const it of items) {
  const id = crypto.randomUUID();
  const bytes = fs.readFileSync(it.file);
  const path = `Pharaoh/${id}_${Date.now()}.jpg`;
  const up = await s.storage.from('personas').upload(path, bytes, {contentType:'image/jpeg',upsert:true});
  if (up.error) { console.error(it.name, up.error); continue; }
  const { data:{ publicUrl } } = s.storage.from('personas').getPublicUrl(path);
  const ins = await s.from('personas').insert({
    id, name: it.name, name_en: it.name_en,
    category:'Pharaoh', role:'شخصية تاريخية', gender:'female',
    description: it.description, image_url: publicUrl,
    source_image_url: SRC, is_drawing: false,
  });
  console.log(ins.error ? `❌ ${it.name}: ${ins.error.message}` : `✅ ${it.name} ${id}`);
}
