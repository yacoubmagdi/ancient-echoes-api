import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = "198c1093-940e-40c3-8971-4b65e942e47b";
const buf = fs.readFileSync("./upload_neskhons2_img.jpg");
const path = `Pharaoh/${id}_neskhons_${Date.now()}.jpg`;
const { error: upErr } = await supabase.storage.from("personas").upload(path, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error(upErr); process.exit(1); }
const { data } = supabase.storage.from("personas").getPublicUrl(path);
const { error: updErr } = await supabase.from("personas").update({ image_url: data.publicUrl, face_descriptor: null }).eq("id", id);
if (updErr) { console.error(updErr); process.exit(1); }
console.log(data.publicUrl);
