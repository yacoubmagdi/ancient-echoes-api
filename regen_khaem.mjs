import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '50e6affa-e07a-4733-ba1f-3d29cd5fe807';
const KEY = process.env.LOVABLE_API_KEY;
const REF = 'https://upload.wikimedia.org/wikipedia/commons/5/5d/Khaemwaset.jpg';

const prompt = `Hyper-realistic photographic portrait of a real living man: Prince Khaemweset, fourth son of Pharaoh Ramesses II (19th Dynasty, ca. 1280–1225 BC), High Priest of Ptah at Memphis. Use the provided British Museum statue as the exact facial reference — same bone structure, jawline, nose, and serene expression. Distinctive features: shaved head with the SIDELOCK OF YOUTH (a single thick braided lock of black hair on the right side of the head, mark of a Setem priest of Ptah), wearing a leopard-skin cloak draped diagonally over a pleated white linen kilt, broad gold-and-faience wesekh collar. Warm bronze Egyptian skin, dark almond eyes lined with kohl, calm intelligent gaze, age around 40. Professional studio lighting, ultra-sharp focus, plain warm neutral background, museum-quality photograph. No text, no hieroglyphs, no stone texture on skin.`;

const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image-preview',
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: REF } }
    ]}],
    modalities: ['image','text']
  })
});
const j = await r.json();
const b64 = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!b64) { console.error(JSON.stringify(j).slice(0,800)); process.exit(1); }
const buf = Buffer.from(b64.split(',')[1] || b64.replace(/^data:image\/\w+;base64,/,''), 'base64');
const path = `Pharaoh/${PID}_${Date.now()}.png`;
const up = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/png', upsert: true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const upd = await sb.from('personas').update({ image_url: publicUrl, is_drawing: false }).eq('id', PID);
console.log(upd.error || 'OK', publicUrl);
