import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Name mappings
const NAME_MAPPINGS = {
  "أحمس": ["ahmose", "amasis"],
  "أمنحتب": ["amenhotep", "amenophis"],
  "أمنمحات": ["amenemhat", "amenemhet"],
  "تحتمس": ["thutmose", "tuthmosis"],
  "رمسيس": ["ramesses", "ramses"],
  "حتشبسوت": ["hatshepsut"],
  "نفرتيتي": ["nefertiti"],
  "أخناتون": ["akhenaten"],
  "توت": ["tut", "tutankh"],
  "سنوسرت": ["senusret", "sesostris"],
  "حور": ["hor", "horus"],
  "إيست": ["isis", "iset"],
  "بتاح": ["ptah"],
  "آمون": ["amun", "amon"],
  "رع": ["ra", "re"],
  "ماعت": ["maat"],
  "سوبك": ["sobek"],
  "مين": ["min"],
  "نخت": ["nakht", "nacht"],
  "مري": ["meri", "merit"],
  "كاموس": ["kamose"],
  "وني": ["weni", "uni"],
  "إنني": ["ineni"],
  "رخمي": ["rekhmire"],
  "حور محب": ["horemheb"],
  "سننموت": ["senenmut"],
  "خيتي": ["khety"],
  "كا جمني": ["kagemni"],
  "مرنبتاح": ["merneptah", "merenptah"],
  "بسوسنس": ["psusennes"],
  "أوسركون": ["osorkon"],
  "نفرو": ["neferu", "neferure"],
  "هميونو": ["hemiunu"],
  "بيبي": ["pepi"],
  "أوناس": ["unas"],
  "نختنبو": ["nectanebo"],
  "عحا": ["aha"],
  "حتب": ["hotep"],
  "منتو": ["montu", "mentu"],
  "سات": ["sat", "sit"],
  "نيت": ["neith"],
  "باك": ["bak"],
  "خنوم": ["khnum"],
  "أبريس": ["apries"],
  "آي": ["ay"],
  "أني": ["ani"],
  "إنتف": ["intef"],
  "خوفو": ["khufu", "cheops"],
  "خفرع": ["khafre", "chephren"],
  "كاورا": ["menkaure"],
  "سنفرو": ["sneferu"],
  "جسر": ["djoser"],
  "تيتي": ["teti"],
  "هور": ["hor"],
  "عنخ": ["ankh"],
  "نفر": ["nefer"],
  "سخم": ["sekhem"],
  "كا": ["ka"],
  "با": ["ba"],
  "مس": ["mes", "mose"],
  "إيحي": ["ihy"],
  "خع": ["kha"],
  "تا": ["ta"],
  "سن": ["sen"],
};

const GENERIC_PATTERNS = [
  /^(ancient egyptian|deir el|theban|valley of|tomb|tt\d|kv\d|qv\d|dynasty|period|kingdom|intermediate)/i,
  /^(papyrus|stela|temple|pyramid|mastaba|saqqara|giza|abydos|luxor|karnak|memphis)/i,
  /^(book of|instruction of|military of|vizier|nomarch|priests|women in|music of|maat$)/i,
  /^(el kab|dahshur|lisht|hawara|meidum|bubastis|tanis|dendera|edfu|wadi|umm)/i,
  /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth)/i,
  /^(twenty|thirtieth)/i,
  /^(western cemetery|step pyramid|mortuary|akhmim|pi-ramesses|beni hasan)/i,
];

function normalizeArabic(name) {
  return name.replace(/^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة|الطبيبة|الأميرة|العازف|المغنية)\s+/, "").trim();
}

function getCandidates(name) {
  const clean = normalizeArabic(name);
  const candidates = [];
  for (const [arabic, english] of Object.entries(NAME_MAPPINGS)) {
    if (clean.includes(arabic)) candidates.push(...english);
  }
  return candidates;
}

function extractSlug(url) {
  const m = url.match(/\/wiki\/(.+?)(?:#.*)?$/);
  return m ? decodeURIComponent(m[1]).replace(/_/g, " ").toLowerCase() : "";
}

async function fetchWikiSummary(url) {
  const slug = url.match(/\/wiki\/(.+?)(?:#.*)?$/)?.[1];
  if (!slug) return null;
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
      headers: { "User-Agent": "PharaonicBot/1.0" }
    });
    if (!r.ok) return null;
    const d = await r.json();
    return { title: d.title || "", extract: d.extract || "" };
  } catch { return null; }
}

// Fetch all personas
const { data: personas } = await supabase
  .from('personas')
  .select('id, name, role, source_image_url')
  .not('source_image_url', 'is', null)
  .order('name');

console.log(`Checking ${personas.length} personas...`);

const results = [];
const BATCH = 10;

for (let i = 0; i < personas.length; i += BATCH) {
  const batch = personas.slice(i, i + BATCH);
  const checks = batch.map(async (p) => {
    const wiki = await fetchWikiSummary(p.source_image_url);
    const slug = extractSlug(p.source_image_url);
    const candidates = getCandidates(p.name);

    if (!wiki) {
      return { ...p, wiki_title: '', relevance: 'error', notes: 'تعذر جلب الصفحة' };
    }

    const titleLower = wiki.title.toLowerCase();
    const extractLower = wiki.extract.toLowerCase();
    const combined = `${titleLower} ${extractLower}`;

    // Direct match
    for (const c of candidates) {
      if (titleLower.includes(c)) return { ...p, wiki_title: wiki.title, relevance: 'direct', notes: `"${c}" في العنوان` };
    }
    for (const c of candidates) {
      if (slug.includes(c)) return { ...p, wiki_title: wiki.title, relevance: 'direct', notes: `"${c}" في الرابط` };
    }
    // Related
    for (const c of candidates) {
      if (extractLower.includes(c)) return { ...p, wiki_title: wiki.title, relevance: 'related', notes: `"${c}" في الملخص` };
    }
    // Contextual
    for (const pat of GENERIC_PATTERNS) {
      if (pat.test(slug) || pat.test(titleLower)) return { ...p, wiki_title: wiki.title, relevance: 'contextual', notes: `صفحة سياقية: "${wiki.title}"` };
    }
    // Role check
    const roleTerms = {
      warrior: ["military", "soldier", "battle", "army", "war", "commander"],
      priest: ["priest", "temple", "religious"],
      scribe: ["scribe", "writing", "papyrus"],
      architect: ["architect", "build", "construction"],
      scholar: ["scholar", "physician", "doctor", "medicine"],
      queen: ["queen", "royal wife", "consort"],
      royalty: ["pharaoh", "king", "ruler", "dynasty"],
      pharaoh: ["pharaoh", "king", "ruler"],
      noble: ["noble", "official", "governor"],
      craftsman: ["craft", "artisan", "worker"],
      artist: ["artist", "sculptor"],
      vizier: ["vizier", "minister"],
    };
    const terms = roleTerms[p.role.toLowerCase()] || [];
    if (terms.some(t => combined.includes(t))) {
      return { ...p, wiki_title: wiki.title, relevance: 'contextual', notes: `الدور "${p.role}" مرتبط` };
    }

    return { ...p, wiki_title: wiki.title, relevance: 'mismatch', notes: `لا ارتباط: "${wiki.title}"` };
  });

  const batchResults = await Promise.all(checks);
  results.push(...batchResults);
  process.stdout.write(`\r${Math.min(i + BATCH, personas.length)}/${personas.length}`);
  await new Promise(r => setTimeout(r, 300));
}

console.log('\n\n=== تقرير التحقق من المصادر ===\n');

const direct = results.filter(r => r.relevance === 'direct');
const related = results.filter(r => r.relevance === 'related');
const contextual = results.filter(r => r.relevance === 'contextual');
const mismatch = results.filter(r => r.relevance === 'mismatch');
const errors = results.filter(r => r.relevance === 'error');

console.log(`✅ مطابقة مباشرة: ${direct.length}`);
console.log(`🔗 مرتبطة: ${related.length}`);
console.log(`📄 سياقية: ${contextual.length}`);
console.log(`❌ تعارض: ${mismatch.length}`);
console.log(`⚠️ أخطاء: ${errors.length}`);
console.log(`📊 الإجمالي: ${results.length}\n`);

if (mismatch.length > 0) {
  console.log('=== التعارضات ===\n');
  for (const r of mismatch) {
    console.log(`❌ ${r.name} (${r.role})`);
    console.log(`   الرابط: ${r.source_image_url}`);
    console.log(`   الصفحة: ${r.wiki_title}`);
    console.log(`   ${r.notes}\n`);
  }
}

if (errors.length > 0) {
  console.log('=== أخطاء في الجلب ===\n');
  for (const r of errors) {
    console.log(`⚠️ ${r.name}: ${r.source_image_url}`);
  }
}

// Save full report as JSON
const fs = await import('fs');
const report = {
  generated_at: new Date().toISOString(),
  summary: { total: results.length, direct: direct.length, related: related.length, contextual: contextual.length, mismatch: mismatch.length, errors: errors.length },
  mismatches: mismatch.map(r => ({ name: r.name, role: r.role, source_url: r.source_image_url, wiki_title: r.wiki_title, notes: r.notes })),
  contextual: contextual.map(r => ({ name: r.name, role: r.role, source_url: r.source_image_url, wiki_title: r.wiki_title, notes: r.notes })),
  errors: errors.map(r => ({ name: r.name, source_url: r.source_image_url })),
};
fs.writeFileSync('/mnt/documents/source_verification_report.json', JSON.stringify(report, null, 2));
console.log('\n📁 التقرير الكامل: /mnt/documents/source_verification_report.json');
