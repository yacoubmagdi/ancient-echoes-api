import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = "a9d00f78-9387-4187-aa67-5ee4c45c9e1c";
const buf = fs.readFileSync("/dev-server/necho1_v1.jpg");
const path = `Pharaoh/${id}_necho1_${Date.now()}.jpg`;
const { error: e1 } = await s.storage.from("personas").upload(path, buf, { contentType: "image/jpeg", upsert: true });
if (e1) { console.error(e1); process.exit(1); }
const { data } = s.storage.from("personas").getPublicUrl(path);
const { error: e2 } = await s.from("personas").update({ image_url: data.publicUrl, face_descriptor: null }).eq("id", id);
if (e2) { console.error(e2); process.exit(1); }
console.log("OK", data.publicUrl);
