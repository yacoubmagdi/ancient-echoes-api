import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = 'https://egypt-museum.com/tribute-from-the-south-lower-nubia-wawat-upper-nubia-kush/';

const items = [
  {
    name: 'أميرة كوش',
    name_en: 'Princess of Kush',
    ref: '/tmp/huy_princess.jpg',
    prompt: `Hyper-realistic museum-quality photographic portrait of a real living noblewoman: the Princess of Kush, daughter of a Nubian chieftain, depicted in the tomb of Huy (TT40), Viceroy of Kush under Pharaoh Tutankhamun (18th Dynasty, ~1330 BC). Use the provided tomb wall scene as historical reference for her attire and cultural context. She is highly Egyptianized in dress yet retains distinctly Nubian features: rich dark brown skin, intelligent almond eyes with kohl liner, fine straight nose, full lips, calm regal expression, age around 25. She wears: a long pleated white linen sheath gown with red and gold accents, a broad multi-row wesekh collar of gold and carnelian beads, large hooped gold earrings, a Nubian beaded headband with a single ostrich feather rising at the back of her elaborately braided black wig. Soft warm studio lighting, ultra-sharp focus, plain neutral warm beige background, photographed like a National Geographic portrait. No text, no hieroglyphs, no stone/painting texture on skin — she is a real living woman.`,
    description: 'أميرة من كوش (النوبة العليا) صُوّرت في مقبرة "حوي" نائب الملك على كوش، ضمن مشهد تقديم الجزية الجنوبية إلى الفرعون توت عنخ آمون في الأسرة الثامنة عشرة من الدولة الحديثة. تظهر بزيّ مصري راقٍ: ثوب كتاني أبيض طويل مزخرف، وعقد عريض من الذهب والخرز، وأقراط ذهبية كبيرة، وعصابة نوبية مزيّنة بريشة نعام، مع ملامح نوبية واضحة وبشرة داكنة. كانت بنات أمراء كوش يُربَّين أحياناً في البلاط المصري ليصبحن جسراً بين الثقافتين تحت السيادة المصرية.',
  },
  {
    name: 'أم نوبية',
    name_en: 'Nubian Mother',
    ref: '/tmp/nubian_mother.jpg',
    prompt: `Hyper-realistic museum-quality photographic portrait of a real living Nubian woman from Kush, depicted in the tomb of Huy (TT40), Viceroy of Kush under Pharaoh Tutankhamun (18th Dynasty, ~1330 BC), shown in the parade of southern tribute carrying a small child on her shoulder. Use the provided tomb wall painting as cultural reference. Features: rich dark brown Nubian skin, traditional thick black braided Nubian hair gathered with a beaded headband, large gold hoop earrings, multiple beaded necklaces in red carnelian and gold, fine almond eyes with kohl liner, full lips, gentle warm expression, age around 30. She wears a wrap of cream/white linen draped over one shoulder with a red sash, exposing one shoulder in traditional Nubian style. Soft warm studio lighting, ultra-sharp 85mm portrait, plain warm sand background, photographed like a real living person — NOT a painting or relief. No text, no hieroglyphs, no flat painted texture.`,
    description: 'امرأة نوبية من بلاد كوش صُوّرت في مقبرة "حوي" نائب الملك على كوش في عهد توت عنخ آمون، وهي تسير ضمن موكب الجزية الجنوبية حاملة طفلها على كتفها. تتميز ببشرة داكنة وشعر أسود مضفر بالطريقة النوبية التقليدية مع عصابة من الخرز، وأقراط ذهبية حلقية كبيرة، وعقود متعددة من الخرز الأحمر والذهبي، وثوب كتاني أبيض يكشف عن أحد الكتفين على الطريقة النوبية. تمثل صورتها الحياة اليومية والعائلية للنوبيين الذين قدِموا إلى البلاط الفرعوني ضمن وفود الجنوب.',
  },
];

for (const it of items) {
  console.log(`\n--- ${it.name} ---`);
  const refB64 = fs.readFileSync(it.ref).toString('base64');
  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method:'POST', headers:{Authorization:`Bearer ${process.env.LOVABLE_API_KEY}`,'Content-Type':'application/json'},
    body: JSON.stringify({
      model:'google/gemini-3-pro-image-preview',
      messages:[{role:'user',content:[
        {type:'text',text:it.prompt},
        {type:'image_url',image_url:{url:`data:image/jpeg;base64,${refB64}`}},
      ]}],
      modalities:['image','text'],
    }),
  });
  if (!r.ok) { console.error(it.name, r.status, await r.text()); continue; }
  const j = await r.json();
  const img = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!img) { console.error('no img', it.name, JSON.stringify(j).slice(0,400)); continue; }
  const b64 = img.includes(',') ? img.split(',')[1] : img;
  const bytes = Buffer.from(b64, 'base64');
  const id = crypto.randomUUID();
  const path = `Pharaoh/${id}_${Date.now()}.png`;
  const up = await s.storage.from('personas').upload(path, bytes, {contentType:'image/png',upsert:true});
  if (up.error) { console.error(up.error); continue; }
  const { data:{ publicUrl } } = s.storage.from('personas').getPublicUrl(path);
  const ins = await s.from('personas').insert({
    id, name: it.name, name_en: it.name_en,
    category:'Pharaoh', role:'شخصية تاريخية', gender:'female',
    description: it.description, image_url: publicUrl,
    source_image_url: SRC, is_drawing: false,
  });
  console.log(ins.error ? `❌ ${ins.error.message}` : `✅ ${it.name} ${id}`);
}
