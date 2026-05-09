import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = '4b84bc89-96a8-43eb-bfe3-6a562ee00f68';
const path = `Pharaoh/${id}_v2_${Date.now()}.png`;
const up = await sb.storage.from('personas').upload(path, readFileSync('/tmp/henuttawy3.png'), { contentType:'image/png', upsert:true });
if (up.error) throw up.error;
const url = sb.storage.from('personas').getPublicUrl(path).data.publicUrl;
const description = 'حنوت تاوي الثالثة (Henettawy C) سيدة نبيلة من الأسرة الحادية والعشرين في عصر الانتقال الثالث (نحو 1000 ق.م). كانت تحمل لقب "مغنية آمون الكبرى" (Chantress of Amun) في معبد الكرنك بطيبة. هي ابنة الكاهن الأكبر سمندس الثاني وحفيدة الكاهن الأكبر منخبر رع. عُثر على مقبرتها سليمة في خبيئة الدير البحري عام 1881، وتحتوي على تابوت خشبي مذهّب فاخر مزخرف بمشاهد دينية رائعة الألوان لا تزال زاهية حتى اليوم، إضافة إلى بردية كتاب الموتى. تابوتها محفوظ حالياً في متحف المتروبوليتان للفنون بنيويورك ويُعد من أجمل توابيت الأسرة الحادية والعشرين.';
const { error } = await sb.from('personas').update({ 
  name: 'حنوت تاوي الثالثة (Henettawy C)',
  description,
  source_image_url: 'https://en.wikipedia.org/wiki/Henettawy_(C)',
  image_url: url, 
  face_descriptor: null 
}).eq('id', id);
if (error) throw error;
console.log('OK', url);
