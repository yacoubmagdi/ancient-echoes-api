import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage, ImageData } from "canvas";
import path from "node:path";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

faceapi.env.monkeyPatch({ Canvas: createCanvas, Image: loadImage, ImageData });

const MODELS = path.resolve("/dev-server/public/models");
await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS);
console.error("Models loaded");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get all personas without face_descriptor
const { data: personas, error } = await supabase
  .from("personas")
  .select("id, name")
  .is("face_descriptor", null)
  .order("created_at", { ascending: false })
  .limit(50);

if (error) { console.error("DB error:", error); process.exit(1); }
console.error(`Found ${personas.length} personas without descriptors`);

let ok = 0, fail = 0;
for (const p of personas) {
  // Find the image file
  const imgDir = "/dev-server/src/assets/personas/";
  const files = fs.readdirSync(imgDir);
  
  // Try to match by looking at all recently created files
  // We'll use the persona name to find matching image
  let imgPath = null;
  
  // Build a mapping from persona names to file names
  const nameToFile = {
    "سابني حاكم الفنتين": "sabni_governor.jpg",
    "واش بتاح الطبيب": "washptah_doctor.jpg",
    "مرو كا الوزير": "meruka_vizier.jpg",
    "إيدوت الأميرة": "idut_princess.jpg",
    "نيانخ خنوم الكاهن": "niankhkhnum_priest.jpg",
    "سنب القصير": "seneb_short.jpg",
    "ثنوني المهندس": "thenuni_engineer.jpg",
    "آمون ناخت الفنان": "amunnakht_artist.jpg",
    "نخت آمون الكاهن": "nakhtamun_priest.jpg",
    "با حري الحاكم": "paheri_governor.jpg",
    "إنحر خاوي المعمار": "inherkhawi_architect.jpg",
    "خنوم با رع النبيل": "khnumbara_noble.jpg",
    "بيبي نخت المغامر": "pepinakht_commander.jpg",
    "كا إير الوزير": "kair_vizier.jpg",
    "نفر با تاح الكاتبة": "neferbaptah_scribe.jpg",
    "رع شبسس النبيل": "rashepses_noble.jpg",
    "بتاح مس الكاهن": "ptahmes_priest.jpg",
    "عنخ ماعت رع": "ankhmaatra_queen.jpg",
    "مس إيوي الجندي": "mesiwi_soldier.jpg",
    "تي مريت نيسوت": "timerit_princess.jpg",
    "عا إب شري الكاهنة": "aabsheri_priestess.jpg",
    "حور نفر المحنط": "hornefer_embalmer.jpg",
    "سنوسرت عنخ القائد": "senusretankh_commander.jpg",
    "آمون إم أوبت الكاتب": "amenemopet_sage.jpg",
    "ميري تي تي الملكة": "merititi_queen.jpg",
    "خنسو إم حب المنجم": "khonsemhab_astronomer.jpg",
    "تا ديت إيسيس الكاهنة": "taditisis_priestess.jpg",
    "حسي نفر النبيل": "hesinefer_noble.jpg",
    "رع ور الكاهن": "rawer_highpriest.jpg",
    "نفرو الملكة": "nefru_queen.jpg",
    "سات ميرت الأميرة": "satmerit_princess.jpg",
    "آمون حتب حوي النائب": "amenhotephuy_viceroy.jpg",
    "باك ن رنف الكاتب": "bakenrenef_scribe.jpg",
    "تا خعت المغنية": "takhat_singer.jpg",
    "آني سو وجا المحارب": "anisowja_warrior.jpg",
    "إيرت حور رو القاضي": "irthurru_judge.jpg",
    "حنوت نخت المربية": "henutnakht_nursemaid.jpg",
    "نب رع القائد البحري": "nebra_admiral.jpg",
    "تا نت آمون الكاهنة": "tanetamun_priestess.jpg",
    "حور إم حب الحارس": "horemhab_guard.jpg",
    "رع نفر الطبيبة": "ranefer_physician.jpg",
    "مر إب أوي النحات": "meribawi_sculptor.jpg",
    "تا وسرت إيسيس": "tausretisis_noble.jpg",
    "خنسو مس الكاتب": "khonsumes_scribe.jpg",
    "نب تاوي الصائغ": "nebtawi_jeweler.jpg",
    "إيسيس ور رت الملكة": "isisweret_queen.jpg",
    "مين عنخ الرحالة": "minankh_trader.jpg",
    "حور ويا الفلكي": "horwia_astronomer.jpg",
    "نحمس عات المحاربة": "nehmesaat_warrior.jpg",
    "خع با سخم الثاني": "khabpasekhem_scribe.jpg",
  };
  
  const fileName = nameToFile[p.name];
  if (!fileName) {
    console.error(`SKIP (no file mapping): ${p.name}`);
    fail++;
    continue;
  }
  
  imgPath = path.join(imgDir, fileName);
  if (!fs.existsSync(imgPath)) {
    console.error(`SKIP (file not found): ${imgPath}`);
    fail++;
    continue;
  }
  
  try {
    const img = await loadImage(imgPath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    
    const det = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    
    if (!det) {
      // Try with lower threshold
      const det2 = await faceapi
        .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.2 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (!det2) {
        console.error(`NO FACE: ${p.name}`);
        fail++;
        continue;
      }
      
      const descriptor = Array.from(det2.descriptor);
      const { error: upErr } = await supabase
        .from("personas")
        .update({ face_descriptor: descriptor })
        .eq("id", p.id);
      if (upErr) { console.error(`UPDATE ERR: ${p.name}: ${upErr.message}`); fail++; }
      else { ok++; console.error(`OK (retry): ${p.name}`); }
      continue;
    }
    
    const descriptor = Array.from(det.descriptor);
    const { error: upErr } = await supabase
      .from("personas")
      .update({ face_descriptor: descriptor })
      .eq("id", p.id);
    if (upErr) { console.error(`UPDATE ERR: ${p.name}: ${upErr.message}`); fail++; }
    else { ok++; console.error(`OK: ${p.name}`); }
  } catch (e) {
    console.error(`ERROR: ${p.name}: ${e.message}`);
    fail++;
  }
}

console.log(JSON.stringify({ ok, fail, total: personas.length }));
