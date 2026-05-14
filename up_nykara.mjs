import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC_PAGE = 'https://en.wikipedia.org/wiki/Nykara';
const srcB64 = fs.readFileSync('/tmp/nykara_src.jpg').toString('base64');

// Arabic description
const ai1 = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({model:'google/gemini-2.5-flash',messages:[{role:'user',content:'اكتب وصفاً تاريخياً موجزاً (3-4 أسطر) باللغة العربية الفصحى عن الموظف المصري القديم "ني-كا-رع" (Nykara) من الأسرة الخامسة (حوالي 2400 ق.م)، الذي شغل منصب المشرف على الصوامع المزدوجة وكاهناً في معبد الشمس للملك ني-وسر-رع، وعُرف من تماثيله في سقارة (متحف كليفلاند ومتحف بروكلين). بدون مقدمات.'}]}),
});
const j1 = await ai1.json();
if (!ai1.ok) { console.error(j1); process.exit(1); }
const description = j1.choices[0].message.content.trim();
console.log('DESC:\n', description);

const prompt = `Create a hyper-realistic museum-quality portrait painting of the ancient Egyptian official "Nykara" (Ni-ka-re), an overseer of the double granaries and priest at the sun-temple of King Niuserre during the 5th Dynasty (c. 2400 BC).

${description}

Reference the attached red granite seated statue of Nykara from the Cleveland Museum of Art. The portrait MUST closely match the facial features (rounded youthful face, broad nose, full lips, large almond eyes), the short curled wig, and the dignified bearing visible in the original statue.

STYLE: Museum-quality realistic oil painting. Old Kingdom Egyptian white linen kilt, broad collar necklace optional. Warm brown/olive skin complexion. Dark brown eyes. Dramatic chiaroscuro lighting against warm earthy background.

CRITICAL: NO text, letters, numbers, watermarks. NO modern elements. Face clear, detailed and undistorted.`;

const aiImg = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({
    model:'google/gemini-3-pro-image-preview',
    messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:image/jpeg;base64,${srcB64}`}}]}],
    modalities:['image','text'],
  }),
});
if (!aiImg.ok) { console.error(aiImg.status, await aiImg.text()); process.exit(1); }
const jImg = await aiImg.json();
const imageB64 = jImg?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!imageB64) { console.error('no image', JSON.stringify(jImg).slice(0,500)); process.exit(1); }
const b64 = imageB64.includes(',') ? imageB64.split(',')[1] : imageB64;
const bytes = Buffer.from(b64, 'base64');

const id = crypto.randomUUID();
const path = `Pharaoh/${id}_nykara_${Date.now()}.png`;
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType:'image/png', upsert:true });
if (ue) throw ue;
const { data: urlData } = s.storage.from('personas').getPublicUrl(path);

const { error: ie } = await s.from('personas').insert({
  id,
  name: 'ني كا رع',
  name_en: 'Nykara',
  category: 'Pharaoh',
  role: 'noble',
  gender: 'male',
  description,
  image_url: urlData.publicUrl,
  source_image_url: SRC_PAGE,
  is_drawing: false,
});
if (ie) throw ie;
console.log('OK ✅ id=', id, '\nIMG:', urlData.publicUrl);
