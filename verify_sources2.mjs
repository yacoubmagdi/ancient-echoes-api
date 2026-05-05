import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UA = "PharaonicPersonaVerifier/1.0 (https://lovable.app; educational; contact@lovable.dev)";

const NAME_MAP = {
  "أحمس": ["ahmose","amasis"], "أمنحتب": ["amenhotep","amenophis"], "أمنمحات": ["amenemhat"],
  "تحتمس": ["thutmose","tuthmosis"], "رمسيس": ["ramesses","ramses"], "حتشبسوت": ["hatshepsut"],
  "نفرتيتي": ["nefertiti"], "أخناتون": ["akhenaten"], "توت": ["tut"], "سنوسرت": ["senusret"],
  "حور": ["hor","horus"], "بتاح": ["ptah"], "آمون": ["amun","amon"], "رع": ["ra","re"],
  "ماعت": ["maat"], "سوبك": ["sobek"], "مين": ["min"], "نخت": ["nakht","nacht"],
  "مري": ["meri","merit"], "كاموس": ["kamose"], "وني": ["weni"], "إنني": ["ineni"],
  "رخمي": ["rekhmire"], "حور محب": ["horemheb"], "سننموت": ["senenmut"],
  "خيتي": ["khety"], "مرنبتاح": ["merneptah"], "بسوسنس": ["psusennes"],
  "أوسركون": ["osorkon"], "نفرو": ["neferu","neferure"], "هميونو": ["hemiunu"],
  "بيبي": ["pepi"], "أوناس": ["unas"], "نختنبو": ["nectanebo"], "عحا": ["aha"],
  "حتب": ["hotep"], "منتو": ["montu"], "سات": ["sat","sit"], "نيت": ["neith"],
  "خنوم": ["khnum"], "أبريس": ["apries"], "آي": ["ay"], "أني": ["ani"],
  "إنتف": ["intef"], "خوفو": ["khufu"], "خفرع": ["khafre"], "كاورا": ["menkaure"],
  "سنفرو": ["sneferu"], "تيتي": ["teti"], "عنخ": ["ankh"], "نفر": ["nefer"],
  "سخم": ["sekhem"], "مس": ["mes","mose"], "خع": ["kha"], "تا": ["ta"], "سن": ["sen"],
  "إمحتب": ["imhotep"], "باك": ["bak","bek"], "إيست": ["isis","iset"],
  "حسي": ["hesy","hesyre"], "بسماتيك": ["psamtik"], "بينجم": ["pinedjem"],
  "تاوسرت": ["twosret"], "بانحسي": ["panehesy"], "باي": ["bay"],
  "حابو": ["habu"], "جحوتي": ["djehuti"], "سنب": ["seneb"], "خنسو": ["khonsu"],
  "حرخوف": ["harkhuf"], "ميريت": ["merit","meret"], "إيحي": ["ihy"],
};

const GENERIC = [
  /^(ancient egyptian|deir|theban|valley|tomb|tt\d|kv\d|qv\d|dynasty|period|kingdom|intermediate)/i,
  /^(papyrus|stela|temple|pyramid|mastaba|saqqara|giza|abydos|luxor|karnak|memphis)/i,
  /^(book of|instruction of|military|vizier|nomarch|priest|women|music|maat$|isis$|hathor$|neith$)/i,
  /^(el kab|dahshur|lisht|hawara|meidum|bubastis|tanis|dendera|edfu|wadi|umm|beni|bab el|db320)/i,
  /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteen)/i,
  /^(twenty|thirtieth|nineteenth|seventeenth|harem|royal|western|step|mortuary|akhmim|pi-ram)/i,
  /^(great kenbet|cosmetic|nurse|god.s wife|serapeum|autobiography|carnarvon|edwin smith|insinger)/i,
  /^(medjay|montu$|taweret$|seshat$|el kab|sobekhotep|dahshur|amarna)/i,
];

function norm(n) { return n.replace(/^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة|الطبيبة|الأميرة|العازف|المغنية|الوزيرة)\s+/,"").trim(); }

function getCandidates(name) {
  const c = norm(name), res = [];
  for (const [ar, en] of Object.entries(NAME_MAP)) { if (c.includes(ar)) res.push(...en); }
  return res;
}

function slug(url) { const m = url.match(/\/wiki\/(.+?)(?:#.*)?$/); return m ? decodeURIComponent(m[1]).replace(/_/g," ").toLowerCase() : ""; }

async function fetchWiki(url) {
  const s = url.match(/\/wiki\/(.+?)(?:#.*)?$/)?.[1];
  if (!s) return null;
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${s}`, { headers: { "User-Agent": UA } });
    if (r.status === 429) { await new Promise(r => setTimeout(r, 5000)); return null; }
    if (!r.ok) return null;
    const d = await r.json();
    return { title: d.title||"", extract: d.extract||"" };
  } catch { return null; }
}

const { data: personas } = await supabase.from('personas').select('id,name,role,source_image_url').not('source_image_url','is',null).order('name');
console.log(`Checking ${personas.length} personas (1 at a time with delays)...`);

const results = [];
for (let i = 0; i < personas.length; i++) {
  const p = personas[i];
  const wiki = await fetchWiki(p.source_image_url);
  const s = slug(p.source_image_url);
  const cands = getCandidates(p.name);
  
  if (!wiki) {
    results.push({ ...p, wiki_title: '', relevance: 'error', notes: 'fetch failed' });
  } else {
    const tl = wiki.title.toLowerCase(), el = wiki.extract.toLowerCase(), comb = `${tl} ${el}`;
    let found = false;
    for (const c of cands) {
      if (tl.includes(c) || s.includes(c)) { results.push({ ...p, wiki_title: wiki.title, relevance: 'direct', notes: c }); found = true; break; }
    }
    if (!found) {
      for (const c of cands) {
        if (el.includes(c)) { results.push({ ...p, wiki_title: wiki.title, relevance: 'related', notes: c }); found = true; break; }
      }
    }
    if (!found) {
      if (GENERIC.some(pat => pat.test(s) || pat.test(tl))) {
        results.push({ ...p, wiki_title: wiki.title, relevance: 'contextual', notes: wiki.title });
        found = true;
      }
    }
    if (!found) results.push({ ...p, wiki_title: wiki.title, relevance: 'mismatch', notes: wiki.title });
  }
  
  if ((i+1) % 50 === 0) process.stdout.write(`${i+1}/${personas.length}\n`);
  await new Promise(r => setTimeout(r, 250)); // 4 req/sec
}

const direct = results.filter(r => r.relevance === 'direct');
const related = results.filter(r => r.relevance === 'related');
const contextual = results.filter(r => r.relevance === 'contextual');
const mismatch = results.filter(r => r.relevance === 'mismatch');
const errors = results.filter(r => r.relevance === 'error');

console.log(`\n=== تقرير التحقق ===`);
console.log(`✅ مطابقة مباشرة: ${direct.length}`);
console.log(`🔗 مرتبطة: ${related.length}`);
console.log(`📄 سياقية: ${contextual.length}`);
console.log(`❌ تعارض محتمل: ${mismatch.length}`);
console.log(`⚠️ أخطاء: ${errors.length}`);
console.log(`📊 الإجمالي: ${results.length}\n`);

if (mismatch.length) {
  console.log('=== التعارضات ===');
  for (const r of mismatch) console.log(`❌ ${r.name} (${r.role}) → ${r.wiki_title} | ${r.source_image_url}`);
}

const report = {
  generated_at: new Date().toISOString(),
  summary: { total: results.length, direct: direct.length, related: related.length, contextual: contextual.length, mismatch: mismatch.length, errors: errors.length },
  mismatches: mismatch.map(r => ({ id: r.id, name: r.name, role: r.role, url: r.source_image_url, wiki_title: r.wiki_title })),
  contextual_pages: contextual.map(r => ({ name: r.name, url: r.source_image_url, wiki_title: r.wiki_title })),
  errors: errors.map(r => ({ name: r.name, url: r.source_image_url })),
  all_results: results.map(r => ({ name: r.name, relevance: r.relevance, wiki_title: r.wiki_title, url: r.source_image_url })),
};
writeFileSync('/mnt/documents/source_verification_report.json', JSON.stringify(report, null, 2));
console.log('\n📁 /mnt/documents/source_verification_report.json');
