import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://www.metmuseum.org/art/collection/search/553770';
const id = crypto.randomUUID();

// 1) upload source artwork
const srcBytes = fs.readFileSync('/tmp/met_woman.jpg');
const srcPath = `Pharaoh/${id}_src_${Date.now()}.jpg`;
{
  const { error } = await s.storage.from('personas').upload(srcPath, srcBytes, { contentType:'image/jpeg', upsert:true });
  if (error) throw error;
}
const srcUrl = s.storage.from('personas').getPublicUrl(srcPath).data.publicUrl;

// 2) Arabic description
const desc_resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({model:'google/gemini-2.5-flash',messages:[{role:'user',content:'اكتب وصفاً تاريخياً موجزاً (3-4 أسطر) باللغة العربية الفصحى عن "النصف العلوي لتمثال امرأة من تمثال زوجي" من الأسرة الثامنة عشرة في عصر الدولة الحديثة، عهد تحتمس الأول إلى تحتمس الثالث (حوالي 1504–1425 ق.م)، من طيبة - دراع أبو النجا في صعيد مصر، مصنوع من الحجر الرملي والألوان. اذكر ملامح الوجه الرقيقة، العينين الواسعتين المحاطتين بالكحل الأسود، الشعر الأسود الطويل بتقسيمة الباروكة الثلاثية، البشرة الذهبية، وأنها على الأرجح زوجة أحد كبار رجال الدولة. بدون مقدمات ولا عناوين.'}]}),
});
const dj = await desc_resp.json();
if (!desc_resp.ok) { console.error(dj); process.exit(1); }
const description = dj.choices[0].message.content.trim();
console.log('DESC:', description);

// 3) generate realistic portrait from artwork
const b64 = srcBytes.toString('base64');
const prompt = `Create a hyper-realistic museum-quality portrait painting of an ancient Egyptian noblewoman from the 18th Dynasty, New Kingdom (ca. 1504–1425 B.C.), based directly on the attached painted sandstone statue from Thebes. Match the facial features exactly: gentle delicate face, large almond eyes outlined with thick black kohl, arched eyebrows, slight smile, long black tripartite wig framing the face. Warm golden-brown skin tone (historically accurate ancient Egyptian complexion). Wearing fine white linen dress, broad gold collar with lapis lazuli and carnelian beads, gold earrings. Dramatic chiaroscuro lighting, rich gold and earth tones. NO text, NO watermarks, NO modern elements. Clear, undistorted, photorealistic face suitable for a world-class Egyptology museum exhibition.`;

const ai = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({
    model:'google/gemini-3-pro-image-preview',
    messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:image/jpeg;base64,${b64}`}}]}],
    modalities:['image','text'],
  }),
});
const aj = await ai.json();
if (!ai.ok) { console.error(aj); process.exit(1); }
const imgB64 = aj.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!imgB64) { console.error('no image', JSON.stringify(aj).slice(0,500)); process.exit(1); }
const data = imgB64.includes(',')?imgB64.split(',')[1]:imgB64;
const bytes = Buffer.from(data,'base64');

const path = `Pharaoh/${id}_${Date.now()}.png`;
{
  const { error } = await s.storage.from('personas').upload(path, bytes, { contentType:'image/png', upsert:true });
  if (error) throw error;
}
const url = s.storage.from('personas').getPublicUrl(path).data.publicUrl;

const { error: ie } = await s.from('personas').insert({
  id,
  name: 'سيدة من طيبة',
  name_en: 'Theban Noblewoman',
  category: 'Pharaoh',
  role: 'شخصية تاريخية',
  gender: 'female',
  description,
  image_url: url,
  source_image_url: srcUrl,
  is_drawing: false,
});
if (ie) throw ie;
console.log('OK ✅', id, url);
