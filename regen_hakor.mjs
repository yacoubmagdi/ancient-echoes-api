import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const PID = '7af13559-a1b7-449d-9c88-01d881536a6f';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const refB64 = fs.readFileSync('/tmp/hakor_ref.jpg').toString('base64');
const prompt = `Create a hyper-realistic photographic portrait of Pharaoh Hakor (Achoris), Egyptian king of the 29th Dynasty (~393–380 BCE).

Reference the limestone bust sculpture in the provided image (Petrie Museum). The portrait MUST faithfully match the facial features shown in the statue:
- Youthful oval face with smooth defined jawline
- High forehead, well-shaped almond eyes with calm direct gaze
- Straight refined nose
- Full lips with a subtle confident smile (slight upturn at corners as in the statue)
- Smooth cheeks, slim neck
- Warm olive-bronze ancient Egyptian skin
- Wearing the royal striped nemes headdress (blue and gold) with golden uraeus cobra at the brow
- Ceremonial false beard bound to the chin
- Broad usekh collar of gold, lapis lazuli, carnelian, and turquoise

STYLE: Museum-quality photorealistic portrait of a living man in his 30s-40s. Soft cinematic side lighting, fine skin texture and pores, sharp expressive eyes. Looks like a real living pharaoh, NOT a statue, NOT limestone. Neutral warm dark background. 85mm lens, shallow depth of field.

CRITICAL: NO text, NO hieroglyphs, NO watermarks. Face clear, sharp, undistorted. Living person, not stone.`;

const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image-preview',
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${refB64}` } },
    ]}],
    modalities: ['image', 'text'],
  }),
});
if (!r.ok) { console.error(r.status, await r.text()); process.exit(1); }
const d = await r.json();
const img = d?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!img) { console.error('no img', JSON.stringify(d).slice(0,500)); process.exit(1); }
const b64 = img.includes(',') ? img.split(',')[1] : img;
const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
fs.writeFileSync('/tmp/hakor_out.png', bytes);
const path = `Pharaoh/${PID}_hakor_${Date.now()}.png`;
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType: 'image/png', upsert: true });
if (ue) throw ue;
const { data } = s.storage.from('personas').getPublicUrl(path);
const { error: dbe } = await s.from('personas').update({ image_url: data.publicUrl, face_descriptor: null }).eq('id', PID);
if (dbe) throw dbe;
console.log('OK', data.publicUrl);
