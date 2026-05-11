import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = "a11ac3ce-33a4-40de-b24a-1599398ccc73";
const bytes = fs.readFileSync("/tmp/apries.jpg");
const path = `Pharaoh/${PID}_apries_${Date.now()}.jpg`;
const { error: ue } = await s.storage.from("personas").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
if (ue) { console.error(ue); process.exit(1); }
const { data: u } = s.storage.from("personas").getPublicUrl(path);
const { error: e } = await s.from("personas").update({ image_url: u.publicUrl, face_descriptor: null }).eq("id", PID);
if (e) { console.error(e); process.exit(1); }
console.log("OK:", u.publicUrl);
