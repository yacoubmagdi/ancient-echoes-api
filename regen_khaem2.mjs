import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '50e6affa-e07a-4733-ba1f-3d29cd5fe807';
const KEY = process.env.LOVABLE_API_KEY;
const refB64 = fs.readFileSync('/tmp/khaem_ref.png').toString('base64');

const prompt = `Hyper-realistic photographic portrait of a real living ancient Egyptian noble man, faithfully recreating the EXACT face from the provided stone bust reference image: same bone structure, almond-shaped eyes, straight nose, full lips, gentle calm smile, oval jawline. Bring the statue to life as a real human with warm bronze skin, dark brown almond eyes lined with kohl, natural skin texture and pores. He wears the traditional striped tripartite wig (nemes-style ribbed black hair) covering the ears as in the statue. Dressed as Prince Khaemweset, son of Ramesses II and High Priest of Ptah: leopard-skin cloak over pleated white linen, broad gold wesekh collar. Studio lighting, ultra-sharp 85mm portrait, plain warm beige background, museum-quality photograph. No stone texture, no text.`;

const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image-preview',
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${refB64}` } }
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
