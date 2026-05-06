/**
 * Client-side persona name/description translation.
 * Mirrors the edge function's translation logic so switching lang
 * updates displayed persona data without a new server call.
 */

import { FULL_NAME_DICTIONARY, transliterateArabic } from "./egyptian-transliteration";
import type { Lang } from "./i18n";

// ── Arabic ← English reverse map built from FULL_NAME_DICTIONARY ──
// FULL_NAME_DICTIONARY maps Arabic → English[]. We build English → Arabic.
const _arToEn: Record<string, string> = {};
for (const [ar, enArr] of Object.entries(FULL_NAME_DICTIONARY)) {
  if (enArr.length > 0) {
    // Use the first (canonical) English name, capitalised properly
    _arToEn[ar] = enArr[0]
      .split(/[\s-]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
}

// Category translations
const CATEGORY_AR: Record<string, string> = {
  Pharaoh: "الفراعنة",
  Greek: "الإغريق",
  Persian: "الفرس",
  Samurai: "الساموراي",
  Viking: "الفايكنج",
  Chinese: "الصينيون",
};
const CATEGORY_EN: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_AR).map(([en, ar]) => [ar, en]),
);

// Role translations
const ROLE_EN: Record<string, { male: string; female: string; neutral: string }> = {
  royalty:   { male: "Royal Prince",   female: "Royal Princess",   neutral: "Royal" },
  warrior:   { male: "Warrior",        female: "Warrior",          neutral: "Warrior" },
  scholar:   { male: "Scholar",        female: "Scholar",          neutral: "Scholar" },
  priest:    { male: "Priest",         female: "Priestess",        neutral: "Priest" },
  priestess: { male: "Priest",         female: "Priestess",        neutral: "Priestess" },
  artist:    { male: "Artist",         female: "Artist",           neutral: "Artist" },
  craftsman: { male: "Craftsman",      female: "Craftswoman",      neutral: "Craftsman" },
  explorer:  { male: "Explorer",       female: "Explorer",         neutral: "Explorer" },
  noble:     { male: "Nobleman",       female: "Noblewoman",       neutral: "Noble" },
  commander: { male: "Commander",      female: "Commander",        neutral: "Commander" },
  architect: { male: "Architect",      female: "Architect",        neutral: "Architect" },
  scribe:    { male: "Scribe",         female: "Scribe",           neutral: "Scribe" },
  physician: { male: "Physician",      female: "Physician",        neutral: "Physician" },
  vizier:    { male: "Vizier",         female: "Vizier",           neutral: "Vizier" },
  queen:     { male: "King",           female: "Queen",            neutral: "Queen" },
  pharaoh:   { male: "Pharaoh",        female: "Pharaoh",          neutral: "Pharaoh" },
};

const ROLE_AR: Record<string, { male: string; female: string; neutral: string }> = {
  royalty:   { male: "أمير",          female: "أميرة",           neutral: "شخصية ملكية" },
  warrior:   { male: "محارب",         female: "محاربة",          neutral: "محارب" },
  scholar:   { male: "عالِم",         female: "عالمة",           neutral: "عالم" },
  priest:    { male: "كاهن",          female: "كاهنة",           neutral: "كاهن" },
  priestess: { male: "كاهن",          female: "كاهنة",           neutral: "كاهنة" },
  artist:    { male: "فنان",          female: "فنانة",           neutral: "فنان" },
  craftsman: { male: "حِرَفي",        female: "حِرَفية",         neutral: "حِرَفي" },
  explorer:  { male: "مستكشف",        female: "مستكشفة",         neutral: "مستكشف" },
  noble:     { male: "نبيل",          female: "نبيلة",           neutral: "نبيل" },
  commander: { male: "قائد",          female: "قائدة",           neutral: "قائد" },
  architect: { male: "مهندس معماري",  female: "مهندسة معمارية",  neutral: "مهندس" },
  scribe:    { male: "كاتب",          female: "كاتبة",           neutral: "كاتب" },
  physician: { male: "طبيب",          female: "طبيبة",           neutral: "طبيب" },
  vizier:    { male: "وزير",          female: "وزيرة",           neutral: "وزير" },
  queen:     { male: "ملك",           female: "ملكة",            neutral: "ملكة" },
  pharaoh:   { male: "فرعون",         female: "فرعون",           neutral: "فرعون" },
};

const isArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

/** Capitalise first letter of each word in a transliterated name */
function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Translate a persona name to the target language.
 * Works for both Arabic→English and English→Arabic.
 */
export function translateName(
  name: string,
  targetLang: Lang,
  _role?: string | null,
  _gender?: string | null,
): string {
  const nameHasArabic = isArabic(name);

  if (targetLang === "ar") {
    // Already Arabic → keep
    if (nameHasArabic) return name;
    // English → look up Arabic
    // Try reverse lookup in FULL_NAME_DICTIONARY values
    for (const [ar, enArr] of Object.entries(FULL_NAME_DICTIONARY)) {
      if (enArr.some((e) => e.toLowerCase() === name.toLowerCase())) return ar;
    }
    return name; // No translation found, keep as-is
  }

  // targetLang === "en"
  if (!nameHasArabic) return name; // Already English

  // Try FULL_NAME_DICTIONARY (Arabic → English[])
  const cleanName = name
    .replace(
      /^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة|الطبيبة|الأميرة|العازف|الوزيرة)\s+/,
      "",
    )
    .trim();

  const dictEntry = FULL_NAME_DICTIONARY[name] ?? FULL_NAME_DICTIONARY[cleanName];
  if (dictEntry && dictEntry.length > 0) {
    return titleCase(dictEntry[0]);
  }

  // Try the reverse NAME_AR map
  const fromReverse = _arToEn[name] ?? _arToEn[cleanName];
  if (fromReverse) return fromReverse;

  // Fallback: phonetic transliteration
  return titleCase(transliterateArabic(name));
}

/**
 * Translate a category name.
 */
export function translateCategory(category: string, targetLang: Lang): string {
  if (targetLang === "ar") return CATEGORY_AR[category] ?? category;
  // If category is already in Arabic, reverse-lookup
  return CATEGORY_EN[category] ?? category;
}

/**
 * Generate a generic English description for a persona based on role/gender.
 */
export function translateDescription(
  description: string,
  targetLang: Lang,
  role?: string | null,
  gender?: string | null,
): string {
  const descIsArabic = isArabic(description);

  if (targetLang === "ar") {
    if (descIsArabic) return description;
    return description; // Keep English if no Arabic version
  }

  // targetLang === "en"
  if (!descIsArabic) return description; // Already English

  // Generate English description from role
  const r = ROLE_EN[role ?? "noble"] ?? ROLE_EN.noble;
  const g = gender === "female" ? r.female : gender === "male" ? r.male : r.neutral;
  const verbs: Record<string, string> = {
    royalty: "bearing the majesty of the throne and the wisdom of rule",
    warrior: "showing the courage of the battlefield and the resolve of battle",
    scholar: "pulsing with the wisdom of books and the curiosity of great minds",
    priest: "radiating the reverence of temples and the serenity of the sacred",
    priestess: "radiating the reverence of temples and the serenity of the sacred",
    artist: "carrying the spirit of beauty and creative inspiration",
    craftsman: "whose hands bear witness to masterful craftsmanship",
    explorer: "with eyes alight with the spirit of adventure",
    noble: "carrying the dignity of nobility and the presence of high station",
    commander: "with the strategic mind and iron will of a military leader",
    architect: "whose vision shaped monuments that stand for eternity",
    scribe: "whose pen preserved the wisdom of an ancient civilization",
    physician: "whose healing hands served both royals and commoners",
    vizier: "wielding administrative power second only to the throne",
    queen: "embodying grace, power, and the divine feminine",
    pharaoh: "ruling with divine authority over the land of the Nile",
  };
  const verb = verbs[role ?? "noble"] ?? verbs.noble;
  return `An ancient Egyptian ${g.toLowerCase()}, ${verb}.`;
}