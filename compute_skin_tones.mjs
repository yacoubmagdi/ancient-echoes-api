// Compute skin tones for all personas by analyzing their portrait images.
// Uses canvas to extract average face region color.
// Run: node compute_skin_tones.mjs

import { createClient } from "@supabase/supabase-js";
import { createCanvas, loadImage } from "canvas";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function classifySkinTone(l) {
  if (l >= 75) return "very_light";
  if (l >= 65) return "light";
  if (l >= 50) return "medium";
  if (l >= 40) return "olive";
  if (l >= 28) return "brown";
  return "dark";
}

async function extractSkinTone(imageUrl) {
  const img = await loadImage(imageUrl);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  // Sample central region (face area approximation)
  const cx = Math.floor(img.width * 0.25);
  const cy = Math.floor(img.height * 0.15);
  const cw = Math.floor(img.width * 0.5);
  const ch = Math.floor(img.height * 0.5);

  const imageData = ctx.getImageData(cx, cy, cw, ch);
  const data = imageData.data;

  let totalR = 0, totalG = 0, totalB = 0, count = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a < 128) continue;
    const brightness = (r + g + b) / 3;
    if (brightness < 20 || brightness > 245) continue;
    totalR += r; totalG += g; totalB += b; count++;
  }

  if (count === 0) return { h: 25, s: 40, l: 55, category: "medium" };
  const hsl = rgbToHsl(totalR / count, totalG / count, totalB / count);
  return { ...hsl, category: classifySkinTone(hsl.l) };
}

// Fetch all personas without skin_tone
const { data: personas, error } = await supabase
  .from("personas")
  .select("id, name, image_url, skin_tone")
  .is("skin_tone", null)
  .limit(2000);

if (error) { console.error(error); process.exit(1); }
console.log(`Processing ${personas.length} personas without skin tone...`);

let ok = 0, fail = 0;
for (const p of personas) {
  try {
    const tone = await extractSkinTone(p.image_url);
    const { error: upErr } = await supabase
      .from("personas")
      .update({ skin_tone: tone })
      .eq("id", p.id);
    if (upErr) throw upErr;
    ok++;
    if (ok % 20 === 0) console.log(`  ${ok}/${personas.length} done`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${p.name}: ${e.message?.slice(0, 80)}`);
  }
}
console.log(`\n✅ Done: ${ok} updated, ${fail} failed`);
