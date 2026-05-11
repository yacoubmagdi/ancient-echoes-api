import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PERSONA_ID = "7d75f8b3-53fc-4d29-84d0-52547854fe8d";

const refB64 = fs.readFileSync("/tmp/nofret_ref.jpg").toString("base64");
const refDataUrl = `data:image/jpeg;base64,${refB64}`;

const prompt = `Create a hyper-realistic photographic portrait of Princess Nofret (نفرت), wife of Prince Rahotep, Egyptian noblewoman of the 4th Dynasty (~2600 BCE). 

Reference the famous painted limestone statue from Meidum (now in the Cairo Museum) shown in the provided image. The portrait MUST faithfully match her iconic features:
- Heavy black shoulder-length wig with center parting and straight bangs covering the forehead
- White diadem/headband decorated with painted floral rosettes
- Wide multi-row usekh broad collar with horizontal bands of red, blue, green, and white, ending in teardrop beads
- Light fair skin (historically she is depicted with notably pale skin, unlike her husband)
- Large expressive almond-shaped dark eyes with kohl outlines
- Calm regal expression, full lips, gentle facial features
- White linen sheath dress, right hand resting across her chest

STYLE: Museum-quality realistic photographic portrait of a living woman in her 30s. Soft natural lighting. Photorealistic skin texture and detail. Modern photographic realism but completely faithful to the ancient artwork's identity, jewelry, wig, and clothing. Neutral warm background.

CRITICAL: NO text, NO letters, NO hieroglyphs, NO watermarks. Face clear, sharp, and undistorted. Must look like a living person, not a statue.`;

const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "google/gemini-3-pro-image-preview",
    messages: [{ role: "user", content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: refDataUrl } },
    ]}],
    modalities: ["image", "text"],
  }),
});

if (!aiResp.ok) { console.error("AI err:", aiResp.status, await aiResp.text()); process.exit(1); }
const aiData = await aiResp.json();
const imageB64 = aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!imageB64) { console.error("No image", JSON.stringify(aiData).slice(0, 500)); process.exit(1); }

const b64Data = imageB64.includes(",") ? imageB64.split(",")[1] : imageB64;
const bytes = Uint8Array.from(atob(b64Data), c => c.charCodeAt(0));
fs.writeFileSync("/tmp/nofret_new.png", bytes);

const storagePath = `Pharaoh/${PERSONA_ID}_regen_${Date.now()}.png`;
const { error: upErr } = await supabase.storage.from("personas").upload(storagePath, bytes, { contentType: "image/png", upsert: true });
if (upErr) { console.error("upload err:", upErr); process.exit(1); }
const { data: urlData } = supabase.storage.from("personas").getPublicUrl(storagePath);

const { error: updErr } = await supabase.from("personas").update({ image_url: urlData.publicUrl, face_descriptor: null }).eq("id", PERSONA_ID);
if (updErr) { console.error("update err:", updErr); process.exit(1); }
console.log("OK:", urlData.publicUrl);
