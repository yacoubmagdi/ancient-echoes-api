import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = '12347bc7-61ac-4b4b-b3e2-e57ef5092ce0';
const path = `Pharaoh/${id}_regen_${Date.now()}.png`;
const bytes = fs.readFileSync('/tmp/tetisheri_portrait.png');
const { error: ue } = await sb.storage.from('personas').upload(path, bytes, { contentType: 'image/png', upsert: true });
if (ue) { console.error(ue); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);

const description = 'الملكة تيتي شيري (حوالي 1560 ق.م)، الجدة المؤسسة للأسرة الثامنة عشرة في مصر القديمة. كانت زوجة الفرعون سنخت إن رع أحمس من الأسرة السابعة عشرة، ووالدة الفرعون سقنن رع تاعا الثاني والملكة أححتب الأولى، وجدة الفرعون أحمس الأول محرر مصر من الهكسوس والملكة أحمس نفرتاري. لُقبت بـ"أم الملك" و"الأم العظمى للملك"، ولعبت دوراً سياسياً ودينياً محورياً في حرب التحرير ضد الهكسوس. كرّمها حفيدها أحمس الأول ببناء مقبرة رمزية ومعبد جنائزي وهرم صغير في أبيدوس، ونقش لها لوحة تذكارية شهيرة محفوظة في المتحف المصري بالقاهرة. يُنسب إليها التمثال الصغير الشهير المحفوظ في المتحف البريطاني (EA 22558) الذي يُظهرها بغطاء رأس النسر الملكي.';

const descriptionEn = 'Queen Tetisheri (c. 1560 BC) was the matriarch and founding ancestor of the Egyptian 18th Dynasty. Wife of Pharaoh Senakhtenre Ahmose of the 17th Dynasty, mother of Pharaoh Seqenenre Tao II and Queen Ahhotep I, and grandmother of Pharaoh Ahmose I (who liberated Egypt from the Hyksos) and Queen Ahmose-Nefertari. Bearing the titles "King\'s Mother" and "Great King\'s Mother", she played a pivotal political and religious role in the war of liberation against the Hyksos. Her grandson Ahmose I honored her by erecting a cenotaph, mortuary temple, and small pyramid at Abydos, along with a famous donation stela now in the Egyptian Museum in Cairo. The well-known small limestone statuette in the British Museum (EA 22558) depicting her wearing the royal vulture headdress is traditionally attributed to her.';

const { error: dbe } = await sb.from('personas').update({
  description,
  description_en: descriptionEn,
  role: 'queen',
  image_url: publicUrl,
  source_image_url: 'https://en.wikipedia.org/wiki/Tetisheri',
  face_descriptor: null
}).eq('id', id);
if (dbe) { console.error(dbe); process.exit(1); }
console.log('OK', publicUrl);
