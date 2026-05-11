import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = "0be1caf7-1c31-4c2a-949c-9fa7dd366309";
const buf = fs.readFileSync("/tmp/neferhotep_v1.jpg");
const path = `Pharaoh/${id}_neferhotep_${Date.now()}.jpg`;
const { error: e1 } = await supabase.storage.from("personas").upload(path, buf, { contentType: "image/jpeg", upsert: true });
if (e1) { console.error(e1); process.exit(1); }
const { data } = supabase.storage.from("personas").getPublicUrl(path);
const { error: e2 } = await supabase.from("personas").update({ image_url: data.publicUrl, face_descriptor: null }).eq("id", id);
if (e2) { console.error(e2); process.exit(1); }
console.log("OK", data.publicUrl);
