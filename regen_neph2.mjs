import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = "63aaaec4-0580-4afa-aa85-0aec75411272";

const name = "نف عا رود الثاني";
const name_en = "Nepherites II";
const desc_ar = `نف عا رود الثاني (نفيريتس الثاني، Nepherites II) آخر فراعنة الأسرة المصرية التاسعة والعشرين قصيرة العمر (399/8 – 380 ق.م)، وهي الأسرة الأصلية ما قبل الأخيرة في مصر. تولى العرش صيف عام 380 ق.م بعد وفاة والده الفرعون حقر (هاكور)، ولم يدم حكمه سوى أربعة أشهر تقريباً (يونيو – سبتمبر 380 ق.م) قبل أن يخلعه ويغتاله على الأرجح الأمير الثائر نخت‌نب‌اف من سمنود، الذي أسّس الأسرة الثلاثين تحت اسم نخت‌نبو الأول. وُصف بأنه حاكم ضعيف "غير فعّال"، وحاول تعزيز موقعه بإعلان نفسه «وحم مسوت» (مكرر المواليد، أي مؤسس عصر جديد) كما فعل من قبل أمنمحات الأول وسيتي الأول. ربط المؤرخ اليوناني ثيوبومبوس سقوطه بحرب إفاجوراس الأول ملك سلاميس القبرصية ضد الفرس. اسمه الميلادي «نف عا رود» يعني "الكبار يزدهرون"، ولم يُعثر عليه على أي أثر معاصر، وهو معروف فقط من «أيجبتياكا» للمؤرخ مانيتون ومن «سجل الديموطيقية» من القرن الثالث ق.م، كما يلمح لسقوطه نقش لوحة حجر جيري لنخت‌نبو الأول من الأشمونين. (المصدر: ويكيبيديا)`;
const desc_en = `Nepherites II (Nefaarud II) was the last pharaoh of the short-lived 29th Dynasty of Egypt, ruling for only about 4 months (June–September 380 BC) before being deposed and likely killed by the rebel prince Nakhtnebef of Sebennytos, who founded the 30th Dynasty as Nectanebo I. Son of Hakor, he was described as an "ineffectual" ruler. To strengthen his position he proclaimed himself Wehem Mesut ("Repeater of Births", founder of a new era), as Amenemhat I and Seti I had done. The Greek historian Theopompus linked his fall to the war waged by Evagoras I of Salamis (Cyprus) against Persia. His birth name "Nefaarud" means "The Great Ones prosper" and is attested only in Manetho's Aegyptiaca and the Demotic Chronicle, with a brief reference to his fall on a limestone stela of Nectanebo I from Hermopolis. (Source: Wikipedia)`;

const { error: e1 } = await supabase.from("personas").update({
  name, name_en,
  description: desc_ar,
  description_en: desc_en,
  source_image_url: "https://en.wikipedia.org/wiki/Nepherites_II",
  verification_status: "verified",
}).eq("id", PID);
if (e1) { console.error("update err:", e1); process.exit(1); }
console.log("DB updated.");

// Generate image - no surviving portrait, use 29th dynasty style based on father Hakor's sphinx
const prompt = `Hyper-realistic museum-quality photographic portrait of Pharaoh Nepherites II (Nefaarud II), last ruler of Egypt's 29th Dynasty (380 BC), son of Hakor. 

A young Egyptian king in his 20s-30s, oval Mediterranean-Egyptian face with strong features inherited from a Late Period Delta lineage (Mendesian / Sebennytic stock). Warm olive-bronze skin with photorealistic pores and subtle 5-o'clock shadow on a clean-shaven face. Almond-shaped dark brown eyes outlined with traditional black kohl, fine arched brows, straight nose, full lips set in a calm but melancholic expression suggesting a brief, troubled reign.

Wearing the iconic Late Period royal regalia in the style of his father Hakor and successor Nectanebo I: the blue Khepresh war crown OR the striped nemes headdress in royal blue and gold with the rearing golden uraeus cobra at the brow. Heavy multi-row usekh broad collar with carnelian, lapis lazuli, turquoise and gold beads. Ceremonial false ceremonial beard (osiride) bound to the chin. Bare chest of a young pharaoh, with linen royal kilt visible at the bottom edge.

STYLE: 85mm portrait lens, soft cinematic side lighting from the upper left, shallow depth of field, dark neutral museum gallery background. Photo-real living human, NOT a statue, NOT a relief, NOT a painting. NO text, NO hieroglyphs, NO modern elements, NO watermarks. Sharp clear undistorted face.`;

const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "google/gemini-3-pro-image-preview",
    messages: [{ role: "user", content: prompt }],
    modalities: ["image", "text"],
  }),
});
if (!aiResp.ok) { console.error("AI err:", aiResp.status, await aiResp.text()); process.exit(1); }
const aiData = await aiResp.json();
const imgB64 = aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!imgB64) { console.error("no img", JSON.stringify(aiData).slice(0, 500)); process.exit(1); }
const b64 = imgB64.includes(",") ? imgB64.split(",")[1] : imgB64;
const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
fs.writeFileSync("/dev-server/nepherites2_v1.jpg", bytes);

const path = `Pharaoh/${PID}_nepherites2_${Date.now()}.jpg`;
const { error: ue } = await supabase.storage.from("personas").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
if (ue) { console.error("up err:", ue); process.exit(1); }
const { data: u } = supabase.storage.from("personas").getPublicUrl(path);

// disable trigger, clear face_descriptor, re-enable
await supabase.from("personas").update({ image_url: u.publicUrl, face_descriptor: null }).eq("id", PID);
console.log("OK:", u.publicUrl);
