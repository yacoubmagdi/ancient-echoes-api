import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = 'ed9ae633-575b-4cbd-93a9-f8fa1cf566d4';

// 1) Update name + description + source
const newName = 'نحسي';
const newNameEn = 'Nehsi';
const newDesc = 'نحسي مسؤول رفيع في بلاط الملكة حتشبسوت من الأسرة الثامنة عشرة، حامل الختم الملكي ورئيس الخزانة. من أصل نوبي (اسمه يعني "النوبي"). اشتُهر بقيادته البعثة التجارية البحرية الكبرى إلى بلاد بونت في العام التاسع من حكم حتشبسوت، الموثقة على نقوش معبد الدير البحري، حيث عاد محمّلاً بالبخور والمر وأشجار اللبان والذهب والعاج.';
const newDescEn = 'Nehsi was an official at the court of Hatshepsut, of Nubian descent, holding titles such as Wearer of the Royal Seal and Chief Treasurer. He is famed for leading the great trading expedition to the Land of Punt in Hatshepsut\'s 9th regnal year, depicted in the Punt Reliefs at Deir el-Bahri.';
const sourceUrl = 'https://en.wikipedia.org/wiki/Nehsi';

// 2) Generate image (no reference, text prompt based on Punt reliefs)
const prompt = `Create a hyper-realistic museum-quality portrait painting of the ancient Egyptian noble official "Nehsi" (male, royal treasurer and chancellor under Pharaoh Hatshepsut, 18th Dynasty, c. 1470 BCE).

Nehsi was of Nubian descent (his name means "the Nubian"). He led the famous trading expedition to the Land of Punt depicted on the Punt Reliefs at Deir el-Bahri temple.

APPEARANCE: Distinguished Nubian-Egyptian man in his 40s, dark brown skin tone reflecting his Nubian heritage, strong dignified facial features, short black hair or shoulder-length striated black wig, dark brown eyes with subtle kohl outlining, neatly trimmed beard or clean-shaven.

CLOTHING & REGALIA: Fine white pleated linen kilt (shendyt), wide beaded usekh broad collar of gold/lapis lazuli/carnelian/turquoise beads, gold armlets and bracelets engraved with hieroglyphs, the royal seal of Hatshepsut hanging on a cord at his chest. He holds a scribe's staff or a chest of Punt treasures (incense, myrrh).

BACKGROUND: Subtle hieroglyphic carvings, hints of the Punt Reliefs (incense trees, ships), warm golden temple lighting.

STYLE: Museum-quality realistic oil painting, dramatic chiaroscuro lighting, rich gold/lapis blue/earthy ochre tones, historically accurate to 18th Dynasty Egypt.

CRITICAL: NO text, letters, numbers, or watermarks. Face must be clear, detailed, undistorted, and dignified. Portrait quality suitable for a world-class museum exhibition on ancient Egypt.`;

console.log('Generating image...');
const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image-preview',
    messages: [{ role: 'user', content: prompt }],
    modalities: ['image', 'text'],
  }),
});
if (!aiResp.ok) { console.error(aiResp.status, await aiResp.text()); process.exit(1); }
const aiData = await aiResp.json();
const imgB64 = aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!imgB64) { console.error('No image'); console.error(JSON.stringify(aiData).slice(0,500)); process.exit(1); }
const b64 = imgB64.includes(',') ? imgB64.split(',')[1] : imgB64;
const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

const path = `Pharaoh/${ID}_nehsi_${Date.now()}.png`;
const { error: upErr } = await sb.storage.from('personas').upload(path, bytes, { contentType: 'image/png', upsert: true });
if (upErr) { console.error('Upload:', upErr); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
console.log('Uploaded:', publicUrl);

const { error: updErr } = await sb.from('personas').update({
  name: newName,
  name_en: newNameEn,
  description: newDesc,
  description_en: newDescEn,
  source_image_url: sourceUrl,
  image_url: publicUrl,
  face_descriptor: null,
  role: 'noble',
}).eq('id', ID);
if (updErr) { console.error('Update:', updErr); process.exit(1); }
console.log('✅ Updated persona to Nehsi');
