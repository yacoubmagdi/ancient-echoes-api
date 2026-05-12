import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const PID = '2e04d8d2-0bcb-46dd-a67c-c4217c2de556';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const refB64 = fs.readFileSync('/tmp/am5_ref.png').toString('base64');
const prompt = `Create a hyper-realistic photographic portrait of Pharaoh Amenemhat V (أمنمحات الخامس), Egyptian king of the 13th Dynasty (~1796 BCE).

Reference the provided granite/diorite royal head sculpture in the image. The portrait MUST faithfully match the facial features shown:
- Strong, broad face with full cheeks
- Heavy-lidded almond eyes, calm steady gaze
- Wide flat nose, full lips with slight downturn
- Strong square jaw
- Wearing the classic royal nemes headdress (striped blue and gold) with uraeus cobra on the brow
- Warm brown/olive ancient Egyptian skin tone
- Bare chest or fine white linen, broad usekh collar of gold and lapis lazuli

STYLE: Museum-quality photorealistic portrait of a living man in his 30s-40s. Soft dramatic lighting, fine skin texture, sharp eyes. Looks like a real living pharaoh, NOT a statue. Neutral warm background.

CRITICAL: NO text, NO hieroglyphs, NO watermarks. Face clear, sharp, undistorted. Living person, not stone.`;

const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image-preview',
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${refB64}` } },
    ]}],
    modalities: ['image', 'text'],
  }),
});
if (!aiResp.ok) { console.error(aiResp.status, await aiResp.text()); process.exit(1); }
const d = await aiResp.json();
const img = d?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!img) { console.error('no img', JSON.stringify(d).slice(0,500)); process.exit(1); }
const b64 = img.includes(',') ? img.split(',')[1] : img;
const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const path = `Pharaoh/${PID}_regen_${Date.now()}.png`;
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType: 'image/png', upsert: true });
if (ue) throw ue;
const { data } = s.storage.from('personas').getPublicUrl(path);
const { error: dbe } = await s.from('personas').update({ image_url: data.publicUrl, face_descriptor: null }).eq('id', PID);
if (dbe) throw dbe;
console.log('OK', data.publicUrl);
