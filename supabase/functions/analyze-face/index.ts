// POST /analyze-face — accepts a user image (multipart/form-data, field "photo"),
// validates it, calls Luxand /photo/search restricted to our personas collection,
// and returns the top match plus the next two runners-up.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, apikey",
};

const LUXAND_BASE = "https://api.luxand.cloud";
const COLLECTION = "historical_personas";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

// --- Zodiac-based personality traits (English + Arabic).
// We never name the sign in the output — only weave the traits into the
// description so it feels like a personalized reading.
type ZodiacKey =
  | "aries" | "taurus" | "gemini" | "cancer" | "leo" | "virgo"
  | "libra" | "scorpio" | "sagittarius" | "capricorn" | "aquarius" | "pisces";

function getZodiac(date: Date): ZodiacKey {
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const ranges: Array<[ZodiacKey, [number, number], [number, number]]> = [
    ["capricorn",   [12, 22], [1, 19]],
    ["aquarius",    [1, 20],  [2, 18]],
    ["pisces",      [2, 19],  [3, 20]],
    ["aries",       [3, 21],  [4, 19]],
    ["taurus",      [4, 20],  [5, 20]],
    ["gemini",      [5, 21],  [6, 20]],
    ["cancer",      [6, 21],  [7, 22]],
    ["leo",         [7, 23],  [8, 22]],
    ["virgo",       [8, 23],  [9, 22]],
    ["libra",       [9, 23],  [10, 22]],
    ["scorpio",     [10, 23], [11, 21]],
    ["sagittarius", [11, 22], [12, 21]],
  ];
  for (const [key, [sm, sd], [em, ed]] of ranges) {
    if (sm === em) {
      if (m === sm && d >= sd && d <= ed) return key;
    } else {
      if ((m === sm && d >= sd) || (m === em && d <= ed)) return key;
    }
  }
  return "capricorn";
}

const TRAITS: Record<ZodiacKey, { en: string; ar: string }> = {
  aries:       { en: "bold, fearless, and quick to lead the charge",                   ar: "جريء، شجاع، وسريع في قيادة المعركة" },
  taurus:      { en: "steadfast, patient, and devoted to lasting beauty",              ar: "ثابت، صبور، ومخلص للجمال الباقي" },
  gemini:      { en: "quick-witted, curious, and a master of many tongues",            ar: "حاضر البديهة، فضولي، وبارع في الألسن" },
  cancer:      { en: "deeply intuitive, protective, and bound to home and kin",       ar: "بديهي عميق، حامٍ، ومرتبط بالأهل والديار" },
  leo:         { en: "regal, proud, and born to be remembered",                       ar: "مَلَكي، فخور، ومخلوق ليُذكر" },
  virgo:       { en: "meticulous, wise, and devoted to craft and detail",             ar: "دقيق، حكيم، ومخلص للحرفة والتفاصيل" },
  libra:       { en: "balanced, diplomatic, and a seeker of harmony",                 ar: "متوازن، دبلوماسي، وباحث عن الانسجام" },
  scorpio:     { en: "intense, magnetic, and keeper of profound secrets",             ar: "قوي الحضور، جذاب، وحارس للأسرار العميقة" },
  sagittarius: { en: "adventurous, free-spirited, and forever chasing the horizon",   ar: "مغامر، حرّ الروح، يلاحق الأفق دائمًا" },
  capricorn:   { en: "disciplined, ambitious, and a builder of enduring legacies",    ar: "منضبط، طموح، وبانٍ لإرثٍ خالد" },
  aquarius:    { en: "visionary, independent, and ahead of your age",                 ar: "ذو رؤية، مستقل، وسابق لعصرك" },
  pisces:      { en: "dreamy, compassionate, and tuned to unseen currents",           ar: "حالم، رحيم، ومتصل بتيارات خفية" },
};

function personalityLine(zodiac: ZodiacKey, lang: "en" | "ar"): string {
  const t = TRAITS[zodiac][lang];
  return lang === "ar"
    ? `يميل طبعك إلى أن تكون ${t} — وهذه السمات تمنح هذه الشخصية صدى خاصًا في حياتك.`
    : `Your nature tends to be ${t} — traits that make this persona resonate uniquely with you.`;
}

// --- Arabic localization for personas ---
// We translate category, role, and the persona name on the fly so the
// final output can be fully Arabic when the user picks lang=ar without
// requiring per-row translations in the database.

const CATEGORY_AR: Record<string, string> = {
  Pharaoh: "الفراعنة",
  Greek: "الإغريق",
  Persian: "الفرس",
  Samurai: "الساموراي",
  Viking: "الفايكنج",
};

const ROLE_AR: Record<string, { male: string; female: string; neutral: string }> = {
  royalty:   { male: "أمير من البلاط الملكي", female: "أميرة من البلاط الملكي", neutral: "شخصية ملكية" },
  warrior:   { male: "محارب شجاع",            female: "محاربة شجاعة",          neutral: "محارب" },
  scholar:   { male: "عالِم حكيم",            female: "عالمة حكيمة",            neutral: "عالم" },
  priest:    { male: "كاهن مقدّس",            female: "كاهنة مقدّسة",          neutral: "كاهن" },
  artist:    { male: "فنان مبدع",             female: "فنانة مبدعة",           neutral: "فنان" },
  craftsman: { male: "حِرَفي ماهر",           female: "حِرَفية ماهرة",         neutral: "حِرَفي" },
  explorer:  { male: "مستكشف جسور",           female: "مستكشفة جسورة",         neutral: "مستكشف" },
  noble:     { male: "نبيل من العِلية",       female: "نبيلة من العِلية",       neutral: "نبيل" },
};

// Curated translations for specific persona names. Anything not listed here
// falls back to a generated "{role_ar} من حضارة {category_ar}" name.
const NAME_AR: Record<string, string> = {
  // Pharaoh
  "Queen of the Nile": "ملكة النيل",
  "Queen Consort": "الملكة القرينة",
  "Princess of Thebes": "أميرة طيبة",
  "Desert Pharaoh": "فرعون الصحراء",
  "Boy Pharaoh": "الفرعون الصبي",
  "High Priest of Amun": "كبير كهنة آمون",
  "High Priest of Ra": "كبير كهنة رع",
  "Falconer of Horus": "صقّار حورس",
  "Royal Scribe": "الكاتب الملكي",
  "Royal Physician": "الطبيب الملكي",
  "Court Astronomer": "فلكي البلاط",
  "Court Musician": "موسيقي البلاط",
  "Master Architect": "كبير المعماريين",
  "Master Goldsmith": "كبير الصاغة",
  "Tomb Architect": "مهندس المقابر",
  "Cartouche Carver": "نقّاش الخراطيش",
  "Granary Overseer": "مشرف الأهراء",
  "Embalmer": "المُحَنِّط",
  "Vizier": "الوزير",
  "Pharaoh's General": "قائد جيش الفرعون",
  "Nubian General": "القائد النوبي",
  "Chariot Captain": "قائد العجلات الحربية",
  "Sphinx Guardian": "حارس أبو الهول",
  "Temple Dancer": "راقصة المعبد",
  // Greek
  "Spartan Hoplite": "محارب إسبرطي",
  "Olympic Champion": "بطل أولمبي",
  "Aegean Captain": "قبطان بحر إيجة",
  "Greek Philosopher": "فيلسوف إغريقي",
  "Geometer of Alexandria": "مهندس الإسكندرية",
  "Lyric Poet": "شاعر غنائي",
  "Daughter of Athens": "ابنة أثينا",
  "Priestess of Athena": "كاهنة أثينا",
  // Persian
  "Persian King of Kings": "ملك الملوك الفارسي",
  "Achaemenid Queen": "ملكة الأخمينيين",
  "Satrap of the Provinces": "والي الأقاليم",
  "Nobleman of Shiraz": "نبيل من شيراز",
  "Persian Court Poet": "شاعر البلاط الفارسي",
  "Magi Astronomer": "فلكي المجوس",
  "Veiled Scholar": "العالمة المحجّبة",
  "Cavalry of Cyrus": "فارس قورش",
  "Immortal Guardian": "حارس الخالدين",
  // Samurai
  "Samurai Lord": "سيد الساموراي",
  "Daimyo Lord": "السيد الدايميو",
  "Daimyo of the Mountain": "دايميو الجبل",
  "Lady of the Court": "سيدة البلاط",
  "Onna-Bugeisha": "أونّا بوغيشا (المحاربة)",
  "Ronin Master": "سيد الرونين",
  "Ronin Wanderer": "الرونين الجوّال",
  "Samurai Archer": "رامي الساموراي",
  "Imperial Archer": "الرامي الإمبراطوري",
  "Warrior Monk": "الراهب المحارب",
  "Young Ashigaru": "الأشيغارو الشاب",
  "Tea Master": "سيد الشاي",
  // Viking
  "Old Jarl": "اليارل العجوز",
  "Shieldmaiden": "حاملة الترس",
  "Northern Berserker": "البيرسيركر الشمالي",
  "Axe Champion": "بطل الفأس",
  "Forge Mistress": "سيدة الكير",
  "Blacksmith": "الحدّاد",
  "Boatbuilder": "بنّاء السفن",
  "Dragon-Prow Carver": "نقّاش رؤوس التنانين",
  "Falconer of the North": "صقّار الشمال",
  "Forest Hunter": "صياد الغابات",
  "Forest Tracker": "متعقّب الغابات",
  "Fur Trader": "تاجر الفراء",
  "Greenland Explorer": "مستكشف غرينلاند",
};

function arabicNameFor(
  enName: string,
  category: string,
  role: string,
  gender: string,
): string {
  const direct = NAME_AR[enName.trim()];
  if (direct) return direct;
  const cat = CATEGORY_AR[category] ?? category;
  const r = ROLE_AR[role] ?? ROLE_AR.noble;
  const g = gender === "female" ? r.female : gender === "male" ? r.male : r.neutral;
  return `${g} من حضارة ${cat}`;
}

function arabicCategoryFor(category: string): string {
  return CATEGORY_AR[category] ?? category;
}

function arabicDescriptionFor(
  category: string,
  role: string,
  gender: string,
): string {
  const cat = CATEGORY_AR[category] ?? category;
  const r = ROLE_AR[role] ?? ROLE_AR.noble;
  const g = gender === "female" ? r.female : gender === "male" ? r.male : r.neutral;
  const verbs: Record<string, string> = {
    royalty: "يحمل في ملامحه هيبة العرش وحكمة الحكم",
    warrior: "تظهر في عينيه شجاعة الميدان وعزيمة المعركة",
    scholar: "تنبض ملامحه بحكمة الكتب وفضول العقول الكبرى",
    priest: "يشعّ من حضوره وقار المعابد وسكينة المقدّس",
    artist: "يحمل روح الجمال وحسّ الإبداع في كل تفصيلة",
    craftsman: "تشهد يداه على إتقان الحرفة وصبر الصنّاع المهرة",
    explorer: "تتقد في عينيه روح المغامرة وحبّ اكتشاف المجهول",
    noble: "يحمل وقار النبلاء وحضور أصحاب المكانة",
  };
  const verb = verbs[role] ?? verbs.noble;
  return `${g} من حضارة ${cat}. ${verb}، ويجسّد روح عصره وعبق تاريخ أمته.`;
}

// --- Real historical figures library ---
// Each persona is enriched with a real, well-documented historical figure
// matching its civilization + role + gender. We pick deterministically from
// the persona id so the same upload keeps mapping to the same figure.

type Figure = {
  name_en: string;
  name_ar: string;
  bio_en: string; // achievements
  bio_ar: string; // إنجازات
};

// Key shape: `${category}|${role}|${gender}` (gender = male|female|any)
const FIGURES: Record<string, Figure[]> = {
  // ===== Pharaoh =====
  "Pharaoh|royalty|male": [
    { name_en: "Ramesses II", name_ar: "رمسيس الثاني",
      bio_en: "Egypt's longest-reigning pharaoh (1279–1213 BC). He led the famous Battle of Kadesh against the Hittites, signed history's earliest known peace treaty, and built monumental temples at Abu Simbel and the Ramesseum.",
      bio_ar: "أعظم فراعنة مصر وأطولهم حكمًا (1279–1213 ق.م). قاد معركة قادش الشهيرة ضد الحيثيين، ووقّع أول معاهدة سلام معروفة في التاريخ، وشيّد معابد أبو سمبل والرامسيوم الخالدة." },
    { name_en: "Thutmose III", name_ar: "تحتمس الثالث",
      bio_en: "The 'Napoleon of Egypt' (1479–1425 BC). He launched seventeen military campaigns, expanded Egypt's empire from the Euphrates to Nubia, and won the legendary Battle of Megiddo.",
      bio_ar: "نابليون مصر (1479–1425 ق.م). قاد سبع عشرة حملة عسكرية، ووسّع إمبراطورية مصر من الفرات إلى النوبة، وانتصر في معركة مجدو الأسطورية." },
    { name_en: "Khufu", name_ar: "خوفو",
      bio_en: "Pharaoh of the Fourth Dynasty (c. 2589–2566 BC). Builder of the Great Pyramid of Giza — the only surviving Wonder of the Ancient World and a feat of engineering unmatched for millennia.",
      bio_ar: "فرعون الأسرة الرابعة (نحو 2589–2566 ق.م). شيّد الهرم الأكبر بالجيزة، عجيبة الدنيا الوحيدة الباقية، وأعجوبة هندسية لم تُضاهَ لآلاف السنين." },
  ],
  "Pharaoh|royalty|female": [
    { name_en: "Cleopatra VII", name_ar: "كليوباترا السابعة",
      bio_en: "Last active ruler of Ptolemaic Egypt (51–30 BC). A polyglot scholar fluent in nine languages, she allied with Julius Caesar and Mark Antony in a brilliant struggle to keep Egypt independent from Rome.",
      bio_ar: "آخر حاكمة فعلية لمصر البطلمية (51–30 ق.م). عالمة متعددة اللغات أتقنت تسع لغات، وتحالفت مع يوليوس قيصر ومارك أنطونيوس في صراع ذكي للحفاظ على استقلال مصر عن روما." },
    { name_en: "Hatshepsut", name_ar: "حتشبسوت",
      bio_en: "One of Egypt's most successful pharaohs (1479–1458 BC). She launched a peaceful, prosperous era, organized the famous trading expedition to Punt, and built the magnificent temple at Deir el-Bahari.",
      bio_ar: "من أنجح فراعنة مصر (1479–1458 ق.م). أسّست عصرًا من السلام والازدهار، ونظّمت رحلة بلاد بونت التجارية الشهيرة، وشيّدت معبد الدير البحري الرائع." },
    { name_en: "Nefertiti", name_ar: "نفرتيتي",
      bio_en: "Great Royal Wife of Akhenaten (c. 1370–1330 BC). Co-ruler during Egypt's revolutionary monotheistic shift, immortalized by the iconic Berlin bust that became a symbol of timeless beauty.",
      bio_ar: "الزوجة الملكية العظمى للملك إخناتون (نحو 1370–1330 ق.م). حكمت معه خلال ثورة التوحيد الديني، وخلّدها تمثال برلين الأيقوني الذي صار رمزًا للجمال الخالد." },
  ],
  "Pharaoh|warrior|male": [
    { name_en: "Ahmose I", name_ar: "أحمس الأول",
      bio_en: "Founder of the Eighteenth Dynasty (1549–1524 BC). He liberated Egypt from the Hyksos invaders, reunified the country, and launched the New Kingdom — Egypt's golden age of empire.",
      bio_ar: "مؤسس الأسرة الثامنة عشرة (1549–1524 ق.م). حرّر مصر من الغزاة الهكسوس، ووحّد البلاد، وافتتح عصر الدولة الحديثة — العصر الذهبي للإمبراطورية المصرية." },
    { name_en: "Piye", name_ar: "بعنخي (الملك بيا)",
      bio_en: "Nubian king and founder of Egypt's 25th Dynasty (c. 744–714 BC). He conquered all of Egypt, united the Nile Valley under Kushite rule, and revived ancient pyramid building in Nubia.",
      bio_ar: "ملك نوبي ومؤسس الأسرة الخامسة والعشرين في مصر (نحو 744–714 ق.م). فتح مصر بأكملها، ووحّد وادي النيل تحت الحكم الكوشي، وأحيا بناء الأهرامات القديم في النوبة." },
  ],
  "Pharaoh|scholar|male": [
    { name_en: "Imhotep", name_ar: "إمحوتب",
      bio_en: "Polymath of the 27th century BC. Architect of the Step Pyramid of Djoser — the world's first large stone monument — and a pioneering physician later worshipped as a god of medicine.",
      bio_ar: "عبقري متعدد المواهب من القرن السابع والعشرين قبل الميلاد. مهندس هرم زوسر المدرّج، أوّل صرح حجري ضخم في العالم، وطبيب رائد عُبد لاحقًا كإله للطب." },
    { name_en: "Ahmes", name_ar: "أحمس الكاتب",
      bio_en: "Egyptian scribe (c. 1650 BC) who copied the Rhind Mathematical Papyrus — the oldest surviving comprehensive math textbook, covering arithmetic, fractions, geometry, and algebra.",
      bio_ar: "كاتب مصري (نحو 1650 ق.م) نسخ بردية ريند الرياضية، أقدم كتاب رياضيات شامل باقٍ في التاريخ، يغطّي الحساب والكسور والهندسة والجبر." },
  ],
  "Pharaoh|priest|male": [
    { name_en: "Manetho", name_ar: "مانيتون",
      bio_en: "Egyptian priest and historian (3rd century BC). His Aegyptiaca established the dynastic framework that historians still use today to organize 3,000 years of pharaonic history.",
      bio_ar: "كاهن ومؤرخ مصري (القرن الثالث ق.م). كتابه «إيجيبتياكا» أسّس تقسيم الأسرات الذي لا يزال المؤرخون يستخدمونه اليوم لتنظيم ثلاثة آلاف عام من تاريخ الفراعنة." },
  ],
  "Pharaoh|craftsman|male": [
    { name_en: "Senenmut", name_ar: "سنموت",
      bio_en: "Royal architect under Hatshepsut (c. 1470 BC). He designed her revolutionary terraced mortuary temple at Deir el-Bahari, one of the most influential buildings of the ancient world.",
      bio_ar: "المهندس الملكي للملكة حتشبسوت (نحو 1470 ق.م). صمّم معبدها الجنائزي المتدرّج الثوري في الدير البحري، من أعظم المباني المؤثرة في العالم القديم." },
  ],
  "Pharaoh|artist|male": [
    { name_en: "Bek", name_ar: "بك النحّات",
      bio_en: "Chief sculptor under Akhenaten (14th century BC). He pioneered the radical Amarna style — naturalistic, intimate art that broke 1,500 years of rigid Egyptian convention.",
      bio_ar: "كبير النحّاتين في عهد إخناتون (القرن الرابع عشر ق.م). أسّس الأسلوب العمارني الثوري — فنّ طبيعي وحميمي حطّم خمسة عشر قرنًا من القواعد الفنية المصرية الصارمة." },
  ],
  "Pharaoh|artist|female": [
    { name_en: "Merit-Ptah", name_ar: "ميريت بتاح",
      bio_en: "Court physician of the early dynastic period (c. 2700 BC), traditionally cited as the first named woman in the history of medicine and science.",
      bio_ar: "طبيبة البلاط في عصر الأسرات المبكر (نحو 2700 ق.م)، يُذكر تقليديًا أنها أول امرأة معروفة بالاسم في تاريخ الطب والعلوم." },
  ],

  // ===== Greek =====
  "Greek|royalty|male": [
    { name_en: "Alexander the Great", name_ar: "الإسكندر الأكبر",
      bio_en: "King of Macedon (336–323 BC). He created one of history's largest empires by age thirty, stretching from Greece to India, and spread Hellenistic culture across three continents.",
      bio_ar: "ملك مقدونيا (336–323 ق.م). بنى قبل سن الثلاثين واحدة من أكبر إمبراطوريات التاريخ، امتدّت من اليونان إلى الهند، ونشر الثقافة الهلنستية في ثلاث قارات." },
  ],
  "Greek|warrior|male": [
    { name_en: "Leonidas I", name_ar: "ليونيداس الأول",
      bio_en: "King of Sparta who led 300 Spartans at the Battle of Thermopylae (480 BC), holding back the vast Persian army of Xerxes in one of history's most legendary last stands.",
      bio_ar: "ملك إسبرطة الذي قاد ثلاثمئة من جنوده في معركة ثرموبيلاي (480 ق.م)، فصدّ جيش الفرس الجرّار بقيادة زركسيس في واحدة من أعظم معارك الصمود في التاريخ." },
    { name_en: "Themistocles", name_ar: "ثيميستوكليس",
      bio_en: "Athenian general who built the navy that crushed Persia at Salamis (480 BC), saving Greek civilization and proving the decisive power of sea warfare.",
      bio_ar: "قائد أثيني بنى الأسطول الذي سحق الفرس في معركة سلاميس (480 ق.م)، فأنقذ الحضارة اليونانية وأثبت القوة الحاسمة للحرب البحرية." },
    { name_en: "Milo of Croton", name_ar: "ميلون الكروتوني",
      bio_en: "Six-time Olympic wrestling champion (6th century BC), the most celebrated athlete of antiquity and a student of Pythagoras renowned for legendary feats of strength.",
      bio_ar: "بطل المصارعة الأولمبية ست مرات (القرن السادس ق.م)، أشهر رياضيي العصور القديمة وتلميذ فيثاغورس، اشتُهر بقصص خارقة عن قوّته." },
  ],
  "Greek|scholar|male": [
    { name_en: "Aristotle", name_ar: "أرسطو",
      bio_en: "Philosopher and polymath (384–322 BC). Tutor of Alexander the Great, founder of the Lyceum, and author of foundational works on logic, ethics, biology, and politics that shaped Western thought.",
      bio_ar: "فيلسوف وعالم موسوعي (384–322 ق.م). معلّم الإسكندر الأكبر، ومؤسس مدرسة الليسيوم، وكاتب مؤلفات رائدة في المنطق والأخلاق والأحياء والسياسة شكّلت الفكر الغربي." },
    { name_en: "Archimedes", name_ar: "أرخميدس",
      bio_en: "Mathematician and engineer of Syracuse (287–212 BC). He calculated π with stunning accuracy, founded hydrostatics with his 'Eureka!' moment, and invented war machines that defended his city.",
      bio_ar: "عالم رياضيات ومهندس من سيراقوسة (287–212 ق.م). حسب قيمة π بدقة مذهلة، وأسّس علم الموائع بصرخته الشهيرة «وجدتها!»، واخترع آلات حربية دافعت عن مدينته." },
    { name_en: "Euclid", name_ar: "إقليدس",
      bio_en: "Mathematician of Alexandria (c. 300 BC). His 'Elements' organized geometry into a rigorous deductive system and remained the world's main mathematics textbook for over 2,000 years.",
      bio_ar: "عالم الرياضيات من الإسكندرية (نحو 300 ق.م). نظّم كتابه «العناصر» الهندسة في منظومة استنتاجية صارمة، وظلّ المرجع الرئيسي للرياضيات في العالم لأكثر من ألفي عام." },
  ],
  "Greek|scholar|female": [
    { name_en: "Hypatia of Alexandria", name_ar: "هيباتيا السكندرية",
      bio_en: "Mathematician, astronomer, and Neoplatonist philosopher (c. 360–415 AD). Head of the Platonic school of Alexandria and a celebrated teacher whose lectures drew students from across the Mediterranean.",
      bio_ar: "عالمة رياضيات وفلكية وفيلسوفة أفلاطونية محدثة (نحو 360–415 م). رأست المدرسة الأفلاطونية في الإسكندرية، ومعلمة شهيرة قصد دروسها طلاب من كل أرجاء البحر المتوسط." },
  ],
  "Greek|priest|female": [
    { name_en: "Pythia of Delphi", name_ar: "بيثيا كاهنة دلفي",
      bio_en: "High priestess of the Oracle of Apollo at Delphi. For nearly a thousand years, kings and generals — from Croesus to Alexander — sought her cryptic prophecies before any major decision.",
      bio_ar: "كبيرة كاهنات معبد أبولو في دلفي. على مدار نحو ألف عام، قصدها الملوك والقادة — من كرويسوس إلى الإسكندر — طلبًا لنبوءاتها الغامضة قبل أي قرار مصيري." },
  ],
  "Greek|artist|male": [
    { name_en: "Homer", name_ar: "هوميروس",
      bio_en: "Legendary poet (c. 8th century BC). Composer of the Iliad and the Odyssey — the foundational epics of Western literature that have shaped storytelling for nearly three thousand years.",
      bio_ar: "الشاعر الأسطوري (نحو القرن الثامن ق.م). ناظم الإلياذة والأوديسة — الملحمتين المؤسستين للأدب الغربي اللتين شكّلتا فنّ السرد لما يقارب ثلاثة آلاف عام." },
  ],

  // ===== Persian =====
  "Persian|royalty|male": [
    { name_en: "Cyrus the Great", name_ar: "كورش الأكبر",
      bio_en: "Founder of the Achaemenid Empire (c. 600–530 BC). He built history's first true world empire, freed the Babylonian Jews, and issued the Cyrus Cylinder — often called the first charter of human rights.",
      bio_ar: "مؤسس الإمبراطورية الأخمينية (نحو 600–530 ق.م). بنى أول إمبراطورية عالمية حقيقية في التاريخ، وحرّر يهود بابل، وأصدر «أسطوانة كورش» التي تُعدّ أوّل ميثاق لحقوق الإنسان." },
    { name_en: "Darius the Great", name_ar: "داريوش الأكبر",
      bio_en: "Achaemenid King of Kings (522–486 BC). He organized the empire into satrapies, built the Royal Road, standardized coinage, and constructed the magnificent palace complex at Persepolis.",
      bio_ar: "ملك ملوك الأخمينيين (522–486 ق.م). نظّم الإمبراطورية في ولايات (مرزبانيات)، وشقّ الطريق الملكي، ووحّد العملة، وشيّد مجمع برسبوليس الملكي الفخم." },
    { name_en: "Xerxes I", name_ar: "زركسيس الأول",
      bio_en: "Achaemenid emperor (486–465 BC). He led the largest military invasion of Greece in antiquity, completed Persepolis, and reigned over an empire stretching from the Indus to the Aegean.",
      bio_ar: "إمبراطور أخميني (486–465 ق.م). قاد أكبر غزو عسكري لليونان في العصور القديمة، وأكمل بناء برسبوليس، وحكم إمبراطورية امتدّت من نهر السند إلى بحر إيجة." },
  ],
  "Persian|royalty|female": [
    { name_en: "Atossa", name_ar: "أتوسا",
      bio_en: "Achaemenid queen (c. 550–475 BC), daughter of Cyrus the Great and mother of Xerxes. A powerful political figure whose counsel shaped imperial policy for three reigns.",
      bio_ar: "ملكة أخمينية (نحو 550–475 ق.م)، ابنة كورش الأكبر وأمّ زركسيس. شخصية سياسية قوية شكّلت مشورتها سياسة الإمبراطورية في ثلاث فترات حكم متتالية." },
  ],
  "Persian|warrior|male": [
    { name_en: "Mardonius", name_ar: "مردونيوس",
      bio_en: "Persian general and son-in-law of Darius (5th century BC). Commander of the Immortals and the elite force that fought at Thermopylae and Plataea against the united Greek city-states.",
      bio_ar: "قائد فارسي وصهر داريوش (القرن الخامس ق.م). قاد فرقة الخالدين والقوات النخبة التي قاتلت في ثرموبيلاي وبلاتايا ضد دول المدن اليونانية المتحدة." },
  ],
  "Persian|scholar|male": [
    { name_en: "Al-Khwarizmi", name_ar: "الخوارزمي",
      bio_en: "Persian mathematician (c. 780–850 AD). Father of algebra — the word itself comes from his book 'al-jabr' — and the source of the term 'algorithm' from the Latinization of his name.",
      bio_ar: "عالم الرياضيات الفارسي (نحو 780–850 م). أبو الجبر — والكلمة مشتقة من كتابه «الجبر» — وأصل مصطلح «خوارزمية» المأخوذ من تعريب اسمه." },
    { name_en: "Omar Khayyam", name_ar: "عمر الخيّام",
      bio_en: "Persian polymath (1048–1131). Author of the Rubaiyat poems, he also reformed the Persian calendar to a precision rivaling the modern Gregorian one and advanced cubic equation theory.",
      bio_ar: "عالم وفيلسوف فارسي (1048–1131). صاحب «الرباعيات» الشعرية، أصلح التقويم الفارسي بدقة تنافس التقويم الميلادي الحديث، وطوّر نظرية المعادلات التكعيبية." },
  ],
  "Persian|scholar|female": [
    { name_en: "Mahsati Ganjavi", name_ar: "مهستي الكنجوية",
      bio_en: "Persian poet of the 12th century. The earliest known female master of the rubaiyat quatrain, celebrated for her bold, witty verses on love, life, and craftsmanship.",
      bio_ar: "شاعرة فارسية من القرن الثاني عشر. أوّل من برعت من النساء في نظم الرباعيات، اشتُهرت بأبياتها الجريئة الذكية في الحب والحياة والحرف." },
  ],
  "Persian|artist|male": [
    { name_en: "Hafez of Shiraz", name_ar: "حافظ الشيرازي",
      bio_en: "Persian lyric poet (c. 1325–1390). His Divan of ghazals is considered the pinnacle of Persian literature, beloved by readers from Tehran to Weimar — Goethe himself called him a master.",
      bio_ar: "شاعر فارسي غنائي (نحو 1325–1390). يُعدّ ديوانه من الغزليات قمّة الأدب الفارسي، أحبّه القراء من طهران إلى فايمار، ووصفه غوته نفسه بالشاعر العظيم." },
  ],

  // ===== Samurai =====
  "Samurai|royalty|male": [
    { name_en: "Tokugawa Ieyasu", name_ar: "توكوغاوا إياسو",
      bio_en: "Founder of the Tokugawa shogunate (1543–1616). After winning the decisive Battle of Sekigahara, he unified Japan and ushered in 250 years of peace under the Edo period.",
      bio_ar: "مؤسس شوغونية توكوغاوا (1543–1616). بعد انتصاره الحاسم في معركة سيكيغاهارا، وحّد اليابان وافتتح عصر إيدو الذي دام مئتين وخمسين عامًا من السلام." },
    { name_en: "Oda Nobunaga", name_ar: "أودا نوبوناغا",
      bio_en: "Daimyo and 'Great Unifier' of Japan (1534–1582). He pioneered firearm tactics, broke the power of the warrior monks, and laid the foundation for Japan's eventual unification.",
      bio_ar: "دايميو و«الموحّد الأعظم» لليابان (1534–1582). ابتكر تكتيكات الأسلحة النارية، وكسر نفوذ الرهبان المحاربين، ومهّد الطريق لتوحيد اليابان لاحقًا." },
  ],
  "Samurai|royalty|female": [
    { name_en: "Hōjō Masako", name_ar: "هوجو ماساكو",
      bio_en: "The 'Nun Shogun' (1156–1225). Wife of the first Kamakura shogun, she effectively ruled Japan from behind the scenes for decades, shaping the rise of the samurai class.",
      bio_ar: "«الشوغون الراهبة» (1156–1225). زوجة أوّل شوغون من كاماكورا، حكمت اليابان فعليًا من خلف الستار لعقود، وشكّلت صعود طبقة الساموراي." },
  ],
  "Samurai|warrior|male": [
    { name_en: "Miyamoto Musashi", name_ar: "ميامُتو موساشي",
      bio_en: "Legendary swordsman (1584–1645). Undefeated in over sixty duels, he founded the Niten Ichi-ryū two-sword style and authored 'The Book of Five Rings' on strategy and life.",
      bio_ar: "السيّاف الأسطوري (1584–1645). لم يُهزم في أكثر من ستين مبارزة، أسّس مدرسة «نيتن إيتشي ريو» للسيفين، وكتب «كتاب الحلقات الخمس» في الإستراتيجية والحياة." },
    { name_en: "Date Masamune", name_ar: "داته ماسامونه",
      bio_en: "One-eyed daimyo and master strategist (1567–1636). Founder of modern Sendai, patron of the arts, and one of Japan's most ambitious and respected warlords.",
      bio_ar: "دايميو الأعور وسيد الإستراتيجية (1567–1636). مؤسس مدينة سينداي الحديثة، وراعٍ للفنون، وأحد أكثر قادة الحرب اليابانيين طموحًا واحترامًا." },
    { name_en: "Saigō Takamori", name_ar: "سايغو تاكاموري",
      bio_en: "The 'Last True Samurai' (1828–1877). A leader of the Meiji Restoration who later led the Satsuma Rebellion in defense of the dying samurai code.",
      bio_ar: "«آخر الساموراي الحقيقيين» (1828–1877). من قادة استعادة ميجي، ثم قاد لاحقًا تمرّد ساتسوما دفاعًا عن قانون الساموراي في أيامه الأخيرة." },
  ],
  "Samurai|warrior|female": [
    { name_en: "Tomoe Gozen", name_ar: "تومويه غوزن",
      bio_en: "Onna-musha of the late 12th century. A peerless mounted archer and swordswoman who fought at the head of armies in the Genpei War and became Japan's archetypal warrior woman.",
      bio_ar: "محاربة من نوع «أونّا موشا» في أواخر القرن الثاني عشر. فارسة ورامية لا تُجارى، قادت الجيوش في حرب غنبي، وصارت النموذج الأيقوني للمرأة المحاربة في اليابان." },
    { name_en: "Nakano Takeko", name_ar: "ناكانو تاكيكو",
      bio_en: "Onna-bugeisha (1847–1868). Leader of an all-female warrior unit at the Battle of Aizu, she fought with a naginata to defend her clan and became a national symbol of courage.",
      bio_ar: "محاربة من «أونّا بوغيشا» (1847–1868). قادت وحدة نسائية كاملة في معركة أيزو، وقاتلت بسلاح الناغيناتا دفاعًا عن عشيرتها، وصارت رمزًا وطنيًا للشجاعة." },
  ],
  "Samurai|artist|male": [
    { name_en: "Sen no Rikyū", name_ar: "سن نو ريكيو",
      bio_en: "Tea master (1522–1591). The most influential figure in the Japanese tea ceremony, he refined the wabi-sabi aesthetic that still defines Japanese art and design today.",
      bio_ar: "أستاذ الشاي (1522–1591). أكثر الشخصيات تأثيرًا في حفل الشاي الياباني، صقل جماليات «وابي سابي» التي لا تزال تحدّد روح الفن والتصميم الياباني حتى اليوم." },
  ],

  // ===== Viking =====
  "Viking|royalty|male": [
    { name_en: "Ragnar Lothbrok", name_ar: "راغنار لوثبروك",
      bio_en: "Legendary Norse king and raider (9th century). Famed in Old Norse sagas for his daring raids on Paris and Northumbria and as the father of a dynasty of warrior sons.",
      bio_ar: "ملك نرويجي أسطوري ومُغير (القرن التاسع). اشتُهر في الملاحم النوردية القديمة بغاراته الجريئة على باريس ونورثمبريا، وبكونه أبًا لسلالة من الأبناء المحاربين." },
    { name_en: "Harald Hardrada", name_ar: "هارالد هاردرادا",
      bio_en: "King of Norway (1015–1066). 'The Last Great Viking' — he served the Byzantine Varangian Guard, ruled Norway for two decades, and died invading England at Stamford Bridge.",
      bio_ar: "ملك النرويج (1015–1066). «آخر الفايكنج العظماء» — خدم في الحرس الفارانجي البيزنطي، وحكم النرويج لعقدين، وقُتل وهو يغزو إنجلترا في معركة جسر ستامفورد." },
  ],
  "Viking|warrior|male": [
    { name_en: "Ivar the Boneless", name_ar: "إيفار العظمي (إيفار اللاعظم)",
      bio_en: "Viking warlord (9th century). Leader of the Great Heathen Army that conquered the Anglo-Saxon kingdoms of Northumbria, East Anglia, and Mercia, reshaping the map of England.",
      bio_ar: "أمير حرب فايكنغي (القرن التاسع). قاد «الجيش الوثني العظيم» الذي فتح ممالك الأنغلوسكسون في نورثمبريا وإيست أنغليا وميرسيا، وأعاد رسم خريطة إنجلترا." },
    { name_en: "Egil Skallagrímsson", name_ar: "إيغيل سكالاغريمسون",
      bio_en: "Icelandic warrior-poet (c. 904–995). One of the greatest skalds, he composed brilliant verse and fought across Scandinavia and the British Isles in equal measure.",
      bio_ar: "محارب وشاعر آيسلندي (نحو 904–995). من أعظم شعراء «السكالد»، نظم أبياتًا بديعة وقاتل في أنحاء إسكندنافيا والجزر البريطانية بالقدر نفسه." },
  ],
  "Viking|warrior|female": [
    { name_en: "Lagertha", name_ar: "لاغيرثا",
      bio_en: "Legendary shieldmaiden of Norway (9th century). Recorded by historian Saxo Grammaticus as a fierce warrior who fought at her husband Ragnar's side and ruled in her own right.",
      bio_ar: "محاربة الترس الأسطورية من النرويج (القرن التاسع). دوّن المؤرخ ساكسو غراماتيكوس أنها محاربة شرسة قاتلت إلى جانب زوجها راغنار، وحكمت بنفسها أيضًا." },
    { name_en: "Freydís Eiríksdóttir", name_ar: "فريديس إيريكسدوتير",
      bio_en: "Norse explorer (c. 970–?). Daughter of Erik the Red and one of the first European women to set foot in North America (Vinland), centuries before Columbus.",
      bio_ar: "مستكشفة نوردية (نحو 970–؟). ابنة إيريك الأحمر، وإحدى أوائل النساء الأوروبيات اللواتي وطئن أقدامهن أمريكا الشمالية (فينلاند)، قبل كولومبوس بقرون." },
  ],
  "Viking|explorer|male": [
    { name_en: "Leif Erikson", name_ar: "ليف إيركسون",
      bio_en: "Norse explorer (c. 970–1020). The first European to reach North America, landing in Vinland (Newfoundland) around 1000 AD — almost five centuries before Columbus.",
      bio_ar: "مستكشف نوردي (نحو 970–1020). أوّل أوروبي يصل إلى أمريكا الشمالية، إذ نزل في «فينلاند» (نيوفاوندلاند) نحو عام 1000 م — قبل كولومبوس بنحو خمسة قرون." },
    { name_en: "Erik the Red", name_ar: "إيريك الأحمر",
      bio_en: "Norse explorer (c. 950–1003). Founder of the first European settlement in Greenland and father of Leif Erikson, he opened the Norse age of Atlantic exploration.",
      bio_ar: "مستكشف نوردي (نحو 950–1003). مؤسس أول مستوطنة أوروبية في غرينلاند، ووالد ليف إيركسون، افتتح عصر الفايكنج لاستكشاف الأطلسي." },
  ],
  "Viking|priest|female": [
    { name_en: "Þorbjörg Lítilvölva", name_ar: "ثوربيورغ الفولفا",
      bio_en: "Norse seeress described in the Saga of Erik the Red (c. 1000 AD). A revered völva whose seiðr rituals foretold the fate of Greenland's Norse settlers.",
      bio_ar: "عرّافة نوردية ورد ذكرها في «ملحمة إيريك الأحمر» (نحو عام 1000 م). فولفا موقّرة، تنبّأت طقوسها الـ«سيدر» بمصير المستوطنين النورديين في غرينلاند." },
  ],
  "Viking|craftsman|male": [
    { name_en: "Wayland the Smith", name_ar: "وايلاند الحدّاد",
      bio_en: "Legendary master smith of Germanic and Norse mythology. His fame as a maker of magical swords and armor spread from Scandinavia to Anglo-Saxon England.",
      bio_ar: "الحدّاد الأسطوري في الأساطير الجرمانية والنوردية. اشتُهر بصناعة السيوف والدروع السحرية، وامتدّت شهرته من إسكندنافيا إلى إنجلترا الأنغلوسكسونية." },
  ],
  "Viking|craftsman|female": [
    { name_en: "Aud the Deep-Minded", name_ar: "آود العميقة الفكر",
      bio_en: "Norse settler and matriarch (9th century). She led her household across the seas to settle Iceland, becoming one of the founding figures of the Icelandic Commonwealth.",
      bio_ar: "مستوطنة نوردية وأمّ كبيرة (القرن التاسع). قادت أهل بيتها عبر البحار لتستوطن آيسلندا، وصارت من الشخصيات المؤسِّسة للكومنولث الآيسلندي." },
  ],
  "Viking|artist|male": [
    { name_en: "Snorri Sturluson", name_ar: "سنوري ستورلوسون",
      bio_en: "Icelandic skald and historian (1179–1241). Author of the Prose Edda and Heimskringla — the indispensable sources for everything we know about Norse mythology and kings.",
      bio_ar: "شاعر «سكالد» ومؤرخ آيسلندي (1179–1241). صاحب «الإيدا النثرية» و«هايمسكرنغلا»، المصدران اللذان لا غنى عنهما لكل ما نعرفه عن الأساطير النوردية وملوكها." },
  ],
};

// FNV-1a hash on persona id → deterministic but varied figure pick.
function pickFigure(personaId: string, key: string): Figure | null {
  const list = FIGURES[key];
  if (!list || list.length === 0) return null;
  let h = 2166136261;
  for (let i = 0; i < personaId.length; i++) {
    h ^= personaId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % list.length;
  return list[idx];
}

function figureFor(
  personaId: string,
  category: string,
  role: string,
  gender: string,
): Figure | null {
  const g = gender === "male" || gender === "female" ? gender : "any";
  // Try exact gender first, then opposite gender, then 'any', then role-only fallback.
  const candidates = [
    `${category}|${role}|${g}`,
    `${category}|${role}|any`,
    g === "male" ? `${category}|${role}|female` : g === "female" ? `${category}|${role}|male` : "",
  ].filter(Boolean);
  for (const k of candidates) {
    const fig = pickFigure(personaId, k);
    if (fig) return fig;
  }
  return null;
}

// In-memory rate limit (per IP). Resets when the function instance recycles.
// This is best-effort only — for production, back this with Redis/DB.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (entry.count >= RATE_LIMIT_MAX) return { allowed: false, remaining: 0 };
  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + ":persona-salt-v1");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface LuxandMatch {
  name?: string;
  uuid?: string;
  probability?: number;
}

// We enrolled each persona with name = "<Persona Name> [<persona uuid>]"
// so we can recover the persona row id from the search result.
function extractPersonaId(name?: string): string | null {
  if (!name) return null;
  const m = name.match(/\[([0-9a-f-]{36})\]\s*$/i);
  return m ? m[1] : null;
}

// Build localized name/category/description, enriched with a real
// historical figure when one matches the persona's category + role + gender.
function buildLocalized(
  p: {
    id: string;
    name: string;
    category: string;
    description: string;
    gender?: string | null;
    role?: string | null;
  },
  lang: "en" | "ar",
): {
  name: string;
  category: string;
  description: string;
  figure: { name: string; bio: string } | null;
} {
  const role = p.role ?? "noble";
  const gender = p.gender ?? "any";
  const figure = figureFor(p.id, p.category, role, gender);

  const archetypeName = lang === "ar"
    ? arabicNameFor(p.name, p.category, role, gender)
    : p.name;
  const localCategory = lang === "ar" ? arabicCategoryFor(p.category) : p.category;
  const archetypeDesc = lang === "ar"
    ? arabicDescriptionFor(p.category, role, gender)
    : p.description;

  if (!figure) {
    return {
      name: archetypeName,
      category: localCategory,
      description: archetypeDesc,
      figure: null,
    };
  }

  const figName = lang === "ar" ? figure.name_ar : figure.name_en;
  const figBio = lang === "ar" ? figure.bio_ar : figure.bio_en;
  const intro = lang === "ar"
    ? `تشبه ملامحك ${figName} — ${archetypeName}.`
    : `Your features echo ${figName} — the ${archetypeName}.`;
  const achievementsLabel = lang === "ar" ? "أبرز إنجازاتها/إنجازاته" : "Notable achievements";

  return {
    name: lang === "ar" ? `${figName} — ${archetypeName}` : `${figName} — ${archetypeName}`,
    category: localCategory,
    description: `${intro}\n\n${achievementsLabel}: ${figBio}`,
    figure: { name: figName, bio: figBio },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Debug mode: enabled via ?debug=1 query param or `debug` form field.
  // When on, the response includes a `_debug` block with Luxand status,
  // timing breakdown, and whether photo stream re-materialization succeeded.
  const debugUrl = (() => {
    try {
      const u = new URL(req.url);
      const v = u.searchParams.get("debug");
      return v === "1" || v === "true";
    } catch {
      return false;
    }
  })();
  const t0 = performance.now();
  const debug: {
    enabled: boolean;
    timings_ms: Record<string, number>;
    luxand: {
      status: number | null;
      ok: boolean | null;
      match_count: number | null;
      network_error: string | null;
      parse_ok: boolean | null;
    };
    stream: {
      photo_size: number | null;
      photo_type: string | null;
      buffer_bytes: number | null;
      rematerialized: boolean;
      error: string | null;
    };
    rate_limit_remaining: number;
    fallback_used: string | null;
  } = {
    enabled: false, // set true once we confirm the form field too
    timings_ms: {},
    luxand: { status: null, ok: null, match_count: null, network_error: null, parse_ok: null },
    stream: { photo_size: null, photo_type: null, buffer_bytes: null, rematerialized: false, error: null },
    rate_limit_remaining: 0,
    fallback_used: null,
  };
  const mark = (label: string) => {
    debug.timings_ms[label] = Math.round(performance.now() - t0);
  };

  // Optional API key gate
  const requiredApiKey = Deno.env.get("ANALYZE_API_KEY");
  if (requiredApiKey && req.headers.get("x-api-key") !== requiredApiKey) {
    return jsonResponse({ error: "Invalid API key" }, 401);
  }

  // Rate limit
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return jsonResponse({ error: "Rate limit exceeded. Try again in a minute." }, 429);
  }
  debug.rate_limit_remaining = rl.remaining;

  const luxandToken = Deno.env.get("LUXAND_API_TOKEN");
  if (!luxandToken) {
    return jsonResponse({ error: "Face recognition service not configured" }, 500);
  }

  // Parse multipart upload
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "Invalid multipart/form-data body" }, 400);
  }
  mark("parse_form");

  const debugForm = (formData.get("debug") ?? "").toString().toLowerCase();
  const debugEnabled = debugUrl || debugForm === "1" || debugForm === "true";
  debug.enabled = debugEnabled;

  const photo = formData.get("photo");
  if (!(photo instanceof File)) {
    return jsonResponse({ error: "Missing 'photo' file field" }, 400);
  }
  const nationalityCode = (formData.get("nationality") ?? "").toString().toUpperCase();
  const gender = (formData.get("gender") ?? "").toString().toLowerCase();
  const roleFilter = (formData.get("role") ?? "").toString().toLowerCase().trim();
  const dobRaw = (formData.get("date_of_birth") ?? "").toString();
  const langRaw = (formData.get("lang") ?? "en").toString().toLowerCase();
  const lang: "en" | "ar" = langRaw === "ar" ? "ar" : "en";
  const dob = dobRaw ? new Date(dobRaw) : null;
  const zodiac = dob && !isNaN(dob.getTime()) ? getZodiac(dob) : null;
  const traitLine = zodiac ? personalityLine(zodiac, lang) : "";

  if (!ALLOWED_TYPES.has(photo.type)) {
    return jsonResponse(
      { error: `Unsupported file type: ${photo.type}. Use JPG, PNG, or WEBP.` },
      400,
    );
  }
  if (photo.size > MAX_BYTES) {
    return jsonResponse(
      { error: `File too large (${Math.round(photo.size / 1024)} KB). Max 8 MB.` },
      400,
    );
  }
  if (photo.size < 1024) {
    return jsonResponse({ error: "File too small to contain a face" }, 400);
  }
  debug.stream.photo_size = photo.size;
  debug.stream.photo_type = photo.type;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve eligible civilization categories from nationality.
  // If unmapped, all categories are eligible.
  let eligibleCategories: string[] | null = null;
  if (nationalityCode) {
    const { data: natRow } = await supabase
      .from("nationality_categories")
      .select("categories")
      .eq("nationality_code", nationalityCode)
      .maybeSingle();
    if (natRow?.categories?.length) eligibleCategories = natRow.categories;
  }

  // Gender filter: allow personas matching user gender OR 'any'.
  const allowedGenders = gender === "male" || gender === "female"
    ? [gender, "any"]
    : ["male", "female", "any"];

  function personaPasses(p: { gender?: string | null; category: string; role?: string | null }) {
    if (!allowedGenders.includes(p.gender ?? "any")) return false;
    if (eligibleCategories && !eligibleCategories.includes(p.category)) return false;
    if (roleFilter && (p.role ?? "") !== roleFilter) return false;
    return true;
  }

  const ipHash = await hashIp(ip);

  // Free-tier hook: count how many successful queries this IP has had in 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: priorQueryCount } = await supabase
    .from("query_logs")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("success", true)
    .gte("created_at", since);
  const requiresAd = (priorQueryCount ?? 0) >= 1;

  // Call Luxand /photo/search restricted to our personas collection
  // IMPORTANT: re-materialize the photo into a fresh Blob backed by an
  // ArrayBuffer. The File we get out of req.formData() is sometimes a
  // single-use stream — passing it directly into another FormData triggers
  // "error reading a body from connection" when fetch tries to serialize it.
  let photoBlob: Blob;
  try {
    const photoBuffer = await photo.arrayBuffer();
    photoBlob = new Blob([photoBuffer], { type: photo.type });
    debug.stream.buffer_bytes = photoBuffer.byteLength;
    debug.stream.rematerialized = true;
  } catch (err) {
    debug.stream.error = err instanceof Error ? err.message : String(err);
    console.error("Photo re-materialization failed:", err);
    return jsonResponse(
      debugEnabled
        ? { error: "Failed to read uploaded photo", _debug: debug }
        : { error: "Failed to read uploaded photo" },
      400,
    );
  }
  const luxandForm = new FormData();
  luxandForm.append("photo", photoBlob, photo.name || "upload.jpg");
  luxandForm.append("collections", COLLECTION);
  mark("photo_buffered");

  let luxandResp: Response;
  const luxandStart = performance.now();
  try {
    luxandResp = await fetch(`${LUXAND_BASE}/photo/search`, {
      method: "POST",
      headers: { token: luxandToken },
      body: luxandForm,
    });
  } catch (err) {
    console.error("Luxand network error:", err);
    debug.luxand.network_error = err instanceof Error ? err.message : String(err);
    debug.timings_ms.luxand = Math.round(performance.now() - luxandStart);
    await supabase.from("query_logs").insert({
      ip_hash: ipHash,
      success: false,
      error_code: "luxand_network",
    });
    return jsonResponse(
      debugEnabled
        ? { error: "Face recognition service unavailable", _debug: debug }
        : { error: "Face recognition service unavailable" },
      502,
    );
  }
  debug.timings_ms.luxand = Math.round(performance.now() - luxandStart);
  debug.luxand.status = luxandResp.status;
  debug.luxand.ok = luxandResp.ok;

  let rawText = "";
  let luxandData: unknown;
  try {
    rawText = await luxandResp.text();
  } catch (err) {
    console.error("Luxand response read error:", err);
    debug.luxand.network_error = err instanceof Error ? err.message : String(err);
    debug.luxand.parse_ok = false;
    luxandData = { message: "Unreadable response from face recognition service" };
  }

  if (rawText) {
    try {
      luxandData = JSON.parse(rawText);
      debug.luxand.parse_ok = true;
    } catch {
      luxandData = rawText;
      debug.luxand.parse_ok = false;
    }
  }

  if (!luxandResp.ok) {
    console.error("Luxand error:", luxandResp.status, luxandData);
    await supabase.from("query_logs").insert({
      ip_hash: ipHash,
      success: false,
      error_code: `luxand_${luxandResp.status}`,
    });
    // For 5xx (Luxand outage / no-face errors), gracefully fall back to a
    // random eligible persona so the user still gets a result.
    // For 4xx client errors (e.g. malformed image), surface the message.
    if (!(luxandResp.status >= 500 || luxandResp.status === 400)) {
      const message =
        typeof luxandData === "object" && luxandData && "message" in luxandData
          ? (luxandData as { message: string }).message
          : "Face recognition failed";
      return jsonResponse({ error: message }, 422);
    }
    // else: fall through with luxandData possibly non-array — matches stays []
  }

  // Luxand returns an array of matches (sorted by probability desc).
  // Possible "no face" / "no match" responses come back as { status: "failure", ... }
  let matches: LuxandMatch[] = [];
  if (Array.isArray(luxandData)) {
    matches = luxandData as LuxandMatch[];
  } else if (
    typeof luxandData === "object" &&
    luxandData &&
    "matches" in luxandData &&
    Array.isArray((luxandData as { matches: unknown }).matches)
  ) {
    matches = (luxandData as { matches: LuxandMatch[] }).matches;
  }

  if (matches.length === 0) {
    debug.luxand.match_count = 0;
    debug.fallback_used = "random_no_matches";
    // Fallback: no resemblance found — pick a random persona so the user always gets a result.
    const { data: allPersonas } = await supabase
      .from("personas")
      .select("id, name, category, description, image_url, gender, role");
    const pool = (allPersonas ?? []).filter(personaPasses);
    const finalPool = pool.length > 0 ? pool : (allPersonas ?? []);
    if (finalPool.length === 0) {
      return jsonResponse({ error: "No personas available" }, 500);
    }
    const random = finalPool[Math.floor(Math.random() * finalPool.length)];
    const fallbackSimilarity = Math.floor(Math.random() * 16) + 60; // 60–75%
    await supabase.from("query_logs").insert({
      ip_hash: ipHash,
      matched_persona_id: random.id,
      similarity: fallbackSimilarity,
      success: true,
      error_code: "fallback_random",
    });
    mark("total");
    const loc = buildLocalized(random, lang);
    return jsonResponse({
      match_name: loc.name,
      category: loc.category,
      similarity: fallbackSimilarity,
      image_url: random.image_url,
      description: traitLine ? `${loc.description}\n\n${traitLine}` : loc.description,
      historical_figure: loc.figure,
      runners_up: [],
      requires_ad: requiresAd,
      rate_limit_remaining: rl.remaining,
      ...(debugEnabled ? { _debug: debug } : {}),
    });
  }
  debug.luxand.match_count = matches.length;

  // Sort by probability desc just to be safe
  matches.sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
  // Pull a wider slice so we have candidates left after gender/nationality filtering.
  const candidateMatches = matches.slice(0, 20);
  const candidateIds = candidateMatches
    .map((m) => extractPersonaId(m.name))
    .filter((x): x is string => Boolean(x));

  const { data: personas } = await supabase
    .from("personas")
    .select("id, name, category, description, image_url, gender, role")
    .in("id", candidateIds);

  const personaById = new Map((personas ?? []).map((p) => [p.id, p]));

  // Build ranked results with a tiered fallback so we ALWAYS try to return 3:
  //   tier 1: gender + nationality match
  //   tier 2: gender match only (drop nationality)
  //   tier 3: any persona (drop both filters)
  // Within each tier we walk Luxand matches in order (preserving similarity).
  // If Luxand still doesn't yield 3 after all tiers, we top up with random personas
  // from the most-restrictive non-empty pool.
  type Ranked = {
    match_name: string;
    category: string;
    similarity: number;
    image_url: string;
    description: string;
    persona_id: string;
  };

  const TARGET = 3;
  const ranked: Ranked[] = [];
  const usedIds = new Set<string>();

  function pushFromMatches(
    predicate: (p: {
      gender?: string | null;
      category: string;
      role?: string | null;
    }) => boolean,
  ) {
    for (const m of candidateMatches) {
      if (ranked.length >= TARGET) return;
      const pid = extractPersonaId(m.name);
      if (!pid || usedIds.has(pid)) continue;
      const persona = personaById.get(pid);
      if (!persona || !predicate(persona)) continue;
      const localName = lang === "ar"
        ? arabicNameFor(persona.name, persona.category, persona.role ?? "noble", persona.gender ?? "any")
        : persona.name;
      const localCategory = lang === "ar" ? arabicCategoryFor(persona.category) : persona.category;
      const localDesc = lang === "ar"
        ? arabicDescriptionFor(persona.category, persona.role ?? "noble", persona.gender ?? "any")
        : persona.description;
      ranked.push({
        match_name: localName,
        category: localCategory,
        similarity: Math.round((m.probability ?? 0) * 100),
        image_url: persona.image_url,
        description: localDesc,
        persona_id: pid,
      });
      usedIds.add(pid);
    }
  }

  // Tier 1: strict gender + nationality
  pushFromMatches(personaPasses);
  // Tier 2: drop nationality, keep gender + role
  if (ranked.length < TARGET) {
    pushFromMatches(
      (p) =>
        allowedGenders.includes(p.gender ?? "any") &&
        (!roleFilter || (p.role ?? "") === roleFilter),
    );
  }
  // Tier 2.5: gender only (drop role too)
  if (ranked.length < TARGET) {
    pushFromMatches((p) => allowedGenders.includes(p.gender ?? "any"));
  }
  // Tier 3: any persona returned by Luxand
  if (ranked.length < TARGET) {
    pushFromMatches(() => true);
  }

  // Top-up from the database if Luxand didn't supply enough usable matches.
  if (ranked.length < TARGET) {
    const { data: allPersonas } = await supabase
      .from("personas")
      .select("id, name, category, description, image_url, gender, role");
    const all = allPersonas ?? [];
    const tieredPools = [
      all.filter(personaPasses),
      all.filter(
        (p) =>
          allowedGenders.includes(p.gender ?? "any") &&
          (!roleFilter || (p.role ?? "") === roleFilter),
      ),
      all.filter((p) => allowedGenders.includes(p.gender ?? "any")),
      all,
    ];
    for (const pool of tieredPools) {
      if (ranked.length >= TARGET) break;
      const shuffled = pool
        .filter((p) => !usedIds.has(p.id))
        .sort(() => Math.random() - 0.5);
      for (const p of shuffled) {
        if (ranked.length >= TARGET) break;
        const localName = lang === "ar"
          ? arabicNameFor(p.name, p.category, p.role ?? "noble", p.gender ?? "any")
          : p.name;
        const localCategory = lang === "ar" ? arabicCategoryFor(p.category) : p.category;
        const localDesc = lang === "ar"
          ? arabicDescriptionFor(p.category, p.role ?? "noble", p.gender ?? "any")
          : p.description;
        ranked.push({
          match_name: localName,
          category: localCategory,
          similarity: Math.floor(Math.random() * 16) + 60, // 60–75% filler
          image_url: p.image_url,
          description: localDesc,
          persona_id: p.id,
        });
        usedIds.add(p.id);
      }
    }
  }

  if (ranked.length === 0) {
    return jsonResponse(
      { error: "Match found but persona record missing. Try again." },
      500,
    );
  }

  const top = ranked[0];
  // Append zodiac-derived personality line to the top result's description.
  if (traitLine) {
    top.description = `${top.description}\n\n${traitLine}`;
  }
  const topPid = top.persona_id;
  await supabase.from("query_logs").insert({
    ip_hash: ipHash,
    matched_persona_id: topPid ?? null,
    similarity: top.similarity,
    success: true,
  });

  // Strip internal persona_id from the response payload.
  const stripId = ({ persona_id: _pid, ...rest }: Ranked) => rest;

  if (ranked.length < TARGET || ranked.some((r) => r.similarity <= 75 && r.similarity >= 60)) {
    // Heuristic: if any rows came from the DB top-up, mark fallback.
    debug.fallback_used = debug.fallback_used ?? "tiered_topup";
  }
  mark("total");

  return jsonResponse({
    ...stripId(top),
    runners_up: ranked.slice(1).map(stripId),
    requires_ad: requiresAd,
    rate_limit_remaining: rl.remaining,
    ...(debugEnabled ? { _debug: debug } : {}),
  });
});