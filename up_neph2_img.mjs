import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = "63aaaec4-0580-4afa-aa85-0aec75411272";
const bytes = fs.readFileSync("/dev-server/nepherites2_v1.jpg");
const path = `Pharaoh/${PID}_nepherites2_${Date.now()}.jpg`;
const { error: ue } = await supabase.storage.from("personas").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
if (ue) { console.error(ue); process.exit(1); }
const { data: u } = supabase.storage.from("personas").getPublicUrl(path);
const { error: e } = await supabase.from("personas").update({ image_url: u.publicUrl, face_descriptor: null }).eq("id", PID);
if (e) { console.error(e); process.exit(1); }
console.log("OK:", u.publicUrl);
