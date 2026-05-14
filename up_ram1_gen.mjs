import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '54bc5211-5cba-4ea0-b397-087d8bcacdf4';
const srcBuf = fs.readFileSync('/tmp/ram1_src.png');
const srcB64 = srcBuf.toString('base64');
const prompt = `Create a hyper-realistic museum-quality portrait painting of Pharaoh Ramesses I (Paramessu), founder of Egypt's 19th Dynasty (c. 1292 BC). Reference the attached granite statue head from the Museum of Fine Arts, Boston — the generated portrait MUST closely match the facial features (broad face, prominent nose, full lips, almond eyes), the striped nemes headdress, and the royal uraeus cobra on the brow.

STYLE: Realistic oil painting, dramatic chiaroscuro lighting, rich gold and lapis lazuli blue tones. Historically accurate warm brown/olive complexion, dark brown eyes. Age appearance ~50-60 years (he was elderly when crowned).

CRITICAL: NO text, letters, numbers, or watermarks. NO modern elements. Face clear and undistorted. Belongs in a world-class ancient Egypt museum exhibition.`;

const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image-preview',
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${srcB64}` } },
    ]}],
    modalities: ['image', 'text'],
  }),
});
if (!aiResp.ok) { console.error(aiResp.status, await aiResp.text()); process.exit(1); }
const ai = await aiResp.json();
const b64 = ai?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!b64) { console.error('no image', JSON.stringify(ai).slice(0,500)); process.exit(1); }
const data = b64.includes(',') ? b64.split(',')[1] : b64;
const bytes = Buffer.from(data, 'base64');
const path = `Pharaoh/${PID}_ramesses1_${Date.now()}.png`;
const { error: ue } = await s.storage.from('personas').upload(path, bytes, { contentType: 'image/png', upsert: true });
if (ue) throw ue;
const { data: { publicUrl } } = s.storage.from('personas').getPublicUrl(path);
const { error } = await s.from('personas').update({ image_url: publicUrl, face_descriptor: null }).eq('id', PID);
if (error) throw error;
console.log('OK', publicUrl);
