import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC_PAGE = 'https://ar.wikipedia.org/wiki/%D9%83%D8%A7_%D8%B9%D8%A8%D8%B1';
const SRC_IMG = 'https://upload.wikimedia.org/wikipedia/commons/7/73/Sheik-el-Beled.jpg';

// Check duplicate
const { data: dup } = await s.from('personas').select('id,name').eq('category','Pharaoh').ilike('name','%كا عبر%');
console.log('Existing:', dup);

// 1) Generate Arabic description (2-3 lines)
const wiki = await (await fetch('https://ar.wikipedia.org/api/rest_v1/page/summary/%D9%83%D8%A7_%D8%B9%D8%A8%D8%B1')).json();
const extract = wiki.extract || '';
const ai1 = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({model:'google/gemini-2.5-flash',messages:[{role:'user',content:`بناءً على المصدر التاريخي عن "كا عبر" (شيخ البلد):\n\n${extract}\n\nاكتب وصفاً تاريخياً موجزاً باللغة العربية الفصحى في حدود ثلاثة أسطر، يذكر العصر والمنصب وتمثاله الخشبي الشهير. بدون مقدمات.`}]}),
});
const j1 = await ai1.json();
if (!ai1.ok) { console.error(j1); process.exit(1); }
const description = j1.choices[0].message.content.trim();
console.log('DESC:\n', description);

// 2) Generate portrait via image gen referencing the source statue
const prompt = `Create a hyper-realistic museum-quality portrait painting of the ancient Egyptian scribe and priest "Ka-aper" (also known as Sheikh el-Beled), who lived between the late 4th and early 5th Dynasty of ancient Egypt.

${description}

Reference the famous wooden statue of Ka-aper (Sheikh el-Beled) from the Egyptian Museum in Cairo. The portrait MUST closely match the facial features, the rounded face, the realistic eyes inlaid with quartz, the bald head, and the dignified bearing of the original wooden statue.

STYLE: Museum-quality realistic oil painting. Historically accurate Old Kingdom Egyptian clothing (white linen kilt). Warm brown/olive skin complexion. Dark brown eyes. Dramatic chiaroscuro lighting against warm earthy background.

CRITICAL: NO text, letters, numbers, watermarks. NO modern elements. Face clear and undistorted.`;

const aiImg = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({
    model:'google/gemini-3-pro-image-preview',
    messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:SRC_IMG}}]}],
    modalities:['image','text'],
  }),
});
const jImg = await aiImg.json();
if (!aiImg.ok) { console.error('IMG ERR:', JSON.stringify(jImg).slice(0,500)); process.exit(1); }
const imageB64 = jImg?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!imageB64) { console.error('no image', JSON.stringify(jImg).slice(0,500)); process.exit(1); }
const b64 = imageB64.includes(',') ? imageB64.split(',')[1] : imageB64;
const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

const id = crypto.randomUUID();
const path = `Pharaoh/${id}_kaaper_${Date.now()}.png`;
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType:'image/png', upsert:true });
if (ue) throw ue;
const { data: urlData } = s.storage.from('personas').getPublicUrl(path);
console.log('IMG:', urlData.publicUrl);

const { error: ie } = await s.from('personas').insert({
  id,
  name: 'كا عبر (شيخ البلد)',
  name_en: 'Ka-aper',
  category: 'Pharaoh',
  role: 'noble',
  gender: 'male',
  description,
  image_url: urlData.publicUrl,
  source_image_url: SRC_PAGE,
  is_drawing: false,
});
if (ie) throw ie;
console.log('OK ✅ id=', id);
