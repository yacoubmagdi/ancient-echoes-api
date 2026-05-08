import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = '7af13559-a1b7-449d-9c88-01d881536a6f';

// 1. Upload source historical image
const srcBytes = fs.readFileSync('/tmp/hakor_source.jpg');
const srcPath = `Pharaoh/${id}_source_${Date.now()}.jpg`;
const { error: se } = await sb.storage.from('personas').upload(srcPath, srcBytes, { contentType: 'image/jpeg', upsert: true });
if (se) { console.error('src upload', se); process.exit(1); }
const { data: { publicUrl: srcUrl } } = sb.storage.from('personas').getPublicUrl(srcPath);
console.log('source:', srcUrl);

// 2. Generate via AI gateway with source image
const prompt = `Create a hyper-realistic museum-quality portrait painting of the ancient Egyptian Pharaoh Hakor (Achoris), ruler of the 29th Dynasty (circa 393–380 BCE).

Reference the attached historical statue (limestone bust of Achoris, Petrie Museum). The portrait MUST closely match the facial features shown: youthful face, full lips, almond eyes, slightly rounded chin, distinctive nemes headdress with uraeus cobra at forehead, ceremonial false beard.

STYLE: Hyper-realistic oil painting. Historically accurate ancient Egyptian royal regalia: striped blue-and-gold nemes headdress, golden uraeus, broad usekh collar with lapis lazuli, carnelian and gold beads, ceremonial false beard. Warm brown/olive Egyptian skin tone. Dark brown eyes with kohl liner. Dramatic chiaroscuro lighting against a dark background.

CRITICAL: NO text, letters, numbers, watermarks, or modern elements. The face must be detailed, undistorted, and faithful to the historical statue. Museum exhibition quality.`;

const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image-preview',
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: srcUrl } }
    ]}],
    modalities: ['image', 'text'],
  }),
});
if (!aiResp.ok) { console.error('ai', aiResp.status, await aiResp.text()); process.exit(1); }
const aiData = await aiResp.json();
const b64 = aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!b64) { console.error('no img', JSON.stringify(aiData).slice(0,500)); process.exit(1); }
const data = b64.includes(',') ? b64.split(',')[1] : b64;
const bytes = Buffer.from(data, 'base64');

const outPath = `Pharaoh/${id}_regen_${Date.now()}.png`;
const { error: ue } = await sb.storage.from('personas').upload(outPath, bytes, { contentType: 'image/png', upsert: true });
if (ue) { console.error('upload', ue); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(outPath);

const { error: dbe } = await sb.from('personas').update({
  image_url: publicUrl,
  source_image_url: srcUrl,
  face_descriptor: null
}).eq('id', id);
if (dbe) { console.error('db', dbe); process.exit(1); }
console.log('OK', publicUrl);
