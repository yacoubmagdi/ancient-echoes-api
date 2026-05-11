import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = "87daea08-9cd4-477d-9dea-b100619d3763";
const bytes = fs.readFileSync("/dev-server/nakhtmin_v2.jpg");
const path = `Pharaoh/${ID}_nakhtmin_v2_${Date.now()}.jpg`;
const { error: e1 } = await supabase.storage.from("personas").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
if (e1) { console.error(e1); process.exit(1); }
const { data: u } = supabase.storage.from("personas").getPublicUrl(path);
const { error: e2 } = await supabase.from("personas").update({ image_url: u.publicUrl, face_descriptor: null }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("OK", u.publicUrl);
