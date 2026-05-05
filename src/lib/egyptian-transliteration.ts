/**
 * Egyptian Name Transliteration & Matching System
 * 
 * Three-layer matching:
 * 1. EXACT_DICTIONARY — full Arabic name → known English equivalents
 * 2. PHONETIC_TRANSLITERATION — Arabic letter-by-letter → Latin approximation
 * 3. FUZZY_MATCH — Levenshtein distance on transliterated forms
 */

// ═══════════════════════════════════════════════════════════════
// Layer 1: Full-name dictionary (Arabic persona name → English Wikipedia slugs)
// ═══════════════════════════════════════════════════════════════

export const FULL_NAME_DICTIONARY: Record<string, string[]> = {
  // ── Pharaohs & Royalty ──
  "آي": ["ay", "ay pharaoh"],
  "أبريس": ["apries"],
  "أحمس الأول": ["ahmose i", "ahmose"],
  "أحمس الثاني": ["amasis ii", "amasis"],
  "أخناتون": ["akhenaten", "akhenaton"],
  "أمنحتب الأول": ["amenhotep i"],
  "أمنحتب الثالث": ["amenhotep iii"],
  "آمون حتب الثاني": ["amenhotep ii"],
  "أمنمحات الأول": ["amenemhat i"],
  "أمنمحات الثاني": ["amenemhat ii"],
  "أمنمحات الثالث": ["amenemhat iii"],
  "أمنمحات الرابع": ["amenemhat iv"],
  "أمنمحات الخامس": ["amenemhat v"],
  "أمنمحات السادس": ["amenemhat vi"],
  "أمنمحات السابع": ["amenemhat vii"],
  "أمنمسي": ["amenmesse"],
  "أمنمؤبت": ["amenemope", "amenemope pharaoh"],
  "أمنيرديس الأولى": ["amenirdis i", "amenirdis"],
  "أمون رود": ["nepherites i", "nepherites"],
  "أمير تايوس": ["amyrtaeus"],
  "أوسركون الأول": ["osorkon i"],
  "أوسركون الثاني": ["osorkon ii"],
  "أوناس": ["unas", "wenis"],
  "إنتف الأول": ["intef i"],
  "إنتف الثاني": ["intef ii"],
  "إنتف الثالث": ["intef iii"],
  "بسماتيك الأول": ["psamtik i", "psammetichus i"],
  "بسماتيك الثاني": ["psamtik ii"],
  "بسماتيك الثالث": ["psamtik iii"],
  "بسوسنس الأول": ["psusennes i"],
  "بسوسنس الثاني": ["psusennes ii"],
  "بوكوريس": ["bakenranef", "bocchoris"],
  "بيبي الأول": ["pepi i", "pepi i meryre"],
  "بيبي الثاني": ["pepi ii", "pepi ii neferkare"],
  "بينجم الأول": ["pinedjem i", "pinedjem"],
  "تاوسرت": ["twosret", "tausret"],
  "تحتمس الأول": ["thutmose i"],
  "تحتمس الثاني": ["thutmose ii"],
  "تحتمس الرابع": ["thutmose iv"],
  "تف نخت": ["tefnakht"],
  "جر": ["djer"],
  "جت": ["djet", "wadj"],
  "حاكور": ["hakor", "achoris"],
  "حور محب": ["horemheb"],
  "حوني": ["huni"],
  "خع سخم وي": ["khasekhemwy"],
  "خفرع": ["khafre", "khafra", "chephren"],
  "خوفو": ["khufu", "cheops"],
  "دن": ["den", "den pharaoh"],
  "رمسيس الأول": ["ramesses i"],
  "الفرعون رمسيس الثاني": ["ramesses ii", "ramesses the great"],
  "رمسيس الثالث": ["ramesses iii"],
  "رمسيس الرابع": ["ramesses iv"],
  "رمسيس الخامس": ["ramesses v"],
  "رمسيس السادس": ["ramesses vi"],
  "رمسيس التاسع": ["ramesses ix"],
  "رمسيس العاشر": ["ramesses x"],
  "رمسيس الحادي عشر": ["ramesses xi"],
  "زوسر": ["djoser", "zoser"],
  "ساناخت": ["sanakht"],
  "سمندس": ["smendes"],
  "سنفرو": ["sneferu"],
  "سنوسرت الأول": ["senusret i", "sesostris i"],
  "سنوسرت الثاني": ["senusret ii"],
  "سنوسرت الثالث": ["senusret iii", "sesostris iii"],
  "سي أمن": ["siamun"],
  "سيتي الثاني": ["seti ii"],
  "الفرعون سيتي الأول": ["seti i"],
  "شبسكاف": ["shepseskaf"],
  "شيشنق الأول": ["shoshenq i", "sheshonq i"],
  "عحا": ["aha", "hor-aha"],
  "قعا": ["qa'a", "qaa"],
  "كاموس": ["kamose"],
  "مرنبتاح": ["merneptah", "merenptah"],
  "مرنيث": ["merneith"],
  "مس حتب رع": ["mentuhotep"],
  "منتو حتب الأول": ["mentuhotep i"],
  "منتو حتب الثاني": ["mentuhotep ii"],
  "منتو حتب الثالث": ["mentuhotep iii"],
  "نارمر": ["narmer"],
  "نختنبو الأول": ["nectanebo i"],
  "نختنبو الثاني": ["nectanebo ii"],
  "با نب جدت": ["db320", "royal cache"],
  "رنس نب": ["raneb"],
  "تيتي الملك": ["teti"],
  
  // ── Queens & Princesses ──
  "الملكة حتشبسوت": ["hatshepsut"],
  "الملكة كليوباترا السابعة": ["cleopatra"],
  "الملكة نفرتيتي": ["nefertiti"],
  "الملكة تي": ["tiye"],
  "إياح حتب": ["ahhotep ii", "ahhotep"],
  "إياح موس": ["ahmose queen", "ahmose"],
  "إيبوت الأولى": ["iput i", "iput"],
  "إيدوت الأميرة": ["idut"],
  "إيزيس نوفرت": ["isisnofret", "isetnofret"],
  "إيسيس ور رت الملكة": ["iset queen", "iset"],
  "بيبا": ["isetnofret ii"],
  "تيتي": ["tyti"],
  "تيتي الأميرة": ["eighteenth dynasty"],
  "تيي حوتيب": ["tausret", "twosret"],
  "تيي صغيرة": ["baketaten", "younger lady"],
  "حتب-حرس الأولى": ["hetepheres i", "hetepheres"],
  "حتب حرس الثالثة": ["hetepheres"],
  "حنوت سن الثانية": ["neferure"],
  "حوتشيبسوت الثانية": ["hatshepsut-meryetre", "merytre-hatshepsut"],
  "خميرا الأولى": ["khenemetneferhedjet i", "khenemetneferhedjet"],
  "خميرا الثانية": ["khenemetneferhedjet ii"],
  "خنت كاوس الأولى": ["khentkaus i", "khentkawes"],
  "خنت كاوس الثانية": ["khentkaus ii"],
  "خنت كاوس الثالثة": ["khentkaus iii"],
  "كيا": ["kiya"],
  "موت تويا": ["tuya", "mut-tuya"],
  "موت نجمت": ["mutnedjmet"],
  "ميري تي تي الملكة": ["meritites i", "meritites"],
  "نفرت إيري": ["neferti", "neferti-iry"],
  "نفرتاري": ["nefertari"],
  "أخمس سات حابو": ["ahmose-sitamun"],
  "أخمس سات كاموس": ["ahmose-sitkamose"],
  "أخمس مريت أمون": ["ahmose-meritamun"],
  "سات إيح": ["ahmose-inhapi", "sat-iah"],
  "674c355f": ["merneith"],
  
  // ── Officials, Scribes, Priests ──
  "أمنحتب ابن حابو": ["amenhotep son of hapu", "amenhotep hapu"],
  "أمنمحاب": ["amenemhab"],
  "أمنمؤبى": ["instruction of amenemope", "amenemope"],
  "آمون حتب حوي الثاني": ["amenhotep huy"],
  "أني الكاتب": ["ani"],
  "إبي": ["tt36", "ibi"],
  "إريماعت": ["rekhmire"],
  "إمحتب": ["imhotep"],
  "إنني": ["ineni"],
  "المهندس هميونو": ["hemiunu"],
  "الوزير رخميرع": ["rekhmire"],
  "الوزيرة نبت": ["nebet vizier"],
  "الطبيبة بسشت": ["peseshet"],
  "الفنان بِك": ["bek sculptor", "bek"],
  "الكاهنة شبنوبت": ["shepenupet ii", "shepenupet"],
  "با حري الحاكم": ["paheri"],
  "با سر الوزير": ["paser vizier", "paser"],
  "بتاح حتب": ["ptahhotep"],
  "بتاح شبسس": ["ptahshepses"],
  "بتاح مس الكاهن": ["ptahmose"],
  "بيبي نخت المغامر": ["pepynakht"],
  "بانحسي": ["panehesy"],
  "باي": ["bay chancellor", "bay"],
  "تجنوتي": ["djehuty general", "djehuty"],
  "ثنوني المهندس": ["djehuty general", "djehuty"],
  "حقا ناخت": ["heqanakht"],
  "حقا رشو": ["khnumhotep ii", "khnumhotep"],
  "حونيفر": ["hunefer"],
  "حور ون نفر": ["hornefer"],
  "خع إم حات": ["khaemhat", "tt57"],
  "خيت": ["khety", "kheti"],
  "خيتي الرابع": ["merykare", "khety iv"],
  "خيتي كاتب": ["satire of the trades"],
  "سابني حاكم الفنتين": ["sabni"],
  "سننموت": ["senenmut"],
  "سينوهي": ["story of sinuhe", "sinuhe"],
  "شاباسا": ["shabaka"],
  "كا جمني": ["kagemni"],
  "كاواب": ["kawab"],
  "ماهو": ["mahu noble", "mahu"],
  "مايا": ["maya treasurer", "maya"],
  "مري روكا": ["mereruka"],
  "مسن": ["metjen"],
  "إيبو ور": ["ipuwer"],
  "أمنحرخبشف": ["amunherkhepeshef", "amun-her-khepeshef"],
  "إنحر خاوي المعمار": ["inherkhau"],
  "أخمو": ["ahmose soldier"],
  "أنخ ماحور": ["ankhmahor", "tomb of ankhmahor"],
  "سا رنبوت الثالث": ["sarenput ii", "sarenput"],
  "مِن نخت القائد": ["tt86", "menkheperraseneb"],
  "حنوت نخت المربية": ["sitre in", "sitre"],
  "حنوت تمحو": ["karomama"],
  "حنوت ويدجو": ["kahun papyri"],
  "حور ويا الفلكي": ["egyptian astronomy"],
  "حوري المعمار": ["egyptian temple", "ancient egyptian architecture"],
  "مر إب أوي النحات": ["ancient egyptian art", "art of ancient egypt"],
  "آمون إم حات": ["abbott papyrus"],
  "النحات مِن": ["men sculptor"],
  "تا إيمحتب": ["taimhotep"],
  "تا ديت إيسيس الكاهنة": ["tadiset"],
};

// ═══════════════════════════════════════════════════════════════
// Layer 2: Arabic → Latin Phonetic Transliteration
// ═══════════════════════════════════════════════════════════════

const ARABIC_TO_LATIN: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ء": "",
  "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h",
  "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
  "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t",
  "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q",
  "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h",
  "و": "w", "ي": "y", "ى": "a", "ة": "t",
  // Diacritics
  "َ": "a", "ُ": "u", "ِ": "i", "ّ": "", "ْ": "",
  "ً": "n", "ٌ": "n", "ٍ": "n",
};

// Egyptian-specific phonetic overrides (common in Egyptology)
const EGYPTIAN_PHONETIC_RULES: [RegExp, string][] = [
  [/^al-?/i, ""], // Remove Arabic article "al-"
  [/حتب/g, "hotep"],
  [/آمون|أمون|امون/g, "amun"],
  [/آمن|أمن|امن/g, "amen"],
  [/حور/g, "hor"],
  [/رع/g, "ra"],
  [/ماعت/g, "maat"],
  [/بتاح/g, "ptah"],
  [/نفر/g, "nefer"],
  [/مس/g, "mes"],
  [/خع/g, "kha"],
  [/سخم/g, "sekhem"],
  [/خنوم/g, "khnum"],
  [/عنخ/g, "ankh"],
  [/وسر/g, "user"],
  [/سوبك/g, "sobek"],
  [/منتو/g, "montu"],
  [/خنسو/g, "khonsu"],
  [/جحوتي/g, "djehuti"],
  [/تحت/g, "thut"],
  [/نخت/g, "nakht"],
  [/إيست|إيزيس/g, "isis"],
  [/ميريت|مريت/g, "merit"],
  [/سات/g, "sat"],
];

/**
 * Transliterate an Arabic name to its approximate Latin/English form.
 * First applies Egyptian-specific phonetic rules, then falls back to
 * letter-by-letter transliteration.
 */
export function transliterateArabic(arabic: string): string {
  let text = arabic.trim();
  
  // Remove common prefixes
  text = text.replace(
    /^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة|الطبيبة|الأميرة|العازف|الوزيرة)\s+/,
    ""
  ).trim();
  
  // Apply Egyptian phonetic rules first
  let result = text;
  for (const [pattern, replacement] of EGYPTIAN_PHONETIC_RULES) {
    result = result.replace(pattern, replacement);
  }
  
  // Transliterate remaining Arabic characters
  let latinized = "";
  for (const char of result) {
    if (char === " " || char === "-") {
      latinized += " ";
    } else if (/[a-zA-Z0-9]/.test(char)) {
      latinized += char; // Already Latin (from phonetic rules)
    } else if (ARABIC_TO_LATIN[char] !== undefined) {
      latinized += ARABIC_TO_LATIN[char];
    }
    // Skip unknown characters
  }
  
  // Clean up
  return latinized
    .replace(/\s+/g, " ")
    .replace(/([aeiou])\1+/g, "$1") // Deduplicate vowels
    .trim()
    .toLowerCase();
}

// ═══════════════════════════════════════════════════════════════
// Layer 3: Fuzzy Matching (Levenshtein Distance)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute Levenshtein distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

/**
 * Normalized similarity score (0-1, higher = more similar).
 */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ═══════════════════════════════════════════════════════════════
// Combined Matching Engine
// ═══════════════════════════════════════════════════════════════

export type MatchResult = {
  matched: boolean;
  strategy: "exact_dictionary" | "transliteration" | "fuzzy" | "substring" | "none";
  confidence: number;
  matchedTerm: string;
  details: string;
};

/**
 * Check if an Arabic persona name matches the content of a Wikipedia page.
 * Uses three strategies in order of confidence.
 */
export function matchPersonaToWiki(
  arabicName: string,
  wikiTitle: string,
  wikiExtract: string,
  wikiSlug: string
): MatchResult {
  const combined = `${wikiTitle} ${wikiSlug} ${wikiExtract}`.toLowerCase();
  const titleLower = wikiTitle.toLowerCase();
  const slugLower = wikiSlug.replace(/_/g, " ").toLowerCase();
  
  // Strategy 1: Exact dictionary lookup
  const cleanName = arabicName.replace(
    /^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة|الطبيبة|الأميرة|العازف|الوزيرة)\s+/,
    ""
  ).trim();
  
  // Try full name first, then clean name
  const dictEntries = FULL_NAME_DICTIONARY[arabicName] || FULL_NAME_DICTIONARY[cleanName] || [];
  
  for (const entry of dictEntries) {
    const entryLower = entry.toLowerCase();
    if (
      titleLower.includes(entryLower) ||
      slugLower.includes(entryLower) ||
      entryLower.includes(slugLower.split("(")[0].trim())
    ) {
      return {
        matched: true,
        strategy: "exact_dictionary",
        confidence: 0.98,
        matchedTerm: entry,
        details: `قاموس: "${arabicName}" ↔ "${entry}" يتطابق مع "${wikiTitle}"`,
      };
    }
    // Check in extract too
    if (combined.includes(entryLower)) {
      return {
        matched: true,
        strategy: "exact_dictionary",
        confidence: 0.85,
        matchedTerm: entry,
        details: `قاموس: "${entry}" مذكور في ملخص "${wikiTitle}"`,
      };
    }
  }
  
  // Strategy 2: Phonetic transliteration matching
  const transliterated = transliterateArabic(arabicName);
  if (transliterated.length >= 3) {
    // Check if transliterated form appears in title/slug
    if (titleLower.includes(transliterated) || slugLower.includes(transliterated)) {
      return {
        matched: true,
        strategy: "transliteration",
        confidence: 0.9,
        matchedTerm: transliterated,
        details: `تهجئة صوتية: "${transliterated}" في "${wikiTitle}"`,
      };
    }
    
    // Check transliterated words (for compound names)
    const transWords = transliterated.split(" ").filter(w => w.length >= 3);
    const slugWords = slugLower.split(/[\s_()-]+/).filter(w => w.length >= 3);
    const titleWords = titleLower.split(/[\s_()-]+/).filter(w => w.length >= 3);
    const allWikiWords = [...new Set([...slugWords, ...titleWords])];
    
    let wordMatches = 0;
    const matchedWords: string[] = [];
    for (const tw of transWords) {
      for (const ww of allWikiWords) {
        if (tw === ww || similarity(tw, ww) >= 0.75) {
          wordMatches++;
          matchedWords.push(`${tw}≈${ww}`);
          break;
        }
      }
    }
    
    if (transWords.length > 0 && wordMatches / transWords.length >= 0.5) {
      return {
        matched: true,
        strategy: "transliteration",
        confidence: 0.7 + 0.2 * (wordMatches / transWords.length),
        matchedTerm: matchedWords.join(", "),
        details: `تطابق كلمات: ${matchedWords.join(", ")}`,
      };
    }
  }
  
  // Strategy 3: Fuzzy match on slug vs transliterated name
  if (transliterated.length >= 4 && slugLower.length >= 4) {
    const slugClean = slugLower.replace(/\(.*?\)/g, "").trim();
    const sim = similarity(transliterated, slugClean);
    if (sim >= 0.6) {
      return {
        matched: true,
        strategy: "fuzzy",
        confidence: sim * 0.85,
        matchedTerm: slugClean,
        details: `تشابه ضبابي: "${transliterated}" ↔ "${slugClean}" (${(sim * 100).toFixed(0)}%)`,
      };
    }
  }
  
  // Strategy 4: Substring check — any significant transliterated word in extract
  if (transliterated.length >= 4) {
    const mainPart = transliterated.split(" ")[0];
    if (mainPart.length >= 4 && combined.includes(mainPart)) {
      return {
        matched: true,
        strategy: "substring",
        confidence: 0.55,
        matchedTerm: mainPart,
        details: `جزء من الاسم "${mainPart}" في النص`,
      };
    }
  }
  
  return {
    matched: false,
    strategy: "none",
    confidence: 0,
    matchedTerm: "",
    details: `لا تطابق: "${arabicName}" (${transliterated}) ↔ "${wikiTitle}"`,
  };
}