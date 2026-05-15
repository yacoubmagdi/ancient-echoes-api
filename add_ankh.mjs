import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = process.env.LOVABLE_API_KEY;
const SRC = 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Statue_of_Ankhenesneferibre_by_John_Campana.jpg';
const WIKI = 'https://ar.wikipedia.org/wiki/%D8%B9%D9%86%D8%AE%D9%86%D8%B3_%D9%86%D9%81%D8%B1_%D8%A5%D8%A8_%D8%B1%D8%B9';
const description = 'عنخنس نفر إب رع أميرة فرعونية وكاهنة مصرية من الأسرة السادسة والعشرين، ابنة الفرعون بسماتيك الثاني من زوجته تاخويت. شغلت منصب المتعبدة الإلهية لآمون ثم زوجة آمون بين 595 و525 ق.م في عهد بسماتيك الثاني وأبريس وأحمس الثاني وبسماتيك الثالث. استمرت في منصبها حتى الغزو الأخميني لمصر.';

// Download reference image
const imgResp = await fetch(SRC);
const refBuf = Buffer.from(await imgResp.arrayBuffer());
const refB64 = refBuf.toString('base64');

const prompt = `Hyper-realistic photographic portrait of a real living ancient Egyptian noblewoman princess, faithfully recreating the EXACT face from the provided stone statue reference: same bone structure, almond-shaped eyes, straight nose, full lips, serene calm expression, oval jawline. Bring the statue to life as a real human woman with warm bronze-olive skin, dark brown almond eyes lined with kohl, natural skin texture and pores. She wears the traditional vulture headdress of the God's Wife of Amun, with a uraeus cobra at the brow and a ceremonial wig. Dressed as Ankhnesneferibre, High Priestess and God's Wife of Amun (26th Dynasty): pleated white linen dress, broad gold wesekh collar with lapis lazuli and carnelian inlays, gold bracelets. Studio lighting, ultra-sharp 85mm portrait, plain warm beige background, museum-quality photograph. No stone texture, no text, no hieroglyphs.`;

const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image-preview',
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${refB64}` } }
    ]}],
    modalities: ['image','text']
  })
});
const j = await r.json();
const b64 = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!b64) { console.error(JSON.stringify(j).slice(0,800)); process.exit(1); }
const buf = Buffer.from(b64.split(',')[1] || b64.replace(/^data:image\/\w+;base64,/,''), 'base64');

// Insert persona first to get id
const ins = await sb.from('personas').insert({
  name: 'الأميرة عنخنس نفر إب رع',
  name_en: 'Ankhnesneferibre',
  category: 'Pharaoh',
  role: 'priestess',
  gender: 'female',
  description,
  source_image_url: WIKI,
  image_url: 'pending',
  is_drawing: false,
}).select('id').single();
if (ins.error) { console.error(ins.error); process.exit(1); }
const PID = ins.data.id;

const path = `Pharaoh/${PID}_${Date.now()}.png`;
const up = await sb.storage.from('personas').upload(path, buf, { contentType: 'image/png', upsert: true });
if (up.error) { console.error(up.error); process.exit(1); }
const { data: { publicUrl } } = sb.storage.from('personas').getPublicUrl(path);
const upd = await sb.from('personas').update({ image_url: publicUrl }).eq('id', PID);
console.log(upd.error || 'OK', PID, publicUrl);
