import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '50e6affa-e07a-4733-ba1f-3d29cd5fe807';
const KEY = process.env.LOVABLE_API_KEY;
const REF_IMG = 'https://upload.wikimedia.org/wikipedia/commons/5/5d/Khaemwaset.jpg';

// 1. Generate realistic portrait based on the British Museum statue
const prompt = `Hyper-realistic photographic portrait of Prince Khaemweset, son of Pharaoh Ramesses II of the 19th Dynasty (ca. 1280–1225 BC), High Priest of Ptah at Memphis. Recreate as a living human modeled DIRECTLY on the provided British Museum statue: the same face structure, the distinctive sidelock of youth (single braided lock on the right side of a shaved head — symbol of his priesthood of Ptah), wearing a leopard-skin priestly garment over a fine white linen kilt. Warm bronze Egyptian skin, almond eyes lined with kohl, calm noble expression, age around 40. Studio lighting, sharp focus, museum-quality photograph, plain neutral background. No hieroglyphs, no text.`;

const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image-preview',
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: REF_IMG } }
    ]}],
    modalities: ['image','text']
  })
});
const j = await r.json();
const b64 = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!b64) { console.error(JSON.stringify(j).slice(0,500)); process.exit(1); }
const buf = Buffer.from(b64.split(',')[1] || b64.replace(/^data:image\/\w+;base64,/,''), 'base64');
const path = `Pharaoh/${PID}_${Date.now()}.png`;
const up = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/png', upsert: true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);

const desc = 'الأمير خعمواست، الابن الرابع للفرعون رمسيس الثاني من الأسرة 19، وكاهن بتاح الأكبر في منف. اشتُهر بترميمه لأهرامات وآثار المملكة القديمة، وعدّه المؤرخون أول عالم آثار في التاريخ. خُلِّد بعد وفاته كحكيم سحري في أدب العصر المتأخر باسم «ساتني خعمواست».';

const upd = await sb.from('personas').update({
  name: 'الأمير خعمواست',
  name_en: 'Prince Khaemweset',
  description: desc,
  image_url: publicUrl,
  source_image_url: 'https://en.wikipedia.org/wiki/Khaemweset',
  is_drawing: false
}).eq('id', PID);
console.log(upd.error || 'OK', publicUrl);
