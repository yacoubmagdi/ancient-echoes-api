// POST /analyze-face — accepts a face descriptor (JSON, 128-float array)
// extracted in the browser by face-api.js, computes Euclidean distance against
// every stored persona descriptor, and returns the top match plus runners-up.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, apikey",
};

const DESCRIPTOR_LEN = 128;

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
  Chinese: "الصينيون",
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
  // Chinese
  "Emperor of the Dragon Throne": "إمبراطور عرش التنين",
  "Son of Heaven": "ابن السماء",
  "Tang Prince": "أمير من سلالة تانغ",
  "Empress of the Inner Court": "إمبراطورة البلاط الداخلي",
  "Tang Princess": "أميرة من سلالة تانغ",
  "General of the Great Wall": "قائد سور الصين العظيم",
  "Three Kingdoms Strategist": "استراتيجي الممالك الثلاث",
  "Shaolin Warrior Monk": "راهب شاولين المحارب",
  "Ming Admiral": "أميرال أسطول مينغ",
  "Lady General of Yang": "السيدة قائدة آل يانغ",
  "Maiden of the Saddle": "فتاة السرج المحاربة",
  "Confucian Scholar": "العالم الكونفوشيوسي",
  "Hanlin Academician": "أكاديمي هانلين",
  "Daoist Sage": "حكيم الطاوية",
  "Astronomer of the Observatory": "فلكي المرصد الإمبراطوري",
  "Lady Historian": "السيدة المؤرّخة",
  "Buddhist Abbot": "كبير رهبان البوذية",
  "Daoist Priest": "كاهن الطاوية",
  "Temple Priestess": "كاهنة المعبد",
  "Tang Dynasty Poet": "شاعر سلالة تانغ",
  "Master Calligrapher": "كبير الخطّاطين",
  "Court Painter": "رسّام البلاط",
  "Lady Poet of the Song": "شاعرة سلالة سونغ",
  "Pipa Musician": "عازفة البيبا",
  "Master Porcelain Maker": "كبير صنّاع الخزف",
  "Imperial Architect": "المعماري الإمبراطوري",
  "Silk Weaver": "حائكة الحرير",
  "Jade Carver": "نقّاش اليشم",
  "Silk Road Caravaneer": "تاجر طريق الحرير",
  "Treasure Fleet Navigator": "ملّاح أسطول الكنوز",
  "Mandarin Official": "الموظف الماندريني",
  "Lady of the Inner Quarters": "سيدة القصور الداخلية",
};

// --- English localization for personas with Arabic DB names ---
// Reverse mapping from Arabic → English for persona names
const NAME_EN: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_AR).map(([en, ar]) => [ar, en])
);

// Extended Arabic→English dictionary for Egyptian names stored in DB
const EGYPTIAN_NAME_EN: Record<string, string> = {
  "آي": "Ay",
  "أبريس": "Apries",
  "أحمس الأول": "Ahmose I",
  "أحمس الثاني": "Amasis II",
  "أحمس سا بير": "Ahmose Sa-Pair",
  "أخناتون": "Akhenaten",
  "أمنحتب الأول": "Amenhotep I",
  "أمنحتب الثالث": "Amenhotep III",
  "أمنحتب ابن حابو": "Amenhotep son of Hapu",
  "أمنمحاب": "Amenemhab",
  "أمنمؤبى": "Amenemope",
  "أمنمحات الثاني": "Amenemhat II",
  "أمنمحات الخامس": "Amenemhat V",
  "أمنمحات الرابع": "Amenemhat IV",
  "أمنمحات السابع": "Amenemhat VII",
  "أمنمحات السادس": "Amenemhat VI",
  "أمنمسي": "Amenmesse",
  "أمنيرديس الأولى": "Amenirdis I",
  "أمون رود": "Nepherites I",
  "أمير تايوس": "Amyrtaeus",
  "أنخ ماحور": "Ankhmahor",
  "أني الكاتب": "Ani the Scribe",
  "أوناس": "Unas",
  "إميماس": "Imimaes",
  "إنتف الأول": "Intef I",
  "إنتف الثاني": "Intef II",
  "إنتف الثالث": "Intef III",
  "إنحر خاوي المعمار": "Inherkhau",
  "إنني": "Ineni",
  "إياح موس": "Ahmose (Queen)",
  "إيبوت الأولى": "Iput I",
  "إيحي نفر": "Ihy-nefer",
  "إيدوت الأميرة": "Princess Idut",
  "إيرت حور رو القاضي": "Irt-Hor-Ru the Judge",
  "إيست الملكة": "Queen Iset",
  "إيست نفرت الثالثة": "Isetnofret III",
  "إيست ويرت": "Isetweret",
  "إيسيس ور رت الملكة": "Queen Isis-Weret",
  "إيمريا": "Iymeria",
  "إيمنتت": "Imentet",
  "إيي نفر": "Iy-nefer",
  "الأمير جحوتي نخت": "Prince Djehutynakht",
  "الأميرة إيست نفرت الثانية": "Princess Isetnofret II",
  "الأميرة ميريت آمن بنت رمسيس": "Princess Meritamen",
  "الأميرة نفرورع": "Princess Neferure",
  "الطبيبة بسشت": "Peseshet the Physician",
  "الطبيبة مريت بتاح": "Merit-Ptah the Physician",
  "الفرعون أمنحتب الثاني": "Pharaoh Amenhotep II",
  "الفرعون حور عحا": "Pharaoh Hor-Aha",
  "القائد أحمس بن إبانا": "Commander Ahmose son of Ebana",
  "الكاتب وسر حات": "Scribe Userhat",
  "الكاهنة حنوت تاوي الرابعة": "Priestess Henuttawy IV",
  "المغنية ميريت": "Meret the Singer",
  "المهندس هميونو": "Architect Hemiunu",
  "النحات مِن": "Sculptor Men",
  "الوزير رخميرع": "Vizier Rekhmire",
  "الوزيرة نبت": "Vizier Nebet",
  "ايبانا": "Ebana",
  "آمون إم حات": "Amenemhat",
  "آمون حتب حوي الثاني": "Amenhotep Huy II",
  "آمون حتب سا حابو": "Amenhotep Sa-Habu",
  "آمون حور المحنط": "Amunhor the Embalmer",
  "آمون مس القائد": "Amenmose the Commander",
  "آمون مس الكاتب": "Amenmose the Scribe",
  "آمون نخت الحرفي": "Amunnakht the Craftsman",
  "أمنحرخبشف": "Amunherkhepeshef",
  "با إن آمون": "Pa-en-Amun",
  "با سر الوزير": "Vizier Paser",
  "با شدو القاضي": "Pa-Shedu the Judge",
  "با نب جدت": "Pa-neb-Djedet",
  "با نب جدت الثاني": "Pa-neb-Djedet II",
  "با-سا-خن": "Pa-Sa-Khen",
  "باشيدو": "Pashedu",
  "باكا عنخ": "Baka-ankh",
  "بانحسي": "Panehesy",
  "باي": "Bay",
  "بتاح حتب": "Ptahhotep",
  "بتاح شبسس": "Ptahshepses",
  "بسماتيك الأول": "Psamtik I",
  "بسماتيك الثالث": "Psamtik III",
  "بسماتيك الثاني": "Psamtik II",
  "بسوسنس الأول": "Psusennes I",
  "بسوسنس الثاني": "Psusennes II",
  "بوكوريس": "Bocchoris",
  "بيبا": "Biba",
  "بيبي الأول": "Pepi I",
  "بيبي الثاني": "Pepi II",
  "بيبي نخت المغامر": "Pepynakht the Adventurer",
  "بيسيس": "Bisis",
  "بينجم الأول": "Pinedjem I",
  "تا أوسرت الكاتبة": "Ta-Useret the Scribe",
  "تا إيم حتب": "Ta-Imhotep",
  "تا إيمحتب": "Taimhotep",
  "تا حنوت": "Ta-Henut",
  "تا حنوت الثانية": "Ta-Henut II",
  "تا خعت المغنية": "Ta-Khaat the Singer",
  "تا ديت إيسيس الكاهنة": "Tadiset the Priestess",
  "تا شريت إن آمون": "Tasherit-en-Amun",
  "تا شريت ويدجات": "Tasherit-Wadjat",
  "تا عات": "Ta-Aat",
  "تا كا حعت": "Ta-Ka-Haat",
  "تا مكت": "Ta-Meket",
  "تا ميرت": "Ta-Merit",
  "تا ميريت إيست": "Ta-Merit-Iset",
  "تا نت آمون الكاهنة": "Ta-net-Amun the Priestess",
  "تا نت إيست": "Ta-net-Iset",
  "تا نت حابي": "Ta-net-Hapi",
  "تا نفرت الحكيمة": "Ta-Neferet the Wise",
  "تا ورت الكاهنة": "Taweret the Priestess",
  "تا ويسرت": "Tawosret",
  "تا ويسرت الملكة": "Queen Tawosret",
  "تاورت إيست": "Taweret-Iset",
  "تاوسرت": "Twosret",
  "تجنوتي": "Djehuty",
  "تحتمس الأول": "Thutmose I",
  "تحتمس الثاني": "Thutmose II",
  "تحتمس الرابع": "Thutmose IV",
  "تف نخت": "Tefnakht",
  "تنت آمون الأميرة": "Princess Tent-Amun",
  "توت عنخ آمون": "Tutankhamun",
  "توت موحا": "Tut-Mokha",
  "تويا": "Tuya",
  "تي مريت نيسوت": "Ti-Merit-Nisut",
  "تيتي": "Tyti",
  "تيتي الأميرة": "Princess Teti",
  "تيتي السادسة": "Teti VI",
  "تيتي شيري": "Tetisheri",
  "تيتي عنخ كاماو": "Teti-ankh-Kamau",
  "تيتي عنخ كمن": "Teti-ankh-Kemen",
  "تيي حوتيب": "Tiye-Hotep",
  "تيي صغيرة": "Younger Lady (Tiye)",
  "ثنوني المهندس": "Djehuty the Engineer",
  "جحوتي حتب الثاني": "Djehutynakht II",
  "جد كارع": "Djedkare",
  "جر": "Djer",
  "حابو سنب": "Hapu-Seneb",
  "حاكور": "Hakor",
  "حتب حرس الثالثة": "Hetepheres III",
  "حتب حرس الرابعة": "Hetepheres IV",
  "حتب سخموي": "Hetepsekhemwy",
  "حتب-حرس الأولى": "Hetepheres I",
  "حتشبسوت مريت رع": "Hatshepsut-Merytre",
  "حرخوف": "Harkhuf",
  "حري حور": "Herihor",
  "حسي رع الحكيم": "Hesire the Wise",
  "حسي نفر النبيل": "Hesy-nefer the Noble",
  "حقا رشو": "Heqareshu",
  "حقا ماعت رع": "Heqamaatre",
  "حقا ناخت": "Heqanakht",
  "حم إيونو": "Hemiunu",
  "حمو عابي": "Hemu-Abi",
  "حنو": "Henu",
  "حنوت إم حب": "Henut-em-Heb",
  "حنوت ان حب": "Henut-an-Heb",
  "حنوت تاوي": "Henuttawy",
  "حنوت تاوي الثالثة": "Henuttawy III",
  "حنوت تاوي الكاهنة": "Priestess Henuttawy",
  "حنوت تمحو": "Henut-Temhu",
  "حنوت حب": "Henut-Heb",
  "حنوت حتب": "Henut-Hotep",
  "حنوت حر نحت": "Henut-Her-Nakht",
  "حنوت سن": "Henutsen",
  "حنوت سن الثانية": "Henutsen II",
  "حنوت سن مس": "Henutsen-Mes",
  "حنوت مرت": "Henut-Merit",
  "حنوت مي رع": "Henut-Mi-Ra",
  "حنوت نخت الثانية": "Henutnakht II",
  "حنوت نخت المربية": "Henutnakht the Nurse",
  "حنوت نفرت": "Henut-Neferet",
  "حنوت وسخت": "Henut-Wesekht",
  "حنوت وي": "Henut-Wy",
  "حنوت ويدجبو": "Henut-Wedjebu",
  "حنوت ويدجو": "Henut-Wedju",
  "حوتشيبسوت الثانية": "Hatshepsut II",
  "حور إم حب الحارس": "Horemheb the Guardian",
  "حور إم حب الكاتب": "Horemheb the Scribe",
  "حور بيسن": "Hor-Bisen",
  "حور عحا الثاني": "Hor-Aha II",
  "حور مس القائد": "Hormose the Commander",
  "حور مين": "Hor-Min",
  "حور نب": "Hor-Neb",
  "حور نفر المحنط": "Hor-Nefer the Embalmer",
  "حور ون نفر": "Hornefer",
  "حور ويا الفلكي": "Hor-Wia the Astronomer",
  "حوري": "Hori",
  "حوري المعمار": "Hori the Architect",
  "حوري سا إيست": "Hori Sa-Iset",
  "حوني": "Huni",
  "حونيفر": "Hunefer",
  "حوي سا نيسوت": "Huy Sa-Nisut",
  "حوي نائب النوبة": "Huy Viceroy of Nubia",
  "خع أمون": "Kha-Amun",
  "خع إم حات النحات": "Khaemhat the Sculptor",
  "خع إم واست": "Khaemwaset",
  "خع بر رع سنب": "Kha-Per-Ra-Seneb",
  "خع سخموي": "Khasekhemwy",
  "خع عنخ رع": "Kha-Ankh-Ra",
  "خفرع": "Khafre",
  "خميرا الأولى": "Khamerernebty I",
  "خميرا الثانية": "Khamerernebty II",
  "خنت كاوس الأولى": "Khentkaus I",
  "خنت كاوس الثالثة": "Khentkaus III",
  "خنت كاوس الثانية": "Khentkaus II",
  "خنسو إم حب المنجم": "Khonsu-em-Heb the Astrologer",
  "خنسو حتب": "Khonsu-Hotep",
  "خنسو مس الكاتب": "Khonsu-Mes the Scribe",
  "خنوم باف": "Khnumbaef",
  "خنوم حتب الأول": "Khnumhotep I",
  "خنوم حتب الثالث": "Khnumhotep III",
  "خنوم حتب الثاني": "Khnumhotep II",
  "خنوم رع": "Khnum-Ra",
  "خنوم نخت": "Khnum-Nakht",
  "خيت": "Khety",
  "خيتي الثالث": "Khety III",
  "خيتي الرابع": "Khety IV",
  "خيتي كاتب": "Khety the Scribe",
  "ددف حور": "Djedefhor",
  "ددف رع": "Djedefre",
  "دن": "Den",
  "رئيس العمال خع": "Foreman Kha",
  "رخمي رع": "Rekhmire",
  "رع حتب": "Rahotep",
  "رع حتب القائد": "Rahotep the Commander",
  "رع حتب النبيل": "Rahotep the Noble",
  "رع خ مع رع عنخ": "Ra-Kh-Maa-Ra-Ankh",
  "رع شبسس النبيل": "Ra-Shepses the Noble",
  "رع مس الثالث": "Ramesses III",
  "رع مس نخت": "Ramesse-Nakht",
  "رع موسى": "Ramose",
  "رع نفر إف": "Ra-Nefer-Ef",
  "رع نفر الطبيبة": "Ra-Nefer the Physician",
  "رع نفر حتب": "Ra-Nefer-Hotep",
  "رع نفرو الطبيبة": "Ra-Neferu the Physician",
  "رع وسر حات": "Ra-User-Hat",
  "رعموسي": "Ramose",
  "رمسيس الأول": "Ramesses I",
  "رمسيس التاسع": "Ramesses IX",
  "رمسيس الثالث": "Ramesses III",
  "رمسيس الحادي عشر": "Ramesses XI",
  "رمسيس الرابع": "Ramesses IV",
  "رمسيس السادس": "Ramesses VI",
  "رنس نب": "Raneb",
  "رنسنب": "Renseneb",
  "سا إيست": "Sa-Iset",
  "سا إيست الثالث": "Sa-Iset III",
  "سا رنبوت الأول": "Sarenput I",
  "سا رنبوت الثالث": "Sarenput III",
  "سا منتو": "Sa-Montu",
  "سا منتو حتب": "Sa-Montu-Hotep",
  "سا واج": "Sa-Wadj",
  "سابني حاكم الفنتين": "Sabni Governor of Elephantine",
  "سات آمون الملكة": "Queen Sat-Amun",
  "سات إيح": "Sat-Iah",
  "سات حتحور": "Sat-Hathor",
  "سات حتحور يونيت": "Sat-Hathor-Yunet",
  "سات رع": "Sat-Ra",
  "سات رع الثانية": "Sat-Ra II",
  "سات ماعت": "Sat-Maat",
  "سات ميرت الأميرة": "Princess Sat-Merit",
  "سات نفرو": "Sat-Sneferu",
  "ساتي حتب": "Sati-Hotep",
  "ساتياح": "Satiah",
  "ساحورع": "Sahure",
  "ساناخت": "Sanakht",
  "سبك إم ساف الثاني": "Sobekemsaf II",
  "سخم رع خو تاوي سوبك حتب": "Sekhemre Khutawy Sobekhotep",
  "سخم كا رع الثاني": "Sekhemkare II",
  "سخم كارع": "Sekhemkare",
  "سخنكاري": "Sekhemkare",
  "سشات حتب": "Seshat-Hotep",
  "سقنن رع تاعا": "Seqenenre Tao",
  "سمنخ كارع": "Smenkhkare",
  "سمندس": "Smendes",
  "سن نجم": "Sennedjem",
  "سن نفر": "Sennefer",
  "سنب القصير": "Seneb the Dwarf",
  "سنب تيسي": "Seneb-Tisi",
  "سنب كاي": "Seneb-Kay",
  "سنب مؤ": "Senebmu",
  "سنفرو": "Sneferu",
  "سنفرو عنخ": "Sneferu-Ankh",
  "سنن نوب": "Senen-Nub",
  "سننجم الحرفي": "Sennedjem the Craftsman",
  "سننموت": "Senenmut",
  "سنوسرت الأول": "Senusret I",
  "سنوسرت الثاني": "Senusret II",
  "سنوسرت الرابع": "Senusret IV",
  "سنوسرت عنخ": "Senusret-Ankh",
  "سنوسرت عنخ القائد": "Commander Senusret-Ankh",
  "سوبك حتب الثاني": "Sobekhotep II",
  "سوبك حتب الرابع": "Sobekhotep IV",
  "سي أمن": "Siamun",
  "سيبتاح": "Siptah",
  "سيت رع الملكة": "Queen Sit-Ra",
  "سيتي الثاني": "Seti II",
  "سينوهي": "Sinuhe",
  "شاباسا": "Shabaka",
  "شيشنق الأول": "Shoshenq I",
  "عا إب شري الكاهنة": "Aa-Ib-Sheri the Priestess",
  "عا حتب الأولى": "Ahhotep I",
  "عاات": "Aat",
  "عحا": "Hor-Aha",
  "عنخ إس إن بيبي": "Ankh-es-en-Pepi",
  "عنخ إسن آمون": "Ankhesenamun",
  "عنخ تيفي": "Ankhtifi",
  "عنخ رن إس نفرت": "Ankh-ren-es-Neferet",
  "عنخ نس إيست": "Ankhnes-Iset",
  "عنخ نس بتاح": "Ankhnes-Ptah",
  "عنخ نس بيبي الثانية": "Ankhnes-Pepi II",
  "عنخ نس رع نفرت": "Ankhnes-Ra-Neferet",
  "عنخ نس مريرع": "Ankhnes-Meryre",
  "عنخ نس نفر إب رع": "Ankhnes-Neferib-Ra",
  "كا إير الوزير": "Vizier Ka-Ir",
  "كا جمني": "Kagemni",
  "كا ماعت": "Ka-Maat",
  "كاموس": "Kamose",
  "كاواب": "Kawab",
  "كاورا": "Kaura",
  "كايمو": "Kaimu",
  "كيا": "Kiya",
  "ماعت حور نفرو رع": "Maat-Hor-Neferu-Ra",
  "ماعت كا رع الأميرة": "Princess Maatkare",
  "ماعت نفرو": "Maat-Neferu",
  "ماعت نفرو رع": "Maat-Neferu-Ra",
  "مر إب أوي النحات": "Mer-Ib-Awy the Sculptor",
  "مر سي عنخ الثانية": "Meresankh II",
  "مرن بتاح": "Merenptah",
  "مرن رع الأول": "Merenre I",
  "مرنبتاح": "Merneptah",
  "مرنبتاح سبتاح": "Merneptah-Siptah",
  "مرنيث": "Merneith",
  "مري إب رع": "Mery-Ib-Ra",
  "مري بتاح": "Merit-Ptah",
  "مري تم": "Mery-Tem",
  "مري رع الثاني": "Meryre II",
  "مري رع حتبي": "Meryre-Hatpi",
  "مري روكا": "Mereruka",
  "مري سي عنخ الثالثة": "Meresankh III",
  "مري كا رع": "Merykare",
  "مريت أتون": "Meritaten",
  "مريت إيست": "Merit-Iset",
  "مريت رع حتب": "Merit-Ra-Hotep",
  "مريت رع حتشپسوت": "Merytre-Hatshepsut",
  "مريت عنخ الرابعة": "Merit-Ankh IV",
  "مريحور": "Meryhor",
  "مس إيوي الجندي": "Mes-Iwy the Soldier",
  "مس عنخ": "Mes-Ankh",
  "مسن": "Metjen",
  "مكت رع الوزير": "Vizier Meketre",
  "مِن نخت القائد": "Commander Min-Nakht",
  "منتو حتب الثالث": "Mentuhotep III",
  "منتوحتب الثالث": "Mentuhotep III",
  "منتوحتب الثاني": "Mentuhotep II",
  "مُنخ بر رع": "Menkheperre",
  "منكاو حور كايو": "Menkauhor Kaiu",
  "منكاورع": "Menkaure",
  "مننا": "Menna",
  "موت تويا": "Mut-Tuya",
  "موت نجمت": "Mutnedjmet",
  "موكا": "Moka",
  "ميدوم نفر": "Medum-Nefer",
  "ميرس عنخ الأولى": "Meresankh I",
  "ميري تت نس": "Mery-Tet-Nes",
  "ميري تي تي الملكة": "Queen Meritites",
  "ميري رع الأول": "Meryre I",
  "ميريت آمون بنت رمسيس": "Meritamen daughter of Ramesses",
  "ميريت بتاح": "Merit-Ptah",
  "ميريت نيث الثانية": "Meritneith II",
  "ميريرت": "Mereret",
  "مين حتب": "Min-Hotep",
  "مين حتب الحاكم": "Min-Hotep the Governor",
  "مين عنخ الرحالة": "Min-Ankh the Traveler",
  "مين مس القائد": "Min-Mes the Commander",
  "مين موسى": "Min-Mose",
  "مين نخت": "Min-Nakht",
  "مينخاو": "Minkau",
  "ناختمين": "Nakhtmin",
  "نارمر": "Narmer",
  "نايف عاو رود الثاني": "Nayef-Aau-Rud II",
  "نب آمون": "Neb-Amun",
  "نب تاوي الصائغ": "Neb-Tawy the Goldsmith",
  "نب تاوي الكاهنة": "Neb-Tawy the Priestess",
  "نب رع القائد البحري": "Neb-Ra the Naval Commander",
  "نب ماعت الفلكية": "Neb-Maat the Astronomer",
  "نب ماعت رع ناخت": "Neb-Maat-Ra-Nakht",
  "نفرت إيري": "Nefertiry",
  "نفرت كا رع": "Nefert-Ka-Ra",
  "نفرتاري": "Nefertari",
  "نفرتيتي": "Nefertiti",
  "نفر حتب الأول": "Neferhotep I",
};

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

// Transliterate Arabic to English using Egyptian phonetic rules
const ARABIC_TO_LATIN: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ء": "",
  "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h",
  "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
  "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t",
  "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q",
  "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h",
  "و": "w", "ي": "y", "ى": "a", "ة": "t",
  "َ": "a", "ُ": "u", "ِ": "i", "ّ": "", "ْ": "",
  "ً": "n", "ٌ": "n", "ٍ": "n",
};

const EGYPTIAN_PHONETIC: [RegExp, string][] = [
  [/حتب/g, "hotep"], [/آمون|أمون|امون/g, "amun"], [/آمن|أمن|امن/g, "amen"],
  [/حور/g, "hor"], [/رع/g, "ra"], [/ماعت/g, "maat"], [/بتاح/g, "ptah"],
  [/نفر/g, "nefer"], [/مس/g, "mes"], [/خع/g, "kha"], [/سخم/g, "sekhem"],
  [/خنوم/g, "khnum"], [/عنخ/g, "ankh"], [/وسر/g, "user"], [/سوبك/g, "sobek"],
  [/منتو/g, "montu"], [/خنسو/g, "khonsu"], [/جحوتي/g, "djehuti"],
  [/تحت/g, "thut"], [/نخت/g, "nakht"], [/إيست|إيزيس/g, "isis"],
  [/ميريت|مريت/g, "merit"], [/سات/g, "sat"],
];

function transliterateToEnglish(arabic: string): string {
  let text = arabic.trim().replace(
    /^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة|الطبيبة|الأميرة|العازف|الوزيرة)\s+/,
    ""
  ).trim();
  let result = text;
  for (const [pattern, replacement] of EGYPTIAN_PHONETIC) {
    result = result.replace(pattern, replacement);
  }
  let latinized = "";
  for (const char of result) {
    if (char === " " || char === "-") latinized += " ";
    else if (/[a-zA-Z0-9]/.test(char)) latinized += char;
    else if (ARABIC_TO_LATIN[char] !== undefined) latinized += ARABIC_TO_LATIN[char];
  }
  // Capitalize each word
  return latinized.replace(/\s+/g, " ").trim()
    .split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function englishNameFor(
  arName: string,
  category: string,
  role: string,
  gender: string,
): string {
  // Try direct dictionary lookup
  const direct = EGYPTIAN_NAME_EN[arName.trim()];
  if (direct) return direct;
  // Try reverse NAME_AR lookup
  const fromNameAr = NAME_EN[arName.trim()];
  if (fromNameAr) return fromNameAr;
  // Transliterate
  return transliterateToEnglish(arName);
}

function englishDescriptionFor(
  category: string,
  role: string,
  gender: string,
): string {
  const r = ROLE_EN[role] ?? ROLE_EN.noble;
  const g = gender === "female" ? r.female : gender === "male" ? r.male : r.neutral;
  const verbs: Record<string, string> = {
    royalty: "bearing the majesty of the throne and the wisdom of rule",
    warrior: "showing the courage of the battlefield and the resolve of battle",
    scholar: "pulsing with the wisdom of books and the curiosity of great minds",
    priest: "radiating the reverence of temples and the serenity of the sacred",
    priestess: "radiating the reverence of temples and the serenity of the sacred",
    artist: "carrying the spirit of beauty and creative inspiration in every detail",
    craftsman: "whose hands bear witness to masterful craftsmanship and patient artistry",
    explorer: "with eyes alight with the spirit of adventure and love of discovery",
    noble: "carrying the dignity of nobility and the presence of high station",
    commander: "with the strategic mind and iron will of a military leader",
    architect: "whose vision shaped monuments that stand for eternity",
    scribe: "whose pen preserved the wisdom of an ancient civilization",
    physician: "whose healing hands served both royals and commoners",
    vizier: "wielding administrative power second only to the throne",
    queen: "embodying grace, power, and the divine feminine of an ancient dynasty",
    pharaoh: "ruling with divine authority over the land of the Nile",
  };
  const verb = verbs[role] ?? verbs.noble;
  return `An ancient Egyptian ${g.toLowerCase()}, ${verb} — embodying the spirit of their age and the grandeur of their civilization.`;
}

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
      bio_en: "Egypt's longest-reigning pharaoh (1279–1213 BC). He led the Battle of Kadesh against the Hittites, signed history's earliest known peace treaty, and built Abu Simbel and the Ramesseum.",
      bio_ar: "أعظم فراعنة مصر وأطولهم حكمًا (1279–1213 ق.م). قاد معركة قادش ضد الحيثيين، ووقّع أوّل معاهدة سلام معروفة في التاريخ، وشيّد معابد أبو سمبل والرامسيوم." },
    { name_en: "Thutmose III", name_ar: "تحتمس الثالث",
      bio_en: "The 'Napoleon of Egypt' (1479–1425 BC). Launched seventeen campaigns, expanded Egypt from the Euphrates to Nubia, and won the legendary Battle of Megiddo.",
      bio_ar: "نابليون مصر (1479–1425 ق.م). قاد سبع عشرة حملة عسكرية، ووسّع الإمبراطورية من الفرات إلى النوبة، وانتصر في معركة مجدو." },
    { name_en: "Khufu", name_ar: "خوفو",
      bio_en: "Pharaoh of the Fourth Dynasty (c. 2589–2566 BC). Builder of the Great Pyramid of Giza — the only surviving Wonder of the Ancient World.",
      bio_ar: "فرعون الأسرة الرابعة (نحو 2589–2566 ق.م). شيّد الهرم الأكبر بالجيزة، عجيبة الدنيا الوحيدة الباقية." },
    { name_en: "Khafre", name_ar: "خفرع",
      bio_en: "Fourth-dynasty pharaoh (c. 2570 BC). Builder of the second pyramid at Giza and traditionally credited with the Great Sphinx.",
      bio_ar: "فرعون من الأسرة الرابعة (نحو 2570 ق.م). شيّد الهرم الثاني بالجيزة، ويُنسب إليه أبو الهول العظيم." },
    { name_en: "Menkaure", name_ar: "منكاورع",
      bio_en: "Fourth-dynasty pharaoh (c. 2530 BC). Builder of the third and smallest pyramid at Giza, remembered as a just and pious ruler.",
      bio_ar: "فرعون من الأسرة الرابعة (نحو 2530 ق.م). شيّد الهرم الثالث الأصغر في الجيزة، ويُذكر بعدله وتقواه." },
    { name_en: "Sneferu", name_ar: "سنفرو",
      bio_en: "Founder of the Fourth Dynasty (c. 2613–2589 BC). The most prolific pyramid-builder in history, perfecting the true pyramid form.",
      bio_ar: "مؤسس الأسرة الرابعة (نحو 2613–2589 ق.م). أكثر فراعنة التاريخ بناءً للأهرامات، وصاحب أوّل هرم كامل التصميم." },
    { name_en: "Djoser", name_ar: "زوسر",
      bio_en: "Third-dynasty pharaoh (c. 2670 BC). Commissioned the Step Pyramid at Saqqara — the world's oldest large-scale stone monument.",
      bio_ar: "فرعون من الأسرة الثالثة (نحو 2670 ق.م). أمر ببناء هرم سقّارة المدرّج — أقدم صرح حجري ضخم في العالم." },
    { name_en: "Pepi II", name_ar: "بيبي الثاني",
      bio_en: "Sixth-dynasty pharaoh (c. 2278–2184 BC). Reputedly the longest-reigning monarch in history, ruling Egypt for over ninety years.",
      bio_ar: "فرعون من الأسرة السادسة (نحو 2278–2184 ق.م). يُذكر أنه أطول الملوك حكمًا في التاريخ بأكثر من تسعين عامًا." },
    { name_en: "Mentuhotep II", name_ar: "منتوحتب الثاني",
      bio_en: "Eleventh-dynasty pharaoh (c. 2061–2010 BC). Reunified Egypt after the First Intermediate Period and founded the Middle Kingdom.",
      bio_ar: "فرعون من الأسرة الحادية عشرة (نحو 2061–2010 ق.م). أعاد توحيد مصر بعد عصر الانتقال الأول وأسّس الدولة الوسطى." },
    { name_en: "Senusret I", name_ar: "سنوسرت الأول",
      bio_en: "Twelfth-dynasty pharaoh (1971–1926 BC). Expanded into Nubia, built fortresses on the southern frontier, and patronized literature.",
      bio_ar: "فرعون من الأسرة الثانية عشرة (1971–1926 ق.م). توسّع جنوبًا في النوبة، وبنى الحصون على الحدود الجنوبية، ورعى الأدب." },
    { name_en: "Senusret III", name_ar: "سنوسرت الثالث",
      bio_en: "Twelfth-dynasty warrior-king (1878–1839 BC). Centralized power, dug the Sehel canal at Aswan, and led campaigns deep into Nubia.",
      bio_ar: "فرعون محارب من الأسرة الثانية عشرة (1878–1839 ق.م). مركّز السلطة، وحفر قناة سهيل في أسوان، وقاد حملات عميقة في النوبة." },
    { name_en: "Amenhotep III", name_ar: "أمنحتب الثالث",
      bio_en: "Eighteenth-dynasty pharaoh (1390–1352 BC). Presided over Egypt's golden age of wealth, diplomacy and the colossal Memnon statues.",
      bio_ar: "فرعون من الأسرة الثامنة عشرة (1390–1352 ق.م). حكم العصر الذهبي للثروة والدبلوماسية، وشيّد تمثالَي ممنون العملاقين." },
    { name_en: "Akhenaten", name_ar: "إخناتون",
      bio_en: "Eighteenth-dynasty pharaoh (1353–1336 BC). Launched a monotheistic revolution centered on the sun-disk Aten and founded the city of Amarna.",
      bio_ar: "فرعون من الأسرة الثامنة عشرة (1353–1336 ق.م). أحدث ثورة توحيدية حول قرص الشمس «آتون»، وأسّس مدينة العمارنة." },
    { name_en: "Tutankhamun", name_ar: "توت عنخ آمون",
      bio_en: "Boy-king of the Eighteenth Dynasty (1332–1323 BC). Restored traditional religion after Akhenaten and gained world fame through his intact tomb.",
      bio_ar: "الملك الصبيّ من الأسرة الثامنة عشرة (1332–1323 ق.م). أعاد العبادة التقليدية بعد إخناتون، وذاع صيته عالميًا بفضل مقبرته السليمة." },
    { name_en: "Seti I", name_ar: "سيتي الأول",
      bio_en: "Nineteenth-dynasty pharaoh (1290–1279 BC). Father of Ramesses II, he restored Egypt's empire and built the magnificent Abydos temple.",
      bio_ar: "فرعون من الأسرة التاسعة عشرة (1290–1279 ق.م). والد رمسيس الثاني، أعاد بناء الإمبراطورية المصرية وشيّد معبد أبيدوس الرائع." },
    { name_en: "Ramesses III", name_ar: "رمسيس الثالث",
      bio_en: "Twentieth-dynasty pharaoh (1186–1155 BC). Defeated the Sea Peoples in epic land and naval battles that saved Egypt from collapse.",
      bio_ar: "فرعون من الأسرة العشرين (1186–1155 ق.م). هزم «شعوب البحر» في معارك ملحمية برية وبحرية أنقذت مصر من الانهيار." },
    { name_en: "Taharqa", name_ar: "طهرقا",
      bio_en: "Nubian pharaoh of the 25th Dynasty (690–664 BC). Built pyramids at Nuri and led campaigns as far as the Levant against Assyria.",
      bio_ar: "فرعون نوبي من الأسرة الخامسة والعشرين (690–664 ق.م). بنى أهرامات نوري، وقاد حملات حتى بلاد الشام ضد الآشوريين." },
    { name_en: "Psamtik I", name_ar: "بسماتيك الأول",
      bio_en: "Founder of the 26th Dynasty (664–610 BC). Reunited Egypt, expelled the Assyrians and inaugurated the Saite renaissance of arts.",
      bio_ar: "مؤسس الأسرة السادسة والعشرين (664–610 ق.م). أعاد توحيد مصر وطرد الآشوريين، وافتتح نهضة سايس الفنية." },
    { name_en: "Necho II", name_ar: "نخاو الثاني",
      bio_en: "26th-dynasty pharaoh (610–595 BC). Sponsored the first known circumnavigation of Africa by Phoenician sailors and dug a Nile–Red Sea canal.",
      bio_ar: "فرعون من الأسرة السادسة والعشرين (610–595 ق.م). رعى أوّل دوران معروف حول أفريقيا بقيادة بحّارة فينيقيين، وحفر قناة بين النيل والبحر الأحمر." },
    { name_en: "Ptolemy I Soter", name_ar: "بطليموس الأوّل سوتر",
      bio_en: "Founder of the Ptolemaic dynasty (305–283 BC). Macedonian general of Alexander, he founded the Library and Museum of Alexandria.",
      bio_ar: "مؤسس السلالة البطلمية (305–283 ق.م). كان قائدًا مقدونيًّا للإسكندر، وأسّس مكتبة الإسكندرية ومتحفها." },
  ],
  "Pharaoh|royalty|female": [
    { name_en: "Cleopatra VII", name_ar: "كليوباترا السابعة",
      bio_en: "Last active ruler of Ptolemaic Egypt (51–30 BC). Polyglot scholar fluent in nine languages, she allied with Caesar and Antony to keep Egypt independent.",
      bio_ar: "آخر حاكمة فعلية لمصر البطلمية (51–30 ق.م). أتقنت تسع لغات، وتحالفت مع قيصر وأنطونيوس للحفاظ على استقلال مصر." },
    { name_en: "Hatshepsut", name_ar: "حتشبسوت",
      bio_en: "Eighteenth-dynasty pharaoh (1479–1458 BC). Launched a peaceful, prosperous era, organized the Punt expedition, and built Deir el-Bahari.",
      bio_ar: "فرعونة من الأسرة الثامنة عشرة (1479–1458 ق.م). أسّست عصرًا من السلام والازدهار، ونظّمت رحلة بلاد بونت، وبنت معبد الدير البحري." },
    { name_en: "Nefertiti", name_ar: "نفرتيتي",
      bio_en: "Great Royal Wife of Akhenaten (c. 1370–1330 BC). Co-ruler during Egypt's monotheistic revolution and immortalized by the Berlin bust.",
      bio_ar: "الزوجة الملكية العظمى لإخناتون (نحو 1370–1330 ق.م). شاركت الحكم في ثورة التوحيد، وخلّدها تمثال برلين." },
    { name_en: "Nefertari", name_ar: "نفرتاري",
      bio_en: "Great Royal Wife of Ramesses II (c. 1290–1255 BC). Honored with her own temple at Abu Simbel and one of the most beautifully painted tombs ever found.",
      bio_ar: "الزوجة الملكية الكبرى لرمسيس الثاني (نحو 1290–1255 ق.م). كُرّمت بمعبد خاص في أبو سمبل، وبمقبرة من أجمل المقابر المزخرفة." },
    { name_en: "Ahmose-Nefertari", name_ar: "أحمس نفرتاري",
      bio_en: "Founding queen of the Eighteenth Dynasty (c. 1562–1495 BC). Held the powerful title 'God's Wife of Amun' and was venerated as a goddess after death.",
      bio_ar: "ملكة مؤسِّسة للأسرة الثامنة عشرة (نحو 1562–1495 ق.م). حملت لقب «زوجة آمون»، وعُبدت كإلهة بعد وفاتها." },
    { name_en: "Tiye", name_ar: "تي",
      bio_en: "Great Royal Wife of Amenhotep III (c. 1398–1338 BC). A powerful diplomat whose correspondence with foreign kings shaped imperial policy.",
      bio_ar: "الزوجة الملكية الكبرى لأمنحتب الثالث (نحو 1398–1338 ق.م). دبلوماسية قوية شكّلت مراسلاتها مع الملوك الأجانب سياسة الإمبراطورية." },
    { name_en: "Sobekneferu", name_ar: "سوبك نفرو",
      bio_en: "First confirmed female pharaoh (1806–1802 BC). She closed the Twelfth Dynasty and ruled Egypt in her own right.",
      bio_ar: "أوّل امرأة تتولى عرش مصر بشكل مؤكد (1806–1802 ق.م). أنهت الأسرة الثانية عشرة وحكمت بنفسها." },
    { name_en: "Twosret", name_ar: "تاوسرت",
      bio_en: "Last pharaoh of the Nineteenth Dynasty (1191–1189 BC). Ruled in her own name and was buried in the Valley of the Kings.",
      bio_ar: "آخر فراعنة الأسرة التاسعة عشرة (1191–1189 ق.م). حكمت باسمها ودُفنت في وادي الملوك." },
    { name_en: "Arsinoe II", name_ar: "أرسينوي الثانية",
      bio_en: "Ptolemaic queen (c. 316–270 BC). Wife and sister of Ptolemy II, she was deified during her lifetime and influenced Hellenistic politics.",
      bio_ar: "ملكة بطلمية (نحو 316–270 ق.م). زوجة وأخت بطليموس الثاني، أُلِّهت في حياتها وأثّرت في السياسة الهلنستية." },
    { name_en: "Berenice II", name_ar: "برنيقة الثانية",
      bio_en: "Ptolemaic queen (267–221 BC). Co-ruler with Ptolemy III, immortalized in the constellation Coma Berenices and praised by the poet Callimachus.",
      bio_ar: "ملكة بطلمية (267–221 ق.م). شاركت بطليموس الثالث الحكم، وخُلّدت في كوكبة «شعر برنيقة» ومدحها الشاعر كاليماخوس." },
    { name_en: "Cleopatra I Syra", name_ar: "كليوباترا الأولى السورية",
      bio_en: "Seleucid princess and Ptolemaic queen (204–176 BC). She served as regent of Egypt for her son Ptolemy VI and stabilized the kingdom.",
      bio_ar: "أميرة سلوقية وملكة بطلمية (204–176 ق.م). تولّت الوصاية على مصر لابنها بطليموس السادس وأعادت استقرار المملكة." },
    { name_en: "Meritneith", name_ar: "مريت نيت",
      bio_en: "Early dynastic queen (c. 2950 BC). Likely regent and possibly the first female ruler of unified Egypt; buried in a royal tomb at Abydos.",
      bio_ar: "ملكة من العصر العتيق (نحو 2950 ق.م). يُرجّح أنها حكمت كوصيّة وربما كأوّل حاكمة لمصر الموحَّدة، ودُفنت في مقبرة ملكية بأبيدوس." },
    { name_en: "Ankhesenamun", name_ar: "عنخ إسن آمون",
      bio_en: "Royal wife of Tutankhamun (c. 1348–1322 BC). After his death she famously wrote to a Hittite king asking for a prince to marry, a unique diplomatic appeal.",
      bio_ar: "زوجة توت عنخ آمون (نحو 1348–1322 ق.م). بعد وفاته كتبت إلى ملك الحيثيين تطلب أميرًا لتتزوّجه، في مبادرة دبلوماسية فريدة." },
    { name_en: "Cleopatra Selene II", name_ar: "كليوباترا سيلين الثانية",
      bio_en: "Daughter of Cleopatra VII and Mark Antony (40 BC–6 AD). Queen of Mauretania, she preserved her mother's Ptolemaic legacy in North Africa.",
      bio_ar: "ابنة كليوباترا السابعة ومارك أنطونيوس (40 ق.م–6 م). ملكة موريتانيا، حافظت على إرث أمها البطلمي في شمال أفريقيا." },
  ],
  "Pharaoh|warrior|male": [
    { name_en: "Ahmose I", name_ar: "أحمس الأول",
      bio_en: "Founder of the Eighteenth Dynasty (1549–1524 BC). Liberated Egypt from the Hyksos, reunified the country, and launched the New Kingdom.",
      bio_ar: "مؤسس الأسرة الثامنة عشرة (1549–1524 ق.م). حرّر مصر من الهكسوس، وأعاد توحيد البلاد، وافتتح عصر الدولة الحديثة." },
    { name_en: "Piye", name_ar: "بعنخي (الملك بيا)",
      bio_en: "Nubian king and founder of the 25th Dynasty (c. 744–714 BC). Conquered all of Egypt and revived ancient pyramid building in Nubia.",
      bio_ar: "ملك نوبي ومؤسس الأسرة الخامسة والعشرين (نحو 744–714 ق.م). فتح مصر بأكملها، وأحيا بناء الأهرامات في النوبة." },
    { name_en: "Kamose", name_ar: "كاموس",
      bio_en: "Last pharaoh of the Seventeenth Dynasty (c. 1555–1550 BC). Began the war of liberation against the Hyksos that his brother Ahmose I would complete.",
      bio_ar: "آخر فراعنة الأسرة السابعة عشرة (نحو 1555–1550 ق.م). بدأ حرب التحرير ضد الهكسوس التي أكملها أخوه أحمس الأول." },
    { name_en: "Tao II Seqenenre", name_ar: "سقنن رع تاعا الثاني",
      bio_en: "Theban pharaoh (c. 1560 BC) whose mummy bears battle wounds — the first pharaoh known to have died fighting the Hyksos invaders.",
      bio_ar: "فرعون طيبي (نحو 1560 ق.م) تحمل مومياؤه جروح المعركة — أوّل فرعون معروف استشهد في قتال الهكسوس." },
    { name_en: "Horemheb", name_ar: "حورمحب",
      bio_en: "General-turned-pharaoh (1319–1292 BC). Restored order after the Amarna period and reformed Egypt's army and administration.",
      bio_ar: "قائد عسكري صار فرعونًا (1319–1292 ق.م). أعاد النظام بعد عصر العمارنة، وأصلح الجيش والإدارة في مصر." },
    { name_en: "Sheshonq I", name_ar: "شيشنق الأوّل",
      bio_en: "Founder of the 22nd Dynasty (943–922 BC). Libyan-origin pharaoh who campaigned in the Levant and is the biblical 'Shishak'.",
      bio_ar: "مؤسس الأسرة الثانية والعشرين (943–922 ق.م). فرعون من أصل ليبي، قاد حملات في بلاد الشام، وهو «شيشاق» في الكتاب المقدس." },
    { name_en: "Tanutamun", name_ar: "تانوت آمون",
      bio_en: "Last pharaoh of the 25th Dynasty (664–656 BC). Briefly reconquered Egypt from the Assyrians and recorded his victory in the Dream Stela.",
      bio_ar: "آخر فراعنة الأسرة الخامسة والعشرين (664–656 ق.م). استعاد مصر من الآشوريين لفترة قصيرة، وسجّل انتصاره في «لوحة الحلم»." },
    { name_en: "Apries", name_ar: "أبريس",
      bio_en: "26th-dynasty pharaoh (589–570 BC). Led campaigns against Babylon and supported Jerusalem against Nebuchadnezzar II.",
      bio_ar: "فرعون من الأسرة السادسة والعشرين (589–570 ق.م). قاد حملات ضد بابل، ودعم القدس في وجه نبوخذ نصّر الثاني." },
  ],
  "Pharaoh|warrior|female": [
    { name_en: "Ahhotep I", name_ar: "إعح حتب الأولى",
      bio_en: "Queen and warrior of the Seventeenth Dynasty (c. 1560–1530 BC). Awarded military decorations for rallying the army during the Hyksos war.",
      bio_ar: "ملكة ومحاربة من الأسرة السابعة عشرة (نحو 1560–1530 ق.م). نالت أوسمة عسكرية لقيادتها الجيش في حرب الهكسوس." },
    { name_en: "Cleopatra VII (general)", name_ar: "كليوباترا السابعة (قائدة)",
      bio_en: "Beyond diplomacy, Cleopatra personally commanded fleets at Actium (31 BC), uniting Egyptian and Roman naval forces against Octavian.",
      bio_ar: "إلى جانب الدبلوماسية، قادت كليوباترا الأساطيل بنفسها في معركة أكتيوم (31 ق.م)، موحِّدةً القوات البحرية المصرية والرومانية ضد أوكتافيان." },
    { name_en: "Tetisheri", name_ar: "تتي شيري",
      bio_en: "Matriarch and queen of the late Seventeenth Dynasty (c. 1580 BC). Honored as the spiritual leader who inspired the war of liberation against the Hyksos.",
      bio_ar: "ملكة وأمّ كبيرة من أواخر الأسرة السابعة عشرة (نحو 1580 ق.م). كُرّمت كقائدة روحية ألهمت حرب التحرير ضد الهكسوس." },
  ],
  "Pharaoh|scholar|male": [
    { name_en: "Imhotep", name_ar: "إمحوتب",
      bio_en: "Polymath of the 27th century BC. Architect of the Step Pyramid of Djoser and a pioneering physician later worshipped as a god of medicine.",
      bio_ar: "عبقري متعدد المواهب من القرن السابع والعشرين قبل الميلاد. مهندس هرم زوسر المدرّج، وطبيب رائد عُبد لاحقًا كإله للطب." },
    { name_en: "Ahmes", name_ar: "أحمس الكاتب",
      bio_en: "Egyptian scribe (c. 1650 BC) who copied the Rhind Mathematical Papyrus — the oldest surviving comprehensive math textbook.",
      bio_ar: "كاتب مصري (نحو 1650 ق.م) نسخ بردية ريند الرياضية، أقدم كتاب رياضيات شامل باقٍ في التاريخ." },
    { name_en: "Hesy-Ra", name_ar: "حسي رع",
      bio_en: "Third-dynasty official (c. 2650 BC). Earliest known dentist and physician, his beautifully carved wooden panels survive in Cairo.",
      bio_ar: "موظف من الأسرة الثالثة (نحو 2650 ق.م). أقدم طبيب أسنان وطبيب معروف، وألواحه الخشبية المنقوشة محفوظة في القاهرة." },
    { name_en: "Ptahhotep", name_ar: "بتاح حتب",
      bio_en: "Vizier under Djedkare Isesi (24th century BC). Author of the 'Maxims of Ptahhotep', one of the world's earliest works of philosophy and ethics.",
      bio_ar: "وزير في عهد جد كا رع إيسيسي (القرن الرابع والعشرين ق.م). صاحب «حكم بتاح حتب»، من أقدم كتب الفلسفة والأخلاق في العالم." },
    { name_en: "Amenhotep son of Hapu", name_ar: "أمنحتب بن حابو",
      bio_en: "Royal architect and sage under Amenhotep III (c. 1430–1350 BC). Designed Memnon and Luxor monuments and was deified for his wisdom.",
      bio_ar: "مهندس ملكي وحكيم في عهد أمنحتب الثالث (نحو 1430–1350 ق.م). صمّم تماثيل ممنون ومعالم الأقصر، وأُلِّه لحكمته." },
    { name_en: "Eratosthenes", name_ar: "إراتوستينيس",
      bio_en: "Greek-Egyptian scholar at the Library of Alexandria (276–194 BC). First to calculate Earth's circumference with remarkable accuracy.",
      bio_ar: "عالم يوناني-مصري في مكتبة الإسكندرية (276–194 ق.م). أوّل من حسب محيط الأرض بدقة مذهلة." },
    { name_en: "Manetho (scholar)", name_ar: "مانيتون (العالِم)",
      bio_en: "Egyptian priest-historian (3rd century BC) whose Aegyptiaca established the dynastic framework still used by Egyptologists.",
      bio_ar: "كاهن ومؤرخ مصري (القرن الثالث ق.م)، أسّس كتابه «إيجيبتياكا» تقسيم الأسرات الذي لا يزال علماء المصريات يستخدمونه." },
    { name_en: "Aristarchus of Samos", name_ar: "أرسطرخس الساموسي",
      bio_en: "Greek astronomer who worked at Alexandria (c. 310–230 BC). First to propose a heliocentric model of the universe — 1,800 years before Copernicus.",
      bio_ar: "فلكي يوناني عمل في الإسكندرية (نحو 310–230 ق.م). أوّل من طرح نموذج مركزية الشمس قبل كوبرنيكوس بألف وثمانمئة عام." },
  ],
  "Pharaoh|scholar|female": [
    { name_en: "Hypatia of Alexandria", name_ar: "هيباتيا السكندرية",
      bio_en: "Mathematician, astronomer, and Neoplatonist philosopher (c. 360–415 AD). Head of the Platonic school of Alexandria.",
      bio_ar: "عالمة رياضيات وفلكية وفيلسوفة أفلاطونية محدثة (نحو 360–415 م). رأست المدرسة الأفلاطونية في الإسكندرية." },
    { name_en: "Peseshet", name_ar: "بسشت",
      bio_en: "Egyptian physician of the Fourth Dynasty (c. 2500 BC). Held the title 'Lady Overseer of Female Physicians', the earliest known female doctor.",
      bio_ar: "طبيبة مصرية من الأسرة الرابعة (نحو 2500 ق.م). حملت لقب «مشرفة الطبيبات»، وهي أقدم طبيبة معروفة في التاريخ." },
    { name_en: "Aganice of Thebes", name_ar: "أغانيكي الطيبية",
      bio_en: "Egyptian astronomer (c. 2nd millennium BC) renowned for predicting solar and lunar eclipses with such accuracy she was called a sorceress.",
      bio_ar: "فلكية مصرية (الألفية الثانية ق.م) اشتهرت بتنبّؤها بكسوف الشمس وخسوف القمر بدقة جعلت الناس يصفونها بالساحرة." },
  ],
  "Pharaoh|priest|male": [
    { name_en: "Manetho", name_ar: "مانيتون",
      bio_en: "Egyptian priest and historian (3rd century BC). Author of Aegyptiaca, the foundational chronology of pharaonic Egypt.",
      bio_ar: "كاهن ومؤرخ مصري (القرن الثالث ق.م). صاحب «إيجيبتياكا»، التسلسل الزمني المؤسس لتاريخ مصر الفرعونية." },
    { name_en: "Pinedjem I", name_ar: "بيندجم الأوّل",
      bio_en: "High Priest of Amun and effective ruler of Upper Egypt (c. 1070–1032 BC). His priest-kings preserved royal mummies during a turbulent age.",
      bio_ar: "كاهن آمون الأكبر وحاكم مصر العليا فعليًّا (نحو 1070–1032 ق.م). حافظ ملوك الكهنة في عهده على المومياوات الملكية في زمن مضطرب." },
    { name_en: "Herihor", name_ar: "حريحور",
      bio_en: "High Priest of Amun (c. 1080 BC). Founded the line of priest-kings of Thebes who ruled Upper Egypt while pharaohs ruled the north.",
      bio_ar: "كاهن آمون الأكبر (نحو 1080 ق.م). أسّس سلالة الكهنة الملوك في طيبة الذين حكموا الصعيد بينما حكم الفراعنة الشمال." },
    { name_en: "Bakenkhonsu", name_ar: "باكنخونسو",
      bio_en: "High Priest of Amun under Ramesses II. Oversaw the temple of Karnak's expansion and lived nearly ninety years.",
      bio_ar: "كاهن آمون الأكبر في عهد رمسيس الثاني. أشرف على توسيع معبد الكرنك، وعاش نحو تسعين عامًا." },
  ],
  "Pharaoh|priest|female": [
    { name_en: "Shepenupet II", name_ar: "شبنوبت الثانية",
      bio_en: "God's Wife of Amun (c. 700–650 BC). The supreme religious authority of Thebes, she ruled Upper Egypt as a virtual queen.",
      bio_ar: "زوجة آمون (نحو 700–650 ق.م). كانت السلطة الدينية العليا في طيبة، وحكمت الصعيد فعليًّا كملكة." },
    { name_en: "Amenirdis I", name_ar: "أمنرديس الأولى",
      bio_en: "God's Wife of Amun (c. 740–700 BC). Sister of Pharaoh Piye, she held supreme religious power in Thebes for decades.",
      bio_ar: "زوجة آمون (نحو 740–700 ق.م). أخت الفرعون بعنخي، تولّت السلطة الدينية العليا في طيبة لعقود." },
    { name_en: "Nitocris I", name_ar: "نيتوكريس الأولى",
      bio_en: "God's Wife of Amun (656–586 BC). Adopted heir who unified northern and southern religious authority for nearly seventy years.",
      bio_ar: "زوجة آمون (656–586 ق.م). وريثة بالتبنّي وحّدت السلطة الدينية بين الشمال والجنوب لنحو سبعين عامًا." },
    { name_en: "Maatkare Mutemhat", name_ar: "معت كا رع موت إم حات",
      bio_en: "God's Wife of Amun (c. 1050 BC). Powerful priestess of Thebes during the Twenty-First Dynasty.",
      bio_ar: "زوجة آمون (نحو 1050 ق.م). كاهنة قوية في طيبة خلال الأسرة الحادية والعشرين." },
  ],
  "Pharaoh|artist|male": [
    { name_en: "Bek", name_ar: "بك النحّات",
      bio_en: "Chief sculptor under Akhenaten (14th century BC). Pioneered the radical Amarna style — naturalistic, intimate art that broke 1,500 years of convention.",
      bio_ar: "كبير نحّاتي إخناتون (القرن الرابع عشر ق.م). أسّس الأسلوب العمارني الثوري — فن طبيعي حميم حطّم خمسة عشر قرنًا من التقاليد." },
    { name_en: "Thutmose (sculptor)", name_ar: "تحتمس النحّات",
      bio_en: "Court sculptor of Akhenaten (c. 1340 BC). His workshop in Amarna produced the iconic Nefertiti bust, found on his abandoned shelves.",
      bio_ar: "نحّات بلاط إخناتون (نحو 1340 ق.م). أنتجت ورشته في العمارنة تمثال نفرتيتي الأيقوني، الذي عُثر عليه على رفوفه المهجورة." },
    { name_en: "Khaemwaset", name_ar: "خعمواست",
      bio_en: "Prince and 'first Egyptologist' (c. 1281–1225 BC). Son of Ramesses II who restored ancient monuments and identified their original builders.",
      bio_ar: "أمير و«أوّل عالم مصريات» (نحو 1281–1225 ق.م). ابن رمسيس الثاني، رمّم آثار الأجداد وحدّد بنّاءها الأصليين." },
  ],
  "Pharaoh|artist|female": [
    { name_en: "Merit-Ptah", name_ar: "ميريت بتاح",
      bio_en: "Court physician of the early dynastic period (c. 2700 BC), traditionally cited as the first named woman in the history of medicine and science.",
      bio_ar: "طبيبة البلاط في عصر الأسرات المبكر (نحو 2700 ق.م)، يُذكر تقليديًا أنها أوّل امرأة معروفة بالاسم في تاريخ الطب والعلوم." },
    { name_en: "Iput", name_ar: "إيبوت الموسيقية",
      bio_en: "Chantress of Amun (New Kingdom). Female musicians like Iput led the temple choirs of Karnak and Luxor in ritual performance.",
      bio_ar: "مرتّلة آمون (الدولة الحديثة). قادت الموسيقيات مثل إيبوت جوقات معابد الكرنك والأقصر في الطقوس." },
  ],
  "Pharaoh|craftsman|male": [
    { name_en: "Senenmut", name_ar: "سنموت",
      bio_en: "Royal architect under Hatshepsut (c. 1470 BC). Designed her revolutionary terraced mortuary temple at Deir el-Bahari.",
      bio_ar: "المهندس الملكي للملكة حتشبسوت (نحو 1470 ق.م). صمّم معبدها الجنائزي المتدرّج الثوري في الدير البحري." },
    { name_en: "Ineni", name_ar: "إنني",
      bio_en: "Royal architect under Thutmose I (c. 1500 BC). First to carve a tomb in the Valley of the Kings, transforming royal burial forever.",
      bio_ar: "المهندس الملكي للملك تحتمس الأول (نحو 1500 ق.م). أوّل من نحت مقبرة ملكية في وادي الملوك، فأحدث ثورة في الدفن الملكي." },
    { name_en: "Hemiunu", name_ar: "حم إيونو",
      bio_en: "Vizier and architect of Khufu (c. 2570 BC). Traditionally credited as the master builder of the Great Pyramid of Giza.",
      bio_ar: "وزير ومهندس الملك خوفو (نحو 2570 ق.م). يُنسب إليه تقليديًّا الإشراف على بناء الهرم الأكبر بالجيزة." },
    { name_en: "Kha", name_ar: "خع",
      bio_en: "Royal architect of the Eighteenth Dynasty (c. 1400 BC). His intact tomb at Deir el-Medina preserved a remarkable record of New Kingdom craftsmanship.",
      bio_ar: "مهندس ملكي من الأسرة الثامنة عشرة (نحو 1400 ق.م). حفظت مقبرته السليمة في دير المدينة سجلًّا رائعًا لحرف الدولة الحديثة." },
  ],
  "Pharaoh|craftsman|female": [
    { name_en: "Hatnefer", name_ar: "حات نفر",
      bio_en: "Mother of Senenmut (c. 1500 BC). Skilled household manager whose untouched burial preserved exquisite jewelry and linen craftsmanship.",
      bio_ar: "والدة سنموت (نحو 1500 ق.م). مديرة منزل بارعة، حفظت مقبرتها السليمة مجوهرات ومنسوجات كتانية رائعة الصنع." },
  ],
  "Pharaoh|explorer|male": [
    { name_en: "Harkhuf", name_ar: "حرخوف",
      bio_en: "Sixth-dynasty governor of Elephantine (c. 2280 BC). Led four trade expeditions deep into Nubia and brought a dancing dwarf to Pharaoh Pepi II.",
      bio_ar: "حاكم إلفنتين من الأسرة السادسة (نحو 2280 ق.م). قاد أربع بعثات تجارية عميقة في النوبة، وأهدى الفرعون بيبي الثاني قزمًا راقصًا." },
    { name_en: "Hannu", name_ar: "حنّو",
      bio_en: "Eleventh-dynasty officer (c. 2000 BC) who led an expedition through the eastern desert to the Land of Punt — Egypt's first recorded Red Sea voyage.",
      bio_ar: "ضابط من الأسرة الحادية عشرة (نحو 2000 ق.م) قاد بعثة عبر الصحراء الشرقية إلى بلاد بونت — أوّل رحلة مصرية مسجَّلة في البحر الأحمر." },
  ],
  "Pharaoh|noble|male": [
    { name_en: "Ay", name_ar: "آي",
      bio_en: "Eighteenth-dynasty pharaoh (1323–1319 BC). Powerful courtier under Akhenaten and Tutankhamun who briefly took the throne after Tut's death.",
      bio_ar: "فرعون من الأسرة الثامنة عشرة (1323–1319 ق.م). كان أحد كبار رجال البلاط في عهد إخناتون وتوت عنخ آمون، واعتلى العرش بعد توت لفترة قصيرة." },
    { name_en: "Mereruka", name_ar: "مررو كا",
      bio_en: "Vizier of King Teti (c. 2330 BC). His vast tomb at Saqqara — one of the largest non-royal tombs — depicts daily life with extraordinary detail.",
      bio_ar: "وزير الملك تتي (نحو 2330 ق.م). مقبرته الواسعة في سقّارة، من أكبر مقابر غير الملوك، تصوّر الحياة اليومية بتفاصيل مذهلة." },
    { name_en: "Kagemni", name_ar: "كاجمني",
      bio_en: "Vizier under Teti (c. 2300 BC). Author of an early instruction text on ethics and good governance, addressed to his children.",
      bio_ar: "وزير الملك تتي (نحو 2300 ق.م). صاحب نص تعليمي مبكر في الأخلاق والحكم الرشيد، وجّهه إلى أبنائه." },
    { name_en: "Rekhmire", name_ar: "رخميرع",
      bio_en: "Vizier under Thutmose III and Amenhotep II (c. 1450 BC). His tomb records the duties of the vizier and the diverse peoples paying tribute to Egypt.",
      bio_ar: "وزير في عهد تحتمس الثالث وأمنحتب الثاني (نحو 1450 ق.م). تسجّل مقبرته واجبات الوزير وشعوب الأرض التي تقدّم الجزية لمصر." },
  ],
  "Pharaoh|noble|female": [
    { name_en: "Khentkaus I", name_ar: "خنت كاوس الأولى",
      bio_en: "Royal mother of the late Fourth Dynasty (c. 2500 BC). Her unique tomb at Giza suggests she may have ruled briefly as pharaoh.",
      bio_ar: "أمّ ملكية من أواخر الأسرة الرابعة (نحو 2500 ق.م). يوحي تصميم مقبرتها الفريد في الجيزة بأنها قد تكون حكمت كفرعون لفترة وجيزة." },
  ],
  // ===== Greek =====
  "Greek|royalty|male": [
    { name_en: "Alexander the Great", name_ar: "الإسكندر الأكبر",
      bio_en: "King of Macedon (336–323 BC). Built one of history's largest empires by age thirty, from Greece to India, spreading Hellenistic culture.",
      bio_ar: "ملك مقدونيا (336–323 ق.م). بنى قبل الثلاثين واحدة من أكبر إمبراطوريات التاريخ من اليونان إلى الهند، ونشر الثقافة الهلنستية." },
    { name_en: "Philip II of Macedon", name_ar: "فيليب الثاني المقدوني",
      bio_en: "King of Macedon (359–336 BC). Reformed the army into the famed phalanx, unified Greece under Macedonian leadership, and prepared his son Alexander's conquests.",
      bio_ar: "ملك مقدونيا (359–336 ق.م). أصلح الجيش وأوجد كتيبة الفلانكس الشهيرة، ووحّد اليونان تحت قيادة مقدونيا، ومهّد لفتوحات ابنه الإسكندر." },
    { name_en: "Pericles", name_ar: "بريكليس",
      bio_en: "Athenian statesman (c. 495–429 BC). Led Athens through its golden age, building the Parthenon and championing direct democracy.",
      bio_ar: "زعيم أثيني (نحو 495–429 ق.م). قاد أثينا في عصرها الذهبي، وشيّد البارثينون، وناصر الديمقراطية المباشرة." },
    { name_en: "Pyrrhus of Epirus", name_ar: "بيروس الإبيري",
      bio_en: "King of Epirus (319–272 BC). Brilliant general whose costly victories against Rome gave us the term 'Pyrrhic victory'.",
      bio_ar: "ملك إبيروس (319–272 ق.م). قائد بارع جاءت انتصاراته الباهظة الثمن ضد روما لتُعرف بـ«النصر البيروسي»." },
    { name_en: "Lysimachus", name_ar: "ليسيماخوس",
      bio_en: "Diadochus successor of Alexander (c. 360–281 BC). King of Thrace and Asia Minor, founder of the city of Lysimachia.",
      bio_ar: "أحد خلفاء الإسكندر (نحو 360–281 ق.م). ملك تراقيا وآسيا الصغرى، ومؤسس مدينة ليسيماخيا." },
    { name_en: "Seleucus I Nicator", name_ar: "سلوقس الأوّل نيكاتور",
      bio_en: "Founder of the Seleucid Empire (358–281 BC). Inherited the largest share of Alexander's eastern conquests, from Anatolia to the Indus.",
      bio_ar: "مؤسس الإمبراطورية السلوقية (358–281 ق.م). ورث القسم الأكبر من فتوحات الإسكندر الشرقية، من الأناضول إلى السند." },
    { name_en: "Cleomenes III", name_ar: "كليومينيس الثالث",
      bio_en: "King of Sparta (c. 260–219 BC). Led radical social reforms to restore Spartan power before falling at the Battle of Sellasia.",
      bio_ar: "ملك إسبرطة (نحو 260–219 ق.م). قاد إصلاحات اجتماعية جذرية لاستعادة قوة إسبرطة قبل أن يُهزم في معركة سيلاسيا." },
    { name_en: "Agis IV", name_ar: "أغيس الرابع",
      bio_en: "King of Sparta (c. 265–241 BC). Reformer who tried to redistribute land and revive ancient Spartan equality, executed for his ideals.",
      bio_ar: "ملك إسبرطة (نحو 265–241 ق.م). إصلاحي حاول إعادة توزيع الأراضي وإحياء المساواة الإسبرطية القديمة، فأُعدم بسبب مُثُله." },
    { name_en: "Demetrius I Poliorcetes", name_ar: "ديميتريوس الأوّل بوليوركيتس",
      bio_en: "King of Macedon (336–283 BC). Master of siege warfare nicknamed 'the Besieger' for his huge engineering machines.",
      bio_ar: "ملك مقدونيا (336–283 ق.م). أستاذ حروب الحصار، لُقّب بـ«المحاصِر» لآلاته الهندسية الضخمة." },
    { name_en: "Antigonus I Monophthalmus", name_ar: "أنتيغونوس الأوّل أحادي العين",
      bio_en: "Diadochus general (382–301 BC). One of Alexander's commanders who tried to reunite the empire and founded the Antigonid dynasty.",
      bio_ar: "قائد من خلفاء الإسكندر (382–301 ق.م). حاول إعادة توحيد الإمبراطورية، وأسّس السلالة الأنتيغونيدية." },
    { name_en: "Cassander", name_ar: "كاساندر",
      bio_en: "King of Macedon (305–297 BC). Diadochus who ruled Greece, founded Thessaloniki, and consolidated Macedonian power.",
      bio_ar: "ملك مقدونيا (305–297 ق.م). من خلفاء الإسكندر، حكم اليونان وأسّس مدينة تسالونيكي ووطّد سلطة مقدونيا." },
    { name_en: "Antiochus III the Great", name_ar: "أنطيوخوس الثالث الكبير",
      bio_en: "Seleucid king (222–187 BC). Greatly expanded the empire eastward and clashed with Rome in the Roman–Seleucid War.",
      bio_ar: "ملك سلوقي (222–187 ق.م). وسّع الإمبراطورية شرقًا توسعًا كبيرًا، وصدم روما في الحرب الرومانية السلوقية." },
  ],
  "Greek|royalty|female": [
    { name_en: "Olympias", name_ar: "أوليمبياس",
      bio_en: "Queen of Macedon (c. 375–316 BC). Mother of Alexander the Great, formidable political force after his death and devotee of Dionysian rites.",
      bio_ar: "ملكة مقدونيا (نحو 375–316 ق.م). أمّ الإسكندر الأكبر، قوة سياسية مهيبة بعد وفاته، ومريدة لطقوس ديونيسوس." },
    { name_en: "Gorgo of Sparta", name_ar: "غورغو الإسبرطية",
      bio_en: "Spartan queen (c. 518–? BC). Daughter of King Cleomenes and wife of Leonidas; renowned in Herodotus for her wit and political acumen.",
      bio_ar: "ملكة إسبرطة (نحو 518–؟ ق.م). ابنة الملك كليومينيس وزوجة ليونيداس، اشتهرت في كتابات هيرودوت بذكائها وحنكتها السياسية." },
    { name_en: "Arsinoe III", name_ar: "أرسينوي الثالثة",
      bio_en: "Ptolemaic queen (246–204 BC). Co-ruled with her brother-husband Ptolemy IV and rallied the army at the Battle of Raphia.",
      bio_ar: "ملكة بطلمية (246–204 ق.م). شاركت أخاها وزوجها بطليموس الرابع الحكم، وحشدت الجيش في معركة رافيا." },
    { name_en: "Eurydice II of Macedon", name_ar: "يوريديكي الثانية المقدونية",
      bio_en: "Macedonian queen (c. 337–317 BC). Granddaughter of Philip II, she briefly led armies in the Wars of the Diadochi.",
      bio_ar: "ملكة مقدونية (نحو 337–317 ق.م). حفيدة فيليب الثاني، قادت الجيوش لفترة قصيرة في حروب خلفاء الإسكندر." },
    { name_en: "Apama I", name_ar: "أباما الأولى",
      bio_en: "Sogdian-Greek queen (c. 350–280 BC). Wife of Seleucus I and mother of Antiochus I, founding figure of the Seleucid royal line.",
      bio_ar: "ملكة صغدية يونانية (نحو 350–280 ق.م). زوجة سلوقس الأوّل وأمّ أنطيوخوس الأوّل، شخصية مؤسسة للسلالة السلوقية." },
  ],
  "Greek|warrior|male": [
    { name_en: "Leonidas I", name_ar: "ليونيداس الأول",
      bio_en: "King of Sparta who led 300 Spartans at Thermopylae (480 BC), holding back Xerxes' army in one of history's most legendary stands.",
      bio_ar: "ملك إسبرطة الذي قاد ثلاثمئة من جنوده في ثرموبيلاي (480 ق.م)، فصدّ جيش زركسيس في واحدة من أعظم معارك الصمود." },
    { name_en: "Themistocles", name_ar: "ثيميستوكليس",
      bio_en: "Athenian general who built the navy that crushed Persia at Salamis (480 BC), saving Greek civilization.",
      bio_ar: "قائد أثيني بنى الأسطول الذي سحق الفرس في سلاميس (480 ق.م)، فأنقذ الحضارة اليونانية." },
    { name_en: "Milo of Croton", name_ar: "ميلون الكروتوني",
      bio_en: "Six-time Olympic wrestling champion (6th century BC), the most celebrated athlete of antiquity and a student of Pythagoras.",
      bio_ar: "بطل المصارعة الأولمبية ست مرات (القرن السادس ق.م)، أشهر رياضيي العصور القديمة وتلميذ فيثاغورس." },
    { name_en: "Miltiades", name_ar: "ميلتيادس",
      bio_en: "Athenian general (c. 550–489 BC). Architect of the Greek victory at the Battle of Marathon (490 BC) against the Persian invasion.",
      bio_ar: "قائد أثيني (نحو 550–489 ق.م). مهندس النصر اليوناني في معركة ماراثون (490 ق.م) ضد الغزو الفارسي." },
    { name_en: "Cimon", name_ar: "كيمون",
      bio_en: "Athenian statesman-general (c. 510–450 BC). Defeated Persia at the Eurymedon and built the Delian League into Athens' empire.",
      bio_ar: "قائد ورجل دولة أثيني (نحو 510–450 ق.م). هزم الفرس عند نهر إيوريميدون، وبنى الحلف الديلوسي ليصبح إمبراطورية أثينا." },
    { name_en: "Epaminondas", name_ar: "إبامينونداس",
      bio_en: "Theban general (c. 418–362 BC). Crushed Sparta at Leuctra, ending Spartan dominance, and revolutionized Greek tactics with the oblique formation.",
      bio_ar: "قائد طيبي (نحو 418–362 ق.م). سحق إسبرطة في ليوكترا فأنهى هيمنتها، وأحدث ثورة في التكتيك بـ«التشكيل المائل»." },
    { name_en: "Pelopidas", name_ar: "بيلوبيداس",
      bio_en: "Theban general (c. 410–364 BC). Co-commander with Epaminondas, he led the legendary Sacred Band of Thebes.",
      bio_ar: "قائد طيبي (نحو 410–364 ق.م). شارك إبامينونداس القيادة، وقاد «الفرقة المقدسة» الطيبية الأسطورية." },
    { name_en: "Brasidas", name_ar: "براسيداس",
      bio_en: "Spartan general (d. 422 BC). Daring commander whose campaigns in northern Greece during the Peloponnesian War shifted the war's balance.",
      bio_ar: "قائد إسبرطي (ت. 422 ق.م). قائد جسور غيّرت حملاته في شمال اليونان خلال الحرب البيلوبونيسية موازين القوى." },
    { name_en: "Lysander", name_ar: "ليساندر",
      bio_en: "Spartan admiral (d. 395 BC). Crushed the Athenian fleet at Aegospotami (405 BC), ending the Peloponnesian War in Sparta's favor.",
      bio_ar: "أميرال إسبرطي (ت. 395 ق.م). سحق الأسطول الأثيني في إيغوسبوتامي (405 ق.م)، فأنهى الحرب البيلوبونيسية لصالح إسبرطة." },
    { name_en: "Pausanias", name_ar: "باوسانياس القائد",
      bio_en: "Spartan regent (c. 510–470 BC). Commanded the united Greek army at the decisive victory of Plataea (479 BC) against Persia.",
      bio_ar: "وصيّ إسبرطي على العرش (نحو 510–470 ق.م). قاد الجيش اليوناني الموحَّد إلى النصر الحاسم في بلاتايا (479 ق.م) ضد الفرس." },
    { name_en: "Alcibiades", name_ar: "ألكيبياديس",
      bio_en: "Athenian general (450–404 BC). Brilliant, controversial commander who fought for Athens, Sparta, and Persia in turn during the Peloponnesian War.",
      bio_ar: "قائد أثيني (450–404 ق.م). قائد بارع ومثير للجدل قاتل لأثينا وإسبرطة وفارس بالتناوب في الحرب البيلوبونيسية." },
    { name_en: "Xenophon", name_ar: "زينوفون القائد",
      bio_en: "Athenian soldier-historian (c. 430–354 BC). Led the Ten Thousand Greek mercenaries on a heroic retreat from Persia, recorded in the Anabasis.",
      bio_ar: "محارب ومؤرخ أثيني (نحو 430–354 ق.م). قاد العشرة آلاف من المرتزقة اليونانيين في انسحاب بطولي من فارس، سجّله في «أنابازيس»." },
    { name_en: "Aristides", name_ar: "أريستيدس",
      bio_en: "Athenian general (c. 530–468 BC). 'The Just' — hero of Marathon and Plataea who organized the tribute system of the Delian League.",
      bio_ar: "قائد أثيني (نحو 530–468 ق.م). «العادل» — بطل ماراثون وبلاتايا الذي نظّم جزية الحلف الديلوسي." },
  ],
  "Greek|warrior|female": [
    { name_en: "Artemisia I of Caria", name_ar: "أرتيميسيا الأولى الكارية",
      bio_en: "Queen and naval commander (5th century BC). Fought as Persian admiral at Salamis (480 BC); Xerxes praised her as his bravest captain.",
      bio_ar: "ملكة وقائدة بحرية (القرن الخامس ق.م). قاتلت كأميرال فارسي في سلاميس (480 ق.م)، وأشاد بها زركسيس بوصفها أشجع قادته." },
    { name_en: "Telesilla of Argos", name_ar: "تيليسيلا الأرغوسية",
      bio_en: "Greek poet and warrior (c. 510 BC). Rallied the women of Argos to defend the city after its men were slaughtered, repelling the Spartan invasion.",
      bio_ar: "شاعرة ومحاربة يونانية (نحو 510 ق.م). حشدت نساء أرغوس للدفاع عن المدينة بعد مقتل رجالها، فردّت الغزو الإسبرطي." },
    { name_en: "Cynane", name_ar: "كينان",
      bio_en: "Macedonian princess (c. 357–323 BC). Half-sister of Alexander, she was a trained warrior who personally killed an Illyrian queen in single combat.",
      bio_ar: "أميرة مقدونية (نحو 357–323 ق.م). أخت الإسكندر غير الشقيقة، محاربة مدرَّبة قتلت ملكة إيليرية في مبارزة فردية." },
  ],
  "Greek|scholar|male": [
    { name_en: "Aristotle", name_ar: "أرسطو",
      bio_en: "Philosopher and polymath (384–322 BC). Tutor of Alexander, founder of the Lyceum, author of foundational works on logic, ethics, and biology.",
      bio_ar: "فيلسوف وعالم موسوعي (384–322 ق.م). معلّم الإسكندر، مؤسس الليسيوم، وكاتب مؤلفات رائدة في المنطق والأخلاق والأحياء." },
    { name_en: "Archimedes", name_ar: "أرخميدس",
      bio_en: "Mathematician and engineer of Syracuse (287–212 BC). Calculated π with stunning accuracy, founded hydrostatics, and invented war machines.",
      bio_ar: "عالم رياضيات ومهندس من سيراقوسة (287–212 ق.م). حسب π بدقة مذهلة، وأسّس علم الموائع، واخترع آلات حربية." },
    { name_en: "Euclid", name_ar: "إقليدس",
      bio_en: "Mathematician of Alexandria (c. 300 BC). His 'Elements' was the world's main mathematics textbook for over 2,000 years.",
      bio_ar: "عالم رياضيات من الإسكندرية (نحو 300 ق.م). ظلّ كتابه «العناصر» المرجع الرئيسي للرياضيات في العالم لأكثر من ألفي عام." },
    { name_en: "Plato", name_ar: "أفلاطون",
      bio_en: "Athenian philosopher (c. 428–348 BC). Founded the Academy, wrote the Republic, and shaped Western philosophy through the dialogues of Socrates.",
      bio_ar: "فيلسوف أثيني (نحو 428–348 ق.م). أسّس الأكاديمية، وكتب «الجمهورية»، وشكّل الفلسفة الغربية عبر حوارات سقراط." },
    { name_en: "Socrates", name_ar: "سقراط",
      bio_en: "Athenian philosopher (c. 470–399 BC). Father of Western ethical philosophy and inventor of the Socratic method of inquiry.",
      bio_ar: "فيلسوف أثيني (نحو 470–399 ق.م). أبو الفلسفة الأخلاقية الغربية، ومخترع المنهج السقراطي في الحوار." },
    { name_en: "Pythagoras", name_ar: "فيثاغورس",
      bio_en: "Mathematician and mystic (c. 570–495 BC). Founded a brotherhood of philosophers and gave us the famous theorem on right triangles.",
      bio_ar: "عالم رياضيات وفيلسوف (نحو 570–495 ق.م). أسّس أخوية من الفلاسفة، وأعطانا نظريته الشهيرة في المثلثات القائمة." },
    { name_en: "Hippocrates", name_ar: "أبقراط",
      bio_en: "Physician of Cos (c. 460–370 BC). Father of medicine; his ethical oath still guides doctors today.",
      bio_ar: "طبيب من جزيرة قوس (نحو 460–370 ق.م). أبو الطب، ولا يزال قَسَمه الأخلاقي يوجّه الأطباء حتى اليوم." },
    { name_en: "Thales of Miletus", name_ar: "طاليس الميليسي",
      bio_en: "First philosopher of Greek tradition (c. 624–546 BC). Predicted a solar eclipse in 585 BC and is counted among the Seven Sages.",
      bio_ar: "أوّل فلاسفة التراث اليوناني (نحو 624–546 ق.م). تنبّأ بكسوف الشمس عام 585 ق.م، ويُعدّ من «الحكماء السبعة»." },
    { name_en: "Anaximander", name_ar: "أناكسيمندر",
      bio_en: "Pre-Socratic philosopher (c. 610–546 BC). Drew the first map of the known world and proposed the concept of the boundless 'apeiron'.",
      bio_ar: "فيلسوف ما قبل سقراط (نحو 610–546 ق.م). رسم أوّل خريطة للعالم المعروف، وطرح مفهوم «الأبيرون» اللامحدود." },
    { name_en: "Democritus", name_ar: "ديموقريطس",
      bio_en: "Philosopher (c. 460–370 BC). Co-founder of atomism — the theory that all matter is made of tiny indivisible particles.",
      bio_ar: "فيلسوف (نحو 460–370 ق.م). شارك في تأسيس النظرية الذرية القائلة إن كل المادة مكوَّنة من جسيمات دقيقة لا تتجزأ." },
    { name_en: "Heraclitus", name_ar: "هيراقليطس",
      bio_en: "Ephesian philosopher (c. 535–475 BC). Famous for the doctrine that 'everything flows' and the unity of opposites.",
      bio_ar: "فيلسوف من أفسس (نحو 535–475 ق.م). اشتهر بمقولته «كلّ شيء يتدفّق» وبوحدة الأضداد." },
    { name_en: "Herodotus", name_ar: "هيرودوت",
      bio_en: "Father of History (c. 484–425 BC). His 'Histories' chronicled the Greco-Persian Wars and invented the discipline of historical inquiry.",
      bio_ar: "أبو التاريخ (نحو 484–425 ق.م). دوّن في «التواريخ» الحروب اليونانية الفارسية، وأسّس علم التاريخ." },
    { name_en: "Thucydides", name_ar: "ثوكيديدس",
      bio_en: "Athenian historian (c. 460–400 BC). His 'History of the Peloponnesian War' set the standard for rigorous, evidence-based history writing.",
      bio_ar: "مؤرخ أثيني (نحو 460–400 ق.م). أرسى كتابه «تاريخ الحرب البيلوبونيسية» معايير الكتابة التاريخية الدقيقة المبنية على الأدلة." },
    { name_en: "Eratosthenes (Greek)", name_ar: "إراتوستينيس اليوناني",
      bio_en: "Polymath (276–194 BC). Chief librarian at Alexandria; first to calculate the Earth's circumference and prime number sieve.",
      bio_ar: "عالم موسوعي (276–194 ق.م). أمين مكتبة الإسكندرية الرئيس، وأوّل من حسب محيط الأرض وابتكر «غربال إراتوستينيس»." },
    { name_en: "Hipparchus", name_ar: "هيباركوس",
      bio_en: "Astronomer (c. 190–120 BC). Discovered the precession of the equinoxes and compiled the first comprehensive star catalog.",
      bio_ar: "فلكي (نحو 190–120 ق.م). اكتشف التبدُّر الإحداثي للاعتدالين، وجمع أوّل فهرس شامل للنجوم." },
    { name_en: "Ptolemy (Claudius)", name_ar: "بطليموس القلوذي",
      bio_en: "Alexandrian astronomer-geographer (c. 100–170 AD). His Almagest dominated astronomy for 1,400 years and his Geographia mapped the known world.",
      bio_ar: "فلكي وجغرافي سكندري (نحو 100–170 م). هيمن كتابه «المجسطي» على علم الفلك أربعة عشر قرنًا، ورسم في «الجغرافيا» العالم المعروف." },
    { name_en: "Galen", name_ar: "جالينوس",
      bio_en: "Greek physician (129–216 AD). His anatomical and medical writings shaped European and Islamic medicine for over a millennium.",
      bio_ar: "طبيب يوناني (129–216 م). شكّلت كتاباته في التشريح والطب علم الطب الأوروبي والإسلامي لأكثر من ألف عام." },
  ],
  "Greek|scholar|female": [
    { name_en: "Hypatia of Alexandria", name_ar: "هيباتيا السكندرية",
      bio_en: "Mathematician, astronomer, philosopher (c. 360–415 AD). Head of the Platonic school of Alexandria.",
      bio_ar: "عالمة رياضيات وفلكية وفيلسوفة (نحو 360–415 م). رأست المدرسة الأفلاطونية في الإسكندرية." },
    { name_en: "Aspasia of Miletus", name_ar: "أسباسيا الميليسية",
      bio_en: "Athenian intellectual (c. 470–400 BC). Companion of Pericles; her salon hosted Socrates and shaped Athenian rhetoric.",
      bio_ar: "مفكّرة أثينية (نحو 470–400 ق.م). رفيقة بريكليس، استضاف صالونها سقراط وأثّر في فنّ الخطابة الأثيني." },
    { name_en: "Theano", name_ar: "ثيانو",
      bio_en: "Pythagorean philosopher (6th century BC). Wife of Pythagoras and author of treatises on cosmology, virtue, and the female condition.",
      bio_ar: "فيلسوفة فيثاغورية (القرن السادس ق.م). زوجة فيثاغورس، وصاحبة رسائل في الكون والفضيلة وأحوال المرأة." },
    { name_en: "Diotima of Mantinea", name_ar: "ديوتيما المنتينية",
      bio_en: "Philosopher (5th century BC). Cited by Socrates in Plato's Symposium as his teacher on the nature of love.",
      bio_ar: "فيلسوفة (القرن الخامس ق.م). ذكرها سقراط في «المأدبة» لأفلاطون بوصفها معلّمته في طبيعة الحبّ." },
    { name_en: "Arete of Cyrene", name_ar: "أريتي القورينية",
      bio_en: "Cyrenaic philosopher (c. 5th–4th century BC). Daughter of Aristippus, she taught natural philosophy and ethics for thirty-five years.",
      bio_ar: "فيلسوفة قورينية (نحو القرن الخامس والرابع ق.م). ابنة أرستيبوس، درّست الفلسفة الطبيعية والأخلاق خمسةً وثلاثين عامًا." },
  ],
  "Greek|priest|male": [
    { name_en: "Tiresias", name_ar: "تيريسياس",
      bio_en: "Legendary blind prophet of Apollo at Thebes. Counsellor to kings from Cadmus to Oedipus across multiple Greek myths.",
      bio_ar: "العرّاف الأعمى الأسطوري لأبولو في طيبة. مستشار الملوك من قدموس إلى أوديب في أساطير يونانية عديدة." },
    { name_en: "Calchas", name_ar: "كالخاس",
      bio_en: "Mythic seer (12th century BC). Chief soothsayer of the Greek army at Troy, interpreting omens for Agamemnon throughout the Iliad.",
      bio_ar: "عرّاف أسطوري (القرن الثاني عشر ق.م). كبير عرّافي الجيش اليوناني في طروادة، وفسّر الإشارات لأغاممنون في الإلياذة." },
    { name_en: "Melampus", name_ar: "ميلامبوس",
      bio_en: "Legendary priest-physician. Mythic founder of Greek medicine and prophecy, said to understand the language of animals.",
      bio_ar: "كاهن وطبيب أسطوري. مؤسس الطب والعرافة في الأساطير اليونانية، يُقال إنه كان يفهم لغة الحيوانات." },
  ],
  "Greek|priest|female": [
    { name_en: "Pythia of Delphi", name_ar: "بيثيا كاهنة دلفي",
      bio_en: "High priestess of Apollo at Delphi. For nearly a thousand years, kings and generals sought her cryptic prophecies.",
      bio_ar: "كبيرة كاهنات أبولو في دلفي. على مدى ألف عام تقريبًا، قصدها الملوك والقادة طلبًا لنبوءاتها الغامضة." },
    { name_en: "Phemonoe", name_ar: "فيمونوي",
      bio_en: "Earliest named Pythia of Delphi (legendary). Said to have invented the hexameter verse used by the oracle.",
      bio_ar: "أقدم بيثيا معروفة بالاسم في دلفي (أسطورية). يُقال إنها ابتكرت الوزن السداسي الذي استخدمته الكاهنة." },
    { name_en: "Themistoclea", name_ar: "ثيميستوكليا",
      bio_en: "Delphic priestess (6th century BC). Reputed teacher of Pythagoras in moral philosophy.",
      bio_ar: "كاهنة دلفية (القرن السادس ق.م). يُذكر أنها معلّمة فيثاغورس في الفلسفة الأخلاقية." },
  ],
  "Greek|artist|male": [
    { name_en: "Homer", name_ar: "هوميروس",
      bio_en: "Legendary poet (c. 8th century BC). Composer of the Iliad and the Odyssey — the foundational epics of Western literature.",
      bio_ar: "الشاعر الأسطوري (نحو القرن الثامن ق.م). ناظم الإلياذة والأوديسة — الملحمتان المؤسستان للأدب الغربي." },
    { name_en: "Hesiod", name_ar: "هزيود",
      bio_en: "Boeotian poet (c. 700 BC). Author of Theogony and Works and Days, the foundational Greek poems on the gods and on rural ethics.",
      bio_ar: "شاعر بيوتي (نحو 700 ق.م). صاحب «ثيوغونيا» و«الأعمال والأيام»، القصيدتين المؤسستين عن الآلهة والأخلاق الريفية." },
    { name_en: "Aeschylus", name_ar: "إسخيلوس",
      bio_en: "Athenian playwright (c. 525–456 BC). 'Father of tragedy' who introduced the second actor and wrote the Oresteia trilogy.",
      bio_ar: "كاتب مسرحي أثيني (نحو 525–456 ق.م). «أبو التراجيديا»، أدخل الممثل الثاني وكتب ثلاثية «الأوريستيا»." },
    { name_en: "Sophocles", name_ar: "سوفوكليس",
      bio_en: "Athenian tragedian (c. 497–406 BC). Wrote Oedipus Rex and Antigone, perfecting the form of Greek tragedy.",
      bio_ar: "تراجيدي أثيني (نحو 497–406 ق.م). كتب «أوديب ملكًا» و«أنتيجوني»، فأكمل شكل التراجيديا اليونانية." },
    { name_en: "Euripides", name_ar: "يوربيديس",
      bio_en: "Athenian tragedian (c. 480–406 BC). Innovator who gave voice to women, slaves, and the marginalized in works like Medea and the Bacchae.",
      bio_ar: "تراجيدي أثيني (نحو 480–406 ق.م). مبتكر أعطى صوتًا للنساء والعبيد والمهمَّشين في «ميديا» و«الباخوسيات»." },
    { name_en: "Aristophanes", name_ar: "أريستوفانيس",
      bio_en: "Athenian comic playwright (c. 446–386 BC). Master of Old Comedy and political satire in works like The Clouds and Lysistrata.",
      bio_ar: "كاتب كوميدي أثيني (نحو 446–386 ق.م). أستاذ الكوميديا القديمة والسخرية السياسية في «السحب» و«ليسيستراتا»." },
    { name_en: "Pindar", name_ar: "بندار",
      bio_en: "Theban lyric poet (c. 518–438 BC). Greatest composer of choral odes celebrating Olympic victors and the gods.",
      bio_ar: "شاعر غنائي طيبي (نحو 518–438 ق.م). أعظم ناظمي القصائد الكورالية احتفاءً بأبطال الألعاب الأولمبية والآلهة." },
    { name_en: "Phidias", name_ar: "فيدياس",
      bio_en: "Athenian sculptor (c. 480–430 BC). Designed the Parthenon's friezes and the colossal gold-ivory Statue of Zeus, a Wonder of the World.",
      bio_ar: "نحات أثيني (نحو 480–430 ق.م). صمّم زخارف البارثينون وتمثال زيوس الضخم من الذهب والعاج، إحدى عجائب الدنيا." },
    { name_en: "Praxiteles", name_ar: "براكسيتيليس",
      bio_en: "Athenian sculptor (4th century BC). Pioneered the sensuous, lifelike marble nude with his Aphrodite of Knidos.",
      bio_ar: "نحات أثيني (القرن الرابع ق.م). ابتكر النحت الرخامي الحيّ الحسيّ في تمثال «أفروديت الكنيدية»." },
    { name_en: "Polykleitos", name_ar: "بوليكليتوس",
      bio_en: "Sculptor of Argos (5th century BC). Created the canon of ideal human proportions illustrated by his Doryphoros statue.",
      bio_ar: "نحات من أرغوس (القرن الخامس ق.م). وضع قانون النِّسب المثالية للجسد البشري ممثَّلاً في تمثاله «دوريفوروس» (حامل الرمح)." },
    { name_en: "Apelles", name_ar: "أبيليس",
      bio_en: "Greek painter (4th century BC). Court painter of Alexander the Great, considered the greatest painter of antiquity.",
      bio_ar: "رسّام يوناني (القرن الرابع ق.م). رسّام بلاط الإسكندر الأكبر، ويُعدّ أعظم رسّامي العصور القديمة." },
    { name_en: "Menander", name_ar: "ميناندر",
      bio_en: "Athenian comic playwright (c. 342–291 BC). Master of New Comedy whose witty plays inspired Roman comedy and the modern sitcom.",
      bio_ar: "كاتب كوميدي أثيني (نحو 342–291 ق.م). أستاذ الكوميديا الجديدة، ألهمت مسرحياته الذكية الكوميديا الرومانية وسيتكوم العصر الحديث." },
  ],
  "Greek|artist|female": [
    { name_en: "Sappho", name_ar: "سافو",
      bio_en: "Lyric poet of Lesbos (c. 630–570 BC). Plato called her 'the tenth Muse'; her intimate verses on love shaped Western lyric poetry.",
      bio_ar: "شاعرة غنائية من ليسبوس (نحو 630–570 ق.م). لقّبها أفلاطون بـ«الأوزة العاشرة»، وشكّلت أبياتها الحميمة في الحبّ الشعرَ الغنائي الغربي." },
    { name_en: "Corinna", name_ar: "كورينا",
      bio_en: "Boeotian poet (c. 5th century BC). Renowned lyric poet said to have defeated Pindar five times in poetry contests.",
      bio_ar: "شاعرة بيوتية (نحو القرن الخامس ق.م). شاعرة غنائية مرموقة، يُقال إنها هزمت بندار خمس مرات في مسابقات الشعر." },
    { name_en: "Praxilla", name_ar: "براكسيلا",
      bio_en: "Sicyonian lyric poet (5th century BC). One of the celebrated 'Nine Lyric Poets' canon, known for drinking songs and hymns.",
      bio_ar: "شاعرة غنائية من سيكيون (القرن الخامس ق.م). من «الشعراء الغنائيين التسعة»، اشتُهرت بأناشيد الخمر والترانيم." },
    { name_en: "Erinna", name_ar: "إرينّا",
      bio_en: "Lesbian poet (4th century BC). Author of 'The Distaff', a lament for a friend that ranked her with Sappho among ancient poets.",
      bio_ar: "شاعرة من ليسبوس (القرن الرابع ق.م). صاحبة قصيدة «المغزل» في رثاء صديقتها، جعلتها تُذكر مع سافو." },
    { name_en: "Anyte of Tegea", name_ar: "أنيتي التيغية",
      bio_en: "Hellenistic poet (c. 300 BC). Pioneer of the pastoral epigram, with twenty-four poems preserved in the Greek Anthology.",
      bio_ar: "شاعرة هلنستية (نحو 300 ق.م). رائدة في النقش الرعوي، حُفظت لها أربعة وعشرون قصيدة في «الأنطولوجيا اليونانية»." },
  ],
  "Greek|craftsman|male": [
    { name_en: "Daedalus", name_ar: "ديدالوس",
      bio_en: "Legendary master craftsman of Athens. Mythical inventor and architect who built the Cretan Labyrinth and crafted wings of wax and feathers.",
      bio_ar: "حِرَفي أسطوري من أثينا. مخترع ومهندس بنى متاهة كريت، وصنع أجنحة من الشمع والريش." },
    { name_en: "Iktinos", name_ar: "إكتينوس",
      bio_en: "Athenian architect (5th century BC). Co-designer of the Parthenon — the most influential building of the Classical Greek world.",
      bio_ar: "مهندس معماري أثيني (القرن الخامس ق.م). شارك في تصميم البارثينون، أكثر مباني العصر اليوناني الكلاسيكي تأثيرًا." },
    { name_en: "Kallikrates", name_ar: "كاليكراتيس",
      bio_en: "Athenian architect (5th century BC). Co-architect of the Parthenon and designer of the elegant Temple of Athena Nike.",
      bio_ar: "مهندس معماري أثيني (القرن الخامس ق.م). شارك في تصميم البارثينون، وصمّم معبد أثينا نيكي الأنيق." },
    { name_en: "Hippodamus of Miletus", name_ar: "هيبوداموس الميليسي",
      bio_en: "Architect and urban planner (5th century BC). Father of city planning; his grid plan shaped Piraeus and many later cities.",
      bio_ar: "مهندس ومخطّط مدن (القرن الخامس ق.م). أبو تخطيط المدن، وضع المخطط الشبكي لمدينة بيريوس وعدد من المدن اللاحقة." },
    { name_en: "Polyclitus the Younger", name_ar: "بوليكليتوس الأصغر",
      bio_en: "Architect (4th century BC). Designed the Theatre of Epidaurus, famous for its perfect acoustics that still astonish visitors today.",
      bio_ar: "مهندس معماري (القرن الرابع ق.م). صمّم مسرح إبيدوروس، الشهير بصوتياته المثالية التي لا تزال تذهل الزوار." },
  ],
  "Greek|craftsman|female": [
    { name_en: "Helena of Egypt", name_ar: "هيلينا المصرية",
      bio_en: "Greek painter (4th century BC). Painted 'The Battle of Issus' depicting Alexander's victory; her work influenced the famed Pompeii mosaic.",
      bio_ar: "رسّامة يونانية (القرن الرابع ق.م). رسمت «معركة إيسوس» التي تصوّر انتصار الإسكندر، وأثّرت أعمالها على فسيفساء بومبي الشهيرة." },
    { name_en: "Eirene (painter)", name_ar: "إيريني الرسامة",
      bio_en: "Greek painter (c. 200 BC). Recorded by Pliny the Elder among the few female painters of antiquity, known for portrait of Alcisthenes.",
      bio_ar: "رسّامة يونانية (نحو 200 ق.م). ذكرها بلينيوس الأكبر بين الرسّامات النادرات في العصور القديمة، اشتُهرت بصورة ألكيستينيس." },
  ],
  "Greek|explorer|male": [
    { name_en: "Pytheas of Massalia", name_ar: "بيثياس الماساليّ",
      bio_en: "Greek geographer (c. 350–285 BC). First Mediterranean explorer to circle Britain and reach Arctic 'Thule', recording the midnight sun.",
      bio_ar: "جغرافي يوناني (نحو 350–285 ق.م). أوّل مستكشف متوسّطي يدور حول بريطانيا ويبلغ «ثول» القطبية، ودوّن «شمس منتصف الليل»." },
    { name_en: "Nearchus", name_ar: "نياركوس",
      bio_en: "Cretan-Macedonian admiral (c. 360–300 BC). Led Alexander's fleet from the Indus delta to the Persian Gulf, opening sea routes to India.",
      bio_ar: "أميرال كريتي-مقدوني (نحو 360–300 ق.م). قاد أسطول الإسكندر من دلتا السند إلى الخليج الفارسي، وفتح طرق البحر إلى الهند." },
    { name_en: "Hanno the Navigator", name_ar: "هانون الملاح",
      bio_en: "(Greek-recorded) Carthaginian explorer (5th century BC). His voyage along West Africa was preserved by later Greek geographers.",
      bio_ar: "(دوّنه اليونان) مستكشف قرطاجي (القرن الخامس ق.م). حفظ الجغرافيون اليونانيون لاحقًا روايته عن رحلته على ساحل غرب أفريقيا." },
    { name_en: "Scylax of Caryanda", name_ar: "سكيلاكس الكاريندي",
      bio_en: "Greek explorer (6th century BC). Sailed the Indus to the Red Sea on Darius I's commission, the first Greek to map this route.",
      bio_ar: "مستكشف يوناني (القرن السادس ق.م). أبحر من نهر السند إلى البحر الأحمر بتكليف من داريوش الأوّل، وكان أوّل يوناني يرسم هذا الطريق." },
  ],
  "Greek|noble|male": [
    { name_en: "Solon", name_ar: "صولون",
      bio_en: "Athenian statesman (c. 638–558 BC). One of the Seven Sages; his constitutional reforms laid the foundation of Athenian democracy.",
      bio_ar: "زعيم أثيني (نحو 638–558 ق.م). من الحكماء السبعة، أرست إصلاحاته الدستورية أسس الديمقراطية الأثينية." },
    { name_en: "Cleisthenes", name_ar: "كليستينيس",
      bio_en: "Athenian reformer (c. 570–508 BC). Father of Athenian democracy whose reorganization of the tribes broke aristocratic power.",
      bio_ar: "مصلح أثيني (نحو 570–508 ق.م). أبو الديمقراطية الأثينية، حطّمت إعادة تنظيمه للقبائل سلطة الأرستقراطية." },
    { name_en: "Lycurgus of Sparta", name_ar: "ليكورغوس الإسبرطي",
      bio_en: "Legendary Spartan lawgiver (c. 9th century BC). Credited with the militaristic constitution and equality among Spartan citizens.",
      bio_ar: "مشرّع إسبرطي أسطوري (نحو القرن التاسع ق.م). يُنسب إليه الدستور العسكري والمساواة بين مواطني إسبرطة." },
    { name_en: "Demosthenes", name_ar: "ديموسثينيس",
      bio_en: "Athenian orator (384–322 BC). The greatest of Greek orators; his Philippics rallied Athens against Philip II of Macedon.",
      bio_ar: "خطيب أثيني (384–322 ق.م). أعظم خطباء اليونان، حشدت خطبه «الفيليبية» أثينا ضد فيليب الثاني المقدوني." },
    { name_en: "Pittacus of Mytilene", name_ar: "بيتاكوس الميتيليني",
      bio_en: "Statesman (c. 640–568 BC). One of the Seven Sages; ruled Mytilene wisely and gave us the proverb 'Know the right moment'.",
      bio_ar: "رجل دولة (نحو 640–568 ق.م). من الحكماء السبعة، حكم ميتيليني بحكمة وأعطانا مقولته «اعرف الوقت المناسب»." },
    { name_en: "Bias of Priene", name_ar: "بياس البريني",
      bio_en: "Statesman (6th century BC). One of the Seven Sages, famed for his maxim 'All my belongings I carry with me'.",
      bio_ar: "رجل دولة (القرن السادس ق.م). من الحكماء السبعة، اشتُهر بمقولته «كلّ ما أملك أحمله معي»." },
    { name_en: "Chilon of Sparta", name_ar: "خيلون الإسبرطي",
      bio_en: "Ephor of Sparta (6th century BC). One of the Seven Sages, who originated the inscription 'Know thyself' at Delphi.",
      bio_ar: "إفور إسبرطي (القرن السادس ق.م). من الحكماء السبعة، يُنسب إليه نقش «اعرف نفسك» في دلفي." },
  ],
  "Greek|noble|female": [
    { name_en: "Phryne", name_ar: "فريني",
      bio_en: "Athenian hetaira (4th century BC). Famous for her beauty and wit, she modeled for Praxiteles' Aphrodite of Knidos.",
      bio_ar: "هيتايرا أثينية (القرن الرابع ق.م). اشتهرت بجمالها وذكائها، وكانت موديل تمثال «أفروديت الكنيدية» لبراكسيتيليس." },
    { name_en: "Aspasia (noble)", name_ar: "أسباسيا (النبيلة)",
      bio_en: "Athenian socialite (5th century BC). Companion of Pericles; her salon was the intellectual heart of Periclean Athens.",
      bio_ar: "نبيلة أثينية (القرن الخامس ق.م). رفيقة بريكليس، وكان صالونها قلب أثينا الفكري في عصره." },
  ],
  // ===== Persian =====
  "Persian|royalty|male": [
    { name_en: "Cyrus the Great", name_ar: "كورش الأكبر",
      bio_en: "Founder of the Achaemenid Empire (c. 600–530 BC). Built history's first true world empire and freed the Babylonian Jews; the Cyrus Cylinder is often called the first charter of human rights.",
      bio_ar: "مؤسس الإمبراطورية الأخمينية (نحو 600–530 ق.م). بنى أوّل إمبراطورية عالمية، وحرّر يهود بابل، وأصدر «أسطوانة كورش»، أوّل ميثاق لحقوق الإنسان." },
    { name_en: "Darius the Great", name_ar: "داريوش الأكبر",
      bio_en: "King of Kings (522–486 BC). Organized the empire into satrapies, built the Royal Road, standardized coinage, and constructed Persepolis.",
      bio_ar: "ملك الملوك (522–486 ق.م). نظّم الإمبراطورية في مرزبانيات، وشقّ «الطريق الملكي»، ووحّد العملة، وشيّد برسبوليس." },
    { name_en: "Xerxes I", name_ar: "زركسيس الأول",
      bio_en: "Achaemenid emperor (486–465 BC). Led the largest invasion of Greece in antiquity and completed Persepolis.",
      bio_ar: "إمبراطور أخميني (486–465 ق.م). قاد أكبر غزو لليونان في العصور القديمة، وأكمل بناء برسبوليس." },
    { name_en: "Cambyses II", name_ar: "قمبيز الثاني",
      bio_en: "Achaemenid king (530–522 BC). Conquered Egypt at the Battle of Pelusium, becoming the first Persian Pharaoh.",
      bio_ar: "ملك أخميني (530–522 ق.م). فتح مصر في معركة بيلوزيون، وصار أوّل فرعون فارسي." },
    { name_en: "Artaxerxes I", name_ar: "أردشير الأول",
      bio_en: "Achaemenid king (465–424 BC). Stabilized the empire after Xerxes' assassination and signed the Peace of Callias with Athens.",
      bio_ar: "ملك أخميني (465–424 ق.م). ثبّت الإمبراطورية بعد اغتيال زركسيس، ووقّع «صلح كاليّاس» مع أثينا." },
    { name_en: "Artaxerxes II", name_ar: "أردشير الثاني",
      bio_en: "Longest-reigning Achaemenid king (404–358 BC). Defeated the rebellion of his brother Cyrus the Younger at Cunaxa.",
      bio_ar: "أطول الملوك الأخمينيين حكمًا (404–358 ق.م). هزم تمرّد أخيه كورش الأصغر في معركة كوناكسا." },
    { name_en: "Ardashir I", name_ar: "أردشير الأوّل",
      bio_en: "Founder of the Sasanian Empire (224–242 AD). Overthrew the Parthians and established a new Persian world power for four centuries.",
      bio_ar: "مؤسس الإمبراطورية الساسانية (224–242 م). أطاح بالبارثيين وأسّس قوة فارسية عالمية جديدة دامت أربعة قرون." },
    { name_en: "Shapur I", name_ar: "شابور الأوّل",
      bio_en: "Sasanian king (240–270 AD). Defeated three Roman emperors, including capturing Valerian alive — a unique humiliation in Roman history.",
      bio_ar: "ملك ساساني (240–270 م). هزم ثلاثة أباطرة رومان، وأسر فاليريان حيًّا — حدث فريد في التاريخ الروماني." },
    { name_en: "Khosrow I Anushirvan", name_ar: "كسرى الأول أنوشروان",
      bio_en: "Sasanian king (531–579 AD). 'The Just' — patron of arts and sciences who reformed taxation and welcomed Greek philosophers.",
      bio_ar: "ملك ساساني (531–579 م). «العادل» — راعٍ للفنون والعلوم، أصلح الضرائب ورحّب بالفلاسفة اليونان." },
    { name_en: "Khosrow II Parviz", name_ar: "كسرى الثاني برويز",
      bio_en: "Sasanian king (590–628 AD). Built the empire to its greatest extent, briefly reconquering Egypt, Anatolia, and the Levant.",
      bio_ar: "ملك ساساني (590–628 م). وسّع الإمبراطورية إلى أقصاها، واستعاد مصر والأناضول وبلاد الشام لفترة قصيرة." },
    { name_en: "Yazdegerd I", name_ar: "يزدجرد الأوّل",
      bio_en: "Sasanian king (399–420 AD). Welcomed Christians, ended their persecution, and was nicknamed 'the Sinner' by Zoroastrian priests for his tolerance.",
      bio_ar: "ملك ساساني (399–420 م). رحّب بالمسيحيين وأنهى اضطهادهم، فلقّبه الكهنة الزرادشتيون بـ«الآثم» بسبب تسامحه." },
    { name_en: "Bahram V", name_ar: "بهرام الخامس",
      bio_en: "Sasanian king (420–438 AD). Folk-hero ruler 'Bahram-e Gur', celebrated in Persian poetry for his hunts and chivalry.",
      bio_ar: "ملك ساساني (420–438 م). البطل الشعبي «بهرام جور»، احتفت به الأشعار الفارسية بصيده وفروسيته." },
    { name_en: "Nader Shah", name_ar: "نادر شاه",
      bio_en: "Founder of the Afsharid dynasty (1736–1747). Brilliant general who restored Persian power, conquered Mughal Delhi and seized the Peacock Throne.",
      bio_ar: "مؤسس السلالة الأفشارية (1736–1747). قائد بارع أعاد قوة فارس، وفتح دلهي المغولية، واستولى على «عرش الطاووس»." },
    { name_en: "Shah Abbas the Great", name_ar: "الشاه عباس الأكبر",
      bio_en: "Safavid king (1588–1629). Made Isfahan a capital of breathtaking beauty and broke Ottoman and Uzbek power.",
      bio_ar: "ملك صفوي (1588–1629). جعل أصفهان عاصمة باهرة الجمال، وكسر قوة العثمانيين والأوزبك." },
  ],
  "Persian|royalty|female": [
    { name_en: "Atossa", name_ar: "أتوسا",
      bio_en: "Achaemenid queen (c. 550–475 BC). Daughter of Cyrus and mother of Xerxes; her counsel shaped imperial policy across three reigns.",
      bio_ar: "ملكة أخمينية (نحو 550–475 ق.م). ابنة كورش وأمّ زركسيس، شكّلت مشورتها سياسة الإمبراطورية في ثلاث فترات حكم." },
    { name_en: "Pantea Arteshbod", name_ar: "بانتيا أرتيشبد",
      bio_en: "Achaemenid commander (6th century BC). Wife of general Aryasb and one of the leaders of Cyrus' elite Immortals.",
      bio_ar: "قائدة أخمينية (القرن السادس ق.م). زوجة القائد أرياسب وإحدى قيادات «الخالدين» النخبة لدى كورش." },
    { name_en: "Roxana", name_ar: "روكسانا",
      bio_en: "Bactrian princess (c. 340–310 BC). Wife of Alexander the Great and mother of Alexander IV, mother of the last Argead heir.",
      bio_ar: "أميرة بلخية (نحو 340–310 ق.م). زوجة الإسكندر الأكبر وأمّ الإسكندر الرابع، وآخر وريث للسلالة الأرغية." },
    { name_en: "Stateira II", name_ar: "ستاتيرا الثانية",
      bio_en: "Persian princess (c. 350–323 BC). Daughter of Darius III and bride of Alexander at the mass Susa weddings unifying Greek and Persian elites.",
      bio_ar: "أميرة فارسية (نحو 350–323 ق.م). ابنة داريوش الثالث، تزوّجها الإسكندر في «أعراس سوسة» الجماعية لتوحيد النخب اليونانية والفارسية." },
    { name_en: "Boran", name_ar: "بوران",
      bio_en: "Sasanian queen (629–630 AD). First woman to rule the Sasanian Empire; signed peace with Byzantium and reformed taxes.",
      bio_ar: "ملكة ساسانية (629–630 م). أوّل امرأة تحكم الإمبراطورية الساسانية، وقّعت السلام مع بيزنطة وأصلحت الضرائب." },
    { name_en: "Azarmidokht", name_ar: "آزرميدخت",
      bio_en: "Sasanian queen (630–631 AD). Sister of Boran and second Sasanian queen-regnant in a year of remarkable female rule.",
      bio_ar: "ملكة ساسانية (630–631 م). شقيقة بوران، وثانية ملكة ساسانية حاكمة في عام شهدَ حكم النساء بشكل بارز." },
    { name_en: "Pourandokht", name_ar: "بوراندخت",
      bio_en: "Sasanian princess and royal scholar (7th century AD). Daughter of Khosrow II, remembered for her diplomatic missions.",
      bio_ar: "أميرة ساسانية وعالمة بلاط (القرن السابع م). ابنة كسرى الثاني، تُذكر ببعثاتها الدبلوماسية." },
    { name_en: "Mahin Banu", name_ar: "مهين بانو",
      bio_en: "Safavid princess (1519–1562). Sister of Shah Tahmasp I; influential diplomat and patron of religious foundations.",
      bio_ar: "أميرة صفوية (1519–1562). شقيقة الشاه طهماسب الأوّل، دبلوماسية مؤثّرة وراعية للأوقاف." },
  ],
  "Persian|warrior|male": [
    { name_en: "Mardonius", name_ar: "مردونيوس",
      bio_en: "Persian general and son-in-law of Darius (5th century BC). Commander of the Immortals at Thermopylae and Plataea.",
      bio_ar: "قائد فارسي وصهر داريوش (القرن الخامس ق.م). قاد فرقة «الخالدين» في ثرموبيلاي وبلاتايا." },
    { name_en: "Memnon of Rhodes", name_ar: "ممنون الرودسي",
      bio_en: "Greek-Persian general (c. 380–333 BC). Most effective Persian commander against Alexander, whose early death changed the war.",
      bio_ar: "قائد يوناني فارسي (نحو 380–333 ق.م). أكثر القادة الفرس فاعلية ضد الإسكندر، وغيّر موته المبكر مسار الحرب." },
    { name_en: "Surena", name_ar: "سورينا",
      bio_en: "Parthian general (c. 84–53 BC). Annihilated Crassus and seven Roman legions at Carrhae, one of Rome's worst defeats.",
      bio_ar: "قائد بارثي (نحو 84–53 ق.م). أبادَ كراسوس وسبع فيالق رومانية في معركة حرّان، إحدى أسوأ هزائم روما." },
    { name_en: "Bahram Chobin", name_ar: "بهرام چوبين",
      bio_en: "Sasanian general (d. 591 AD). Defeated Turkic invaders, briefly seized the throne, and remained a Persian folk hero.",
      bio_ar: "قائد ساساني (ت. 591 م). هزم غزاة الأتراك، واستولى على العرش لفترة قصيرة، وبقي بطلًا شعبيًّا فارسيًّا." },
    { name_en: "Rostam Farrokhzad", name_ar: "رستم فرخزاد",
      bio_en: "Sasanian commander-in-chief (d. 636 AD). Led the last great Persian army at Qadisiyya against the Arab conquest.",
      bio_ar: "قائد عام ساساني (ت. 636 م). قاد آخر جيش فارسي عظيم في معركة القادسية في وجه الفتح العربي." },
    { name_en: "Datis", name_ar: "داتيس",
      bio_en: "Median admiral (5th century BC). Co-commander of the Persian invasion that landed at Marathon in 490 BC.",
      bio_ar: "أميرال ميدي (القرن الخامس ق.م). شارك في قيادة الغزو الفارسي الذي رست سفنه عند ماراثون عام 490 ق.م." },
    { name_en: "Artabanus IV", name_ar: "أرتبانوس الرابع",
      bio_en: "Last Parthian king (213–224 AD). Fought the rising Sasanians at the Battle of Hormozdgan, ending the Arsacid line.",
      bio_ar: "آخر ملوك البارثيين (213–224 م). قاتل الساسانيين الصاعدين في معركة هرمزدغان، فانتهت السلالة الأشكانية." },
    { name_en: "Hydarnes", name_ar: "هيدارنيس",
      bio_en: "Persian general (6th century BC). Led the elite Immortals under Darius and Xerxes during the Greek invasions.",
      bio_ar: "قائد فارسي (القرن السادس ق.م). قاد «الخالدين» النخبة في عهد داريوش وزركسيس خلال غزو اليونان." },
    { name_en: "Tiridates I of Armenia", name_ar: "تيرداد الأوّل ملك أرمينيا",
      bio_en: "Parthian-Armenian king (53–88 AD). Founded the Arsacid dynasty in Armenia and traveled to Rome to be crowned by Nero.",
      bio_ar: "ملك بارثي أرمني (53–88 م). أسّس السلالة الأشكانية في أرمينيا، وسافر إلى روما ليتوّجه نيرون." },
  ],
  "Persian|warrior|female": [
    { name_en: "Pantea Arteshbod (warrior)", name_ar: "بانتيا أرتيشبد (المحاربة)",
      bio_en: "Achaemenid commander of the Immortals (6th century BC). Helped Cyrus maintain order in conquered Babylon.",
      bio_ar: "قائدة فارسية في «الخالدين» (القرن السادس ق.م). أعانت كورش على بسط الأمن في بابل بعد فتحها." },
    { name_en: "Apranik", name_ar: "أبرانيك",
      bio_en: "Sasanian commander (7th century AD). Led resistance against the Arab invasion long after Yazdegerd III's defeat.",
      bio_ar: "قائدة ساسانية (القرن السابع م). قادت المقاومة ضد الفتح العربي مدّة طويلة بعد هزيمة يزدجرد الثالث." },
    { name_en: "Azad Deylami", name_ar: "آزاد ديلمي",
      bio_en: "Persian warrior of the Daylamites (7th century AD). Led mountain resistance against the Arab conquest in the Caspian region.",
      bio_ar: "محاربة فارسية من الديلم (القرن السابع م). قادت مقاومة الجبال ضد الفتح العربي في منطقة بحر قزوين." },
  ],
  "Persian|scholar|male": [
    { name_en: "Al-Khwarizmi", name_ar: "الخوارزمي",
      bio_en: "Persian mathematician (c. 780–850 AD). Father of algebra; the word 'algorithm' comes from the Latinization of his name.",
      bio_ar: "عالم رياضيات فارسي (نحو 780–850 م). أبو الجبر، ومصطلح «خوارزمية» مأخوذ من تعريب اسمه." },
    { name_en: "Omar Khayyam", name_ar: "عمر الخيّام",
      bio_en: "Persian polymath (1048–1131). Author of the Rubaiyat and reformer of the Persian calendar to remarkable precision.",
      bio_ar: "عالم وفيلسوف فارسي (1048–1131). صاحب «الرباعيات»، وأصلح التقويم الفارسي بدقة بالغة." },
    { name_en: "Avicenna (Ibn Sina)", name_ar: "ابن سينا",
      bio_en: "Persian polymath (980–1037). Author of the Canon of Medicine — the standard medical textbook in Europe and Asia for six centuries.",
      bio_ar: "عالم موسوعي فارسي (980–1037). صاحب «القانون في الطب»، الكتاب الطبي المعتمد في أوروبا وآسيا ستة قرون." },
    { name_en: "Al-Biruni", name_ar: "البيروني",
      bio_en: "Persian polymath (973–1048). Calculated Earth's radius with stunning accuracy and wrote the foundational study of India.",
      bio_ar: "عالم موسوعي فارسي (973–1048). حسب نصف قطر الأرض بدقة مذهلة، وكتب الدراسة المؤسِّسة عن الهند." },
    { name_en: "Al-Razi (Rhazes)", name_ar: "الرازي",
      bio_en: "Persian physician (854–925). Distinguished smallpox from measles and authored a vast medical encyclopedia, al-Hawi.",
      bio_ar: "طبيب فارسي (854–925). ميّز بين الجدري والحصبة، وألّف الموسوعة الطبية الكبرى «الحاوي»." },
    { name_en: "Ferdowsi", name_ar: "الفردوسي",
      bio_en: "Persian poet (940–1020). Spent thirty-three years composing the Shahnameh — the national epic of Iran in 50,000 verses.",
      bio_ar: "شاعر فارسي (940–1020). أمضى ثلاثة وثلاثين عامًا في نظم «الشاهنامة» — الملحمة الوطنية لإيران في خمسين ألف بيت." },
    { name_en: "Nasir al-Din al-Tusi", name_ar: "نصير الدين الطوسي",
      bio_en: "Persian polymath (1201–1274). Founded the Maragheh observatory and his lunar model influenced Copernicus' astronomy.",
      bio_ar: "عالم موسوعي فارسي (1201–1274). أسّس مرصد مراغة، وأثّر نموذجه القمري في فلك كوبرنيكوس." },
    { name_en: "Al-Farabi", name_ar: "الفارابي",
      bio_en: "Persian-origin philosopher (c. 872–950). 'The Second Teacher' after Aristotle, founder of Islamic Neoplatonism.",
      bio_ar: "فيلسوف من أصل فارسي (نحو 872–950). «المعلم الثاني» بعد أرسطو، ومؤسس الأفلاطونية المحدثة في الفكر الإسلامي." },
    { name_en: "Al-Ghazali", name_ar: "الغزالي",
      bio_en: "Persian theologian-philosopher (1058–1111). His 'Revival of Religious Sciences' reshaped Islamic spirituality and Sufism.",
      bio_ar: "متكلّم وفيلسوف فارسي (1058–1111). أعاد «إحياء علوم الدين» تشكيل الروحانية الإسلامية والتصوّف." },
    { name_en: "Khwaja Nizam al-Mulk", name_ar: "نظام الملك",
      bio_en: "Persian Seljuk vizier (1018–1092). Founded the Nizamiyya schools — the world's first network of state-sponsored universities.",
      bio_ar: "وزير سلجوقي فارسي (1018–1092). أسّس «المدارس النظامية»، أوّل شبكة جامعات تموّلها الدولة في العالم." },
    { name_en: "Sharaf al-Din al-Tusi", name_ar: "شرف الدين الطوسي",
      bio_en: "Persian mathematician (1135–1213). Pioneered cubic equations and the algebra of polynomials.",
      bio_ar: "عالم رياضيات فارسي (1135–1213). رائد في المعادلات التكعيبية وجبر كثيرات الحدود." },
    { name_en: "Al-Khazini", name_ar: "الخازني",
      bio_en: "Persian astronomer-physicist (12th century). His Book of the Balance of Wisdom advanced statics and specific gravity.",
      bio_ar: "فلكي وفيزيائي فارسي (القرن الثاني عشر). طوّر «كتاب ميزان الحكمة» علم الإستاتيكا والكثافة النوعية." },
    { name_en: "Jamshid al-Kashi", name_ar: "جمشيد الكاشي",
      bio_en: "Persian astronomer-mathematician (1380–1429). Calculated π to sixteen decimal places at the Samarkand observatory.",
      bio_ar: "فلكي ورياضي فارسي (1380–1429). حسب π إلى ستة عشر منزلة عشرية في مرصد سمرقند." },
    { name_en: "Ulugh Beg", name_ar: "ألوغ بيك",
      bio_en: "Timurid-Persian sultan-astronomer (1394–1449). Built the great Samarkand observatory and produced the most accurate star catalog of his era.",
      bio_ar: "سلطان وفلكي تيموري فارسي (1394–1449). بنى مرصد سمرقند الكبير، وأنتج أدقّ فهرس نجوم في عصره." },
  ],
  "Persian|scholar|female": [
    { name_en: "Mahsati Ganjavi", name_ar: "مهستي الكنجوية",
      bio_en: "Persian poet of the 12th century. The earliest known female master of the rubaiyat quatrain.",
      bio_ar: "شاعرة فارسية من القرن الثاني عشر. أوّل من برعت من النساء في نظم الرباعيات." },
    { name_en: "Rabia Balkhi", name_ar: "رابعة البلخية",
      bio_en: "Persian poet (10th century). The first known female poet of New Persian literature, celebrated for her tragic love verse.",
      bio_ar: "شاعرة فارسية (القرن العاشر). أوّل شاعرة معروفة في الأدب الفارسي الحديث، اشتُهرت بأبياتها العاطفية المأساوية." },
    { name_en: "Padishah Khatun", name_ar: "بادشاه خاتون",
      bio_en: "Kutlugh-Khanid queen-poet of Kerman (1256–1295). Bilingual poet who composed in Persian and Arabic and ruled Kerman in her own name.",
      bio_ar: "ملكة وشاعرة من القتلغ خانية في كرمان (1256–1295). شاعرة ثنائية اللغة بالفارسية والعربية، وحكمت كرمان باسمها." },
    { name_en: "Jahan Malek Khatun", name_ar: "جهان ملك خاتون",
      bio_en: "Persian princess-poet of the Inju dynasty (c. 1324–1382). Composed over fifteen hundred ghazals, the largest divan by a medieval woman.",
      bio_ar: "أميرة وشاعرة فارسية من الإينجوية (نحو 1324–1382). نظمت أكثر من ألف وخمسمئة غزلية، أكبر ديوان لامرأة في العصر الوسيط." },
  ],
  "Persian|priest|male": [
    { name_en: "Zoroaster (Zarathustra)", name_ar: "زرادشت",
      bio_en: "Iranian prophet (c. 1500–1000 BC). Founder of Zoroastrianism, one of the world's oldest monotheistic religions.",
      bio_ar: "نبيّ إيراني (نحو 1500–1000 ق.م). مؤسس الزرادشتية، إحدى أقدم الديانات التوحيدية في العالم." },
    { name_en: "Mani", name_ar: "ماني",
      bio_en: "Persian prophet (216–274 AD). Founder of Manichaeism, a syncretic religion that spread from Rome to China for 1,400 years.",
      bio_ar: "نبيّ فارسي (216–274 م). مؤسس المانوية، ديانة توفيقية امتدّت من روما إلى الصين أربعة عشر قرنًا." },
    { name_en: "Mazdak", name_ar: "مزدك",
      bio_en: "Persian reformer (d. c. 524 AD). Led a radical egalitarian movement under Sasanian rule advocating shared property and pacifism.",
      bio_ar: "مصلح فارسي (ت. نحو 524 م). قاد حركة مساواة جذرية في عهد الساسانيين دعت إلى المِلكية المشتركة والسلمية." },
    { name_en: "Kartir", name_ar: "كرتير",
      bio_en: "Sasanian Zoroastrian high priest (3rd century AD). Established Zoroastrianism as the state religion and persecuted other faiths.",
      bio_ar: "كبير الكهنة الزرادشتيين الساسانيين (القرن الثالث م). جعل الزرادشتية الدين الرسمي للدولة، واضطهد الأديان الأخرى." },
    { name_en: "Adurbad-i Mahraspandan", name_ar: "آذرباد بن مارسبندان",
      bio_en: "Sasanian priest (4th century AD). Compiled the Avestan canon and underwent the famed ordeal of molten metal to defend orthodoxy.",
      bio_ar: "كاهن ساساني (القرن الرابع م). جمع الكتب الأفستية، وخضع للابتلاء الشهير بالمعدن المنصهر للدفاع عن العقيدة." },
  ],
  "Persian|priest|female": [
    { name_en: "Anahita (priestess tradition)", name_ar: "تقليد كاهنات أناهيتا",
      bio_en: "Anahita's priestesses (Achaemenid era). Served the goddess of waters and fertility at major sanctuaries from Susa to Ecbatana.",
      bio_ar: "كاهنات الإلهة أناهيتا (العصر الأخميني). خدمن إلهة المياه والخصب في معابد كبرى من سوسة إلى إكباتانا." },
    { name_en: "Hutaosa", name_ar: "هوتاوسا",
      bio_en: "Avestan queen (legendary, c. 1500 BC). Wife of Vishtaspa and patron of Zoroaster who helped spread the faith.",
      bio_ar: "ملكة أفستية (أسطورية، نحو 1500 ق.م). زوجة فيشتاسبا وراعية زرادشت، أعانت على نشر الديانة." },
  ],
  "Persian|artist|male": [
    { name_en: "Hafez of Shiraz", name_ar: "حافظ الشيرازي",
      bio_en: "Persian lyric poet (c. 1325–1390). His Divan of ghazals is the pinnacle of Persian literature.",
      bio_ar: "شاعر فارسي غنائي (نحو 1325–1390). يُعدّ ديوانه قمّة الأدب الفارسي." },
    { name_en: "Rumi (Jalal al-Din)", name_ar: "جلال الدين الرومي",
      bio_en: "Persian Sufi poet (1207–1273). His Masnavi is the spiritual masterpiece of Islam and inspired the Mevlevi whirling dervishes.",
      bio_ar: "شاعر فارسي صوفي (1207–1273). «المثنوي» تحفة الإسلام الروحية، وألهم طريقة المولوية والدراويش الراقصين." },
    { name_en: "Saadi Shirazi", name_ar: "سعدي الشيرازي",
      bio_en: "Persian poet (1210–1291). Author of the Bustan and Gulistan; his verse on humanity's shared body adorns the UN building.",
      bio_ar: "شاعر فارسي (1210–1291). صاحب «البستان» و«الكلستان»، وأبياته عن وحدة الجسد الإنساني محفورة في مبنى الأمم المتحدة." },
    { name_en: "Nizami Ganjavi", name_ar: "نظامي الكنجوي",
      bio_en: "Persian romantic poet (1141–1209). Author of the Khamsa, including Layla and Majnun and Khosrow and Shirin.",
      bio_ar: "شاعر فارسي رومانسي (1141–1209). صاحب «الخمسة»، ومنها «ليلى والمجنون» و«خسرو وشيرين»." },
    { name_en: "Attar of Nishapur", name_ar: "فريد الدين العطّار",
      bio_en: "Persian Sufi poet (c. 1145–1221). Author of the Conference of the Birds, the great Sufi allegory of the soul's journey.",
      bio_ar: "شاعر صوفي فارسي (نحو 1145–1221). صاحب «منطق الطير»، الرمزية الصوفية الكبرى لرحلة الروح." },
    { name_en: "Sanai of Ghazni", name_ar: "سنائي الغزنوي",
      bio_en: "Persian poet (c. 1080–1131). Pioneer of Sufi didactic poetry, deeply influencing Rumi.",
      bio_ar: "شاعر فارسي (نحو 1080–1131). رائد الشعر الصوفي التعليمي، أثّر عميقًا في الرومي." },
    { name_en: "Bihzad", name_ar: "بهزاد",
      bio_en: "Persian miniaturist (c. 1450–1535). The greatest master of the Herat school whose paintings define classical Persian art.",
      bio_ar: "رسّام منمنمات فارسي (نحو 1450–1535). أعظم أساتذة مدرسة هرات، تعرِّف لوحاته الفنّ الفارسي الكلاسيكي." },
    { name_en: "Reza Abbasi", name_ar: "رضا عباسي",
      bio_en: "Safavid painter (c. 1565–1635). Court artist of Shah Abbas I and master of single-figure portraiture in Persian art.",
      bio_ar: "رسّام صفوي (نحو 1565–1635). فنّان بلاط الشاه عباس الأوّل، وأستاذ رسم الشخصيات الفردية في الفنّ الفارسي." },
    { name_en: "Anvari", name_ar: "أنوري",
      bio_en: "Persian poet (c. 1126–1189). Master panegyrist whose qasidas were considered unmatched in technical brilliance.",
      bio_ar: "شاعر فارسي (نحو 1126–1189). أستاذ شعر المدح، اعتُبرت قصائده فريدة في براعتها الفنية." },
    { name_en: "Khaqani", name_ar: "الخاقاني",
      bio_en: "Persian poet (1120–1190). Renowned for his complex qasidas and his Christian-themed elegy on the ruins of Ctesiphon.",
      bio_ar: "شاعر فارسي (1120–1190). اشتُهر بقصائده المعقّدة وبمرثيّته على أطلال طيسفون ذات النفحة المسيحية." },
    { name_en: "Manuchehri", name_ar: "المنوچهري",
      bio_en: "Persian court poet (d. 1041). Master of the rhyming musammat form and celebrated nature poet.",
      bio_ar: "شاعر بلاط فارسي (ت. 1041). أستاذ شكل «المسمّط» المقفّى، وشاعر طبيعة بارز." },
    { name_en: "Rudaki", name_ar: "الرودكي",
      bio_en: "First great Persian poet (858–941). Father of Persian poetry; blind court bard of the Samanid kings.",
      bio_ar: "أوّل عمالقة الشعر الفارسي (858–941). أبو الشعر الفارسي، شاعر بلاط الملوك السامانيين الكفيف." },
  ],
  "Persian|artist|female": [
    { name_en: "Lal Ded (Lalla)", name_ar: "لال ديد (لالا)",
      bio_en: "Kashmiri Persian-influenced poet (1320–1392). Mystic Shaiva poet whose Vakhs founded modern Kashmiri literature.",
      bio_ar: "شاعرة كشميرية متأثّرة بالفارسية (1320–1392). شاعرة شَيْفية صوفية، أسّست «الفاكها» الأدب الكشميري الحديث." },
    { name_en: "Tahirih", name_ar: "قُرّة العين (طاهرة)",
      bio_en: "Persian poet and reformer (1814–1852). Babi religious leader who unveiled herself in public to declare a new era for women.",
      bio_ar: "شاعرة ومصلحة فارسية (1814–1852). من قادة البابية، خلعت حجابها علنًا لتعلن عصرًا جديدًا للمرأة." },
    { name_en: "Forough Farrokhzad (modern echo)", name_ar: "صدى فروغ فرخزاد الحديث",
      bio_en: "Modern echo of an ancient Persian voice (1934–1967). Her bold verse links contemporary Persian poetry to the great female mystics of the past.",
      bio_ar: "صدى حديث لصوت فارسي قديم (1934–1967). تربط أبياتها الجريئة الشعر الفارسي المعاصر بكبار الصوفيات في الماضي." },
  ],
  "Persian|craftsman|male": [
    { name_en: "Ustad Ahmad Lahori", name_ar: "أستاذ أحمد اللاهوري",
      bio_en: "Persian-Mughal architect (17th century). Chief architect of the Taj Mahal and many imperial Mughal monuments.",
      bio_ar: "مهندس فارسي مغولي (القرن السابع عشر). كبير مهندسي تاج محل وكثير من المباني المغولية الإمبراطورية." },
    { name_en: "Ali Akbar Isfahani", name_ar: "علي أكبر الإصفهاني",
      bio_en: "Safavid master architect (16th century). Designed the Shah Mosque of Isfahan, an apex of Persian Islamic architecture.",
      bio_ar: "مهندس صفوي بارع (القرن السادس عشر). صمّم «مسجد الشاه» في أصفهان، قمّة العمارة الإسلامية الفارسية." },
    { name_en: "Ostad Isa Shirazi", name_ar: "أستاذ عيسى الشيرازي",
      bio_en: "Persian architect (17th century). Often credited with co-designing the Taj Mahal alongside Lahori.",
      bio_ar: "مهندس فارسي (القرن السابع عشر). يُنسب إليه مع اللاهوري تصميم تاج محل." },
  ],
  "Persian|craftsman|female": [
    { name_en: "Banu Goshasp", name_ar: "بانو گشسپ",
      bio_en: "Iranian heroine of the Shahnameh tradition. Daughter of Rostam celebrated as a master horsewoman and warrior-craftsman of weapons.",
      bio_ar: "بطلة إيرانية من تقليد الشاهنامة. ابنة رستم، اشتُهرت بإتقان الفروسية وصناعة الأسلحة." },
  ],
  "Persian|explorer|male": [
    { name_en: "Scylax of Caryanda (Persian service)", name_ar: "سكيلاكس الكاريندي (في خدمة فارس)",
      bio_en: "Greek explorer in Persian service (6th century BC). Mapped the Indus to the Red Sea on commission from Darius the Great.",
      bio_ar: "مستكشف يوناني في خدمة فارس (القرن السادس ق.م). رسم خريطة من السند إلى البحر الأحمر بتكليف من داريوش الأكبر." },
    { name_en: "Sallam the Interpreter", name_ar: "سلاّم الترجمان",
      bio_en: "Abbasid-Persian explorer (9th century). Sent by Caliph al-Wathiq to find the wall of Gog and Magog beyond the Caucasus.",
      bio_ar: "مستكشف عبّاسي فارسي (القرن التاسع). أرسله الواثق العبّاسي للبحث عن «سدّ يأجوج ومأجوج» وراء القوقاز." },
    { name_en: "Estakhri", name_ar: "الإصطخري",
      bio_en: "Persian geographer (10th century). Author of the Routes and Realms, a foundational Islamic geography.",
      bio_ar: "جغرافي فارسي (القرن العاشر). صاحب «المسالك والممالك»، من مؤسِّسات الجغرافيا الإسلامية." },
  ],
  "Persian|noble|male": [
    { name_en: "Vizier Buzurgmihr", name_ar: "الوزير بزرجمهر",
      bio_en: "Sasanian sage-vizier of Khosrow I (6th century AD). Persian tradition credits him with introducing chess from India to Iran.",
      bio_ar: "حكيم ووزير ساساني لكسرى الأوّل (القرن السادس م). يُنسب إليه في التراث الفارسي إدخال الشطرنج من الهند إلى إيران." },
    { name_en: "Barmakid Yahya", name_ar: "يحيى البرمكي",
      bio_en: "Persian-origin Abbasid vizier (738–805). Tutor of Harun al-Rashid; the Barmakid family ran the empire's bureaucracy at its peak.",
      bio_ar: "وزير عبّاسي من أصل فارسي (738–805). معلّم هارون الرشيد، وأدارت أسرته البرامكة دواوين الإمبراطورية في أوجها." },
    { name_en: "Salman the Persian", name_ar: "سلمان الفارسي",
      bio_en: "Companion of the Prophet Muhammad (c. 568–656). Persian convert who advised the famous trench tactic at the Battle of the Trench.",
      bio_ar: "صحابي فارسي للنبي محمد ﷺ (نحو 568–656). نصح بحفر الخندق في غزوة الخندق المشهورة." },
    { name_en: "Abu Muslim al-Khurasani", name_ar: "أبو مسلم الخراساني",
      bio_en: "Persian general (c. 718–755). Led the Abbasid Revolution from Khurasan that toppled the Umayyad Caliphate.",
      bio_ar: "قائد فارسي (نحو 718–755). قاد الثورة العبّاسية من خراسان التي أطاحت بالخلافة الأموية." },
    { name_en: "Tahir ibn Husayn", name_ar: "طاهر بن الحسين",
      bio_en: "Persian general (775–822). Founder of the Tahirid dynasty and the first Persian-led semi-independent state under the Abbasids.",
      bio_ar: "قائد فارسي (775–822). مؤسس السلالة الطاهرية، وأوّل دولة شبه مستقلة بقيادة فارسية في ظل العبّاسيين." },
    { name_en: "Yaqub ibn Layth al-Saffar", name_ar: "يعقوب بن الليث الصفّار",
      bio_en: "Persian warrior-statesman (840–879). Coppersmith-turned-king, founder of the Saffarid dynasty in eastern Iran.",
      bio_ar: "محارب وزعيم فارسي (840–879). كان نحّاسًا فصار ملكًا، ومؤسس الدولة الصفّارية في شرق إيران." },
  ],
  "Persian|noble|female": [
    { name_en: "Banu of Khorasan", name_ar: "بانو الخراسانية",
      bio_en: "Khorasani noblewoman of the early Islamic era. Patron of poets and scholars in the Samanid court at Bukhara.",
      bio_ar: "نبيلة خراسانية في صدر الإسلام. راعية للشعراء والعلماء في بلاط السامانيين ببخارى." },
    { name_en: "Khadija Begum (Safavid)", name_ar: "خديجة بيگم الصفوية",
      bio_en: "Safavid noblewoman (16th century). Wife of Shah Ismail I and a founding patroness of the Safavid royal court.",
      bio_ar: "نبيلة صفوية (القرن السادس عشر). زوجة الشاه إسماعيل الأوّل، وراعية مؤسِّسة للبلاط الصفوي." },
  ],
  // ===== Samurai =====
  "Samurai|royalty|male": [
    { name_en: "Tokugawa Ieyasu", name_ar: "توكوغاوا إياسو",
      bio_en: "Founder of the Tokugawa shogunate (1543–1616). Won Sekigahara, unified Japan, and ushered in 250 years of Edo peace.",
      bio_ar: "مؤسس شوغونية توكوغاوا (1543–1616). انتصر في سيكيغاهارا، ووحّد اليابان، وافتتح 250 عامًا من سلام إيدو." },
    { name_en: "Oda Nobunaga", name_ar: "أودا نوبوناغا",
      bio_en: "Daimyo and 'Great Unifier' (1534–1582). Pioneered firearm tactics and broke the warrior-monks' power.",
      bio_ar: "دايميو و«الموحّد الأعظم» (1534–1582). ابتكر تكتيكات الأسلحة النارية، وكسر نفوذ الرهبان المحاربين." },
    { name_en: "Toyotomi Hideyoshi", name_ar: "تويوتومي هيديوشي",
      bio_en: "Second 'Great Unifier' (1537–1598). Rose from peasant to ruler of Japan; completed national unification and reformed taxation.",
      bio_ar: "ثاني «الموحّدين الكبار» (1537–1598). صعد من فلاح إلى حاكم اليابان، وأكمل التوحيد الوطني وأصلح الضرائب." },
    { name_en: "Minamoto no Yoritomo", name_ar: "ميناموتو نو يوريتومو",
      bio_en: "Founder of the Kamakura shogunate (1147–1199). First shogun of Japan, establishing samurai military rule for seven centuries.",
      bio_ar: "مؤسس شوغونية كاماكورا (1147–1199). أوّل شوغون لليابان، أقام حكم الساموراي العسكري لسبعة قرون." },
    { name_en: "Ashikaga Takauji", name_ar: "أشيكاغا تاكاوجي",
      bio_en: "Founder of the Ashikaga shogunate (1305–1358). Established the Muromachi period and the cultured Kitayama era.",
      bio_ar: "مؤسس شوغونية أشيكاغا (1305–1358). أسّس عصر موروماتشي وفترة كيتاياما الثقافية." },
    { name_en: "Emperor Go-Daigo", name_ar: "الإمبراطور غو-دايغو",
      bio_en: "Reigning emperor (1288–1339). Briefly restored direct imperial rule in the Kenmu Restoration before Ashikaga Takauji.",
      bio_ar: "إمبراطور حاكم (1288–1339). أعاد الحكم الإمبراطوري المباشر في «إصلاح كنمو» لفترة قصيرة قبل أشيكاغا تاكاوجي." },
    { name_en: "Tokugawa Iemitsu", name_ar: "توكوغاوا إيميتسو",
      bio_en: "Third Tokugawa shogun (1604–1651). Imposed sakoku — Japan's seclusion policy — and crystallized the rigid Edo class system.",
      bio_ar: "ثالث شوغونات توكوغاوا (1604–1651). فرض «ساكوكو» سياسة العزلة في اليابان، وكرّس النظام الطبقي الصارم في إيدو." },
    { name_en: "Hojo Tokimune", name_ar: "هوجو توكيمونيه",
      bio_en: "Kamakura regent (1251–1284). Repulsed two Mongol invasions of Japan with the help of the divine 'kamikaze' typhoons.",
      bio_ar: "وصيّ كاماكورا (1251–1284). صدّ غزوتين مغوليتين لليابان بمساعدة عواصف «الكاميكاز» المقدّسة." },
    { name_en: "Takeda Shingen", name_ar: "تاكيدا شينغن",
      bio_en: "Daimyo of Kai (1521–1573). Brilliant cavalry strategist whose four banners — wind, forest, fire, mountain — became proverbial.",
      bio_ar: "دايميو كاي (1521–1573). إستراتيجي فروسية بارع، صارت راياته الأربع — الريح، الغابة، النار، الجبل — مَثَلًا." },
    { name_en: "Uesugi Kenshin", name_ar: "أويسوغي كنشين",
      bio_en: "Daimyo of Echigo (1530–1578). Devout warrior-monk known as the 'Dragon of Echigo'; great rival of Takeda Shingen.",
      bio_ar: "دايميو إيتشيغو (1530–1578). محارب راهب تقيّ عُرف بـ«تنين إيتشيغو»، خصم كبير لتاكيدا شينغن." },
    { name_en: "Mori Motonari", name_ar: "موري موتوناري",
      bio_en: "Daimyo (1497–1571). Master of intrigue who built a small clan into the dominant power of western Honshu.",
      bio_ar: "دايميو (1497–1571). أستاذ المؤامرات، حوّل عشيرة صغيرة إلى قوة مهيمنة في غرب هونشو." },
    { name_en: "Imagawa Yoshimoto", name_ar: "إيماغاوا يوشيموتو",
      bio_en: "Daimyo of Suruga (1519–1560). Cultured warlord killed by Nobunaga at the legendary surprise attack of Okehazama.",
      bio_ar: "دايميو سوروغا (1519–1560). أمير حرب مثقّف، قتله نوبوناغا في هجوم أوكِهازاما المباغت الأسطوري." },
  ],
  "Samurai|royalty|female": [
    { name_en: "Hōjō Masako", name_ar: "هوجو ماساكو",
      bio_en: "The 'Nun Shogun' (1156–1225). Wife of the first Kamakura shogun who effectively ruled Japan from behind the scenes.",
      bio_ar: "«الشوغون الراهبة» (1156–1225). زوجة أوّل شوغون من كاماكورا، حكمت اليابان فعليًّا من خلف الستار." },
    { name_en: "Empress Suiko", name_ar: "الإمبراطورة سويكو",
      bio_en: "First reigning empress of Japan (554–628). Recognized Buddhism as a state religion and sponsored Prince Shotoku's reforms.",
      bio_ar: "أوّل إمبراطورة حاكمة في اليابان (554–628). اعتمدت البوذية دينًا للدولة، ورعت إصلاحات الأمير شوتوكو." },
    { name_en: "Empress Jitō", name_ar: "الإمبراطورة جيتو",
      bio_en: "Reigning empress (645–703). Completed the Asuka Kiyomihara legal code and built the new capital at Fujiwara-kyō.",
      bio_ar: "إمبراطورة حاكمة (645–703). أكملت قانون «أسوكا كييوميهارا»، وبنت العاصمة الجديدة فوجيوارا-كيو." },
    { name_en: "Empress Genmei", name_ar: "الإمبراطورة غنميه",
      bio_en: "Reigning empress (661–721). Founded the Nara capital and commissioned the Kojiki — Japan's oldest extant chronicle.",
      bio_ar: "إمبراطورة حاكمة (661–721). أسّست عاصمة نارا، وكلّفت بتأليف «كوجيكي»، أقدم سجلّ تاريخي ياباني باقٍ." },
    { name_en: "Asai Cha-cha (Yodo-dono)", name_ar: "أساي تشا-تشا (يودو دونو)",
      bio_en: "Concubine of Hideyoshi (1569–1615). Mother of his heir Hideyori; defended Osaka Castle to the death against Ieyasu.",
      bio_ar: "محظية هيديوشي (1569–1615). أمّ وريثه هيديوري، ودافعت عن قلعة أوساكا حتى الموت في وجه إياسو." },
    { name_en: "Nene (Kōdaiin)", name_ar: "نيني (كوداي إين)",
      bio_en: "Wife of Hideyoshi (1546–1624). Influential political figure who later mediated peace between rival samurai factions.",
      bio_ar: "زوجة هيديوشي (1546–1624). شخصية سياسية مؤثّرة، توسّطت لاحقًا للسلام بين الفصائل المتنافسة من الساموراي." },
  ],
  "Samurai|warrior|male": [
    { name_en: "Miyamoto Musashi", name_ar: "ميامُتو موساشي",
      bio_en: "Legendary swordsman (1584–1645). Undefeated in 60+ duels; founder of the two-sword style and author of 'The Book of Five Rings'.",
      bio_ar: "السيّاف الأسطوري (1584–1645). لم يُهزم في أكثر من ستين مبارزة، ومؤسس مدرسة السيفين، وصاحب «كتاب الحلقات الخمس»." },
    { name_en: "Date Masamune", name_ar: "داته ماسامونه",
      bio_en: "One-eyed daimyo (1567–1636). Founder of modern Sendai and one of Japan's most ambitious warlords.",
      bio_ar: "دايميو الأعور (1567–1636). مؤسس سينداي الحديثة، وأحد أكثر قادة الحرب اليابانيين طموحًا." },
    { name_en: "Saigō Takamori", name_ar: "سايغو تاكاموري",
      bio_en: "The 'Last True Samurai' (1828–1877). Leader of the Meiji Restoration, then of the Satsuma Rebellion in defense of the samurai code.",
      bio_ar: "«آخر الساموراي الحقيقيين» (1828–1877). من قادة استعادة ميجي، ثم قاد لاحقًا تمرّد ساتسوما دفاعًا عن قانون الساموراي." },
    { name_en: "Honda Tadakatsu", name_ar: "هوندا تاداكاتسو",
      bio_en: "Tokugawa general (1548–1610). Fought in over a hundred battles without a wound; one of the 'Four Heavenly Kings of Ieyasu'.",
      bio_ar: "قائد توكوغاوا (1548–1610). قاتل في أكثر من مئة معركة دون إصابة، وأحد «الملوك السماويين الأربعة لإياسو»." },
    { name_en: "Sanada Yukimura", name_ar: "ساندا يوكيمورا",
      bio_en: "Sengoku samurai (1567–1615). 'A hero who may appear once in a hundred years', he died defending Osaka Castle against Ieyasu.",
      bio_ar: "ساموراي سنغوكو (1567–1615). «بطل يظهر مرّة كلّ مئة عام»، استشهد دفاعًا عن قلعة أوساكا في وجه إياسو." },
    { name_en: "Tachibana Dōsetsu", name_ar: "تاتشيبانا دوسيتسو",
      bio_en: "Daimyo of Bungo (1513–1585). Legendary warrior said to have struck a bolt of lightning with his sword and lived to tell.",
      bio_ar: "دايميو بونغو (1513–1585). محارب أسطوري يُقال إنه ضرب صاعقة بسيفه ونجا ليروي القصة." },
    { name_en: "Kato Kiyomasa", name_ar: "كاتو كيوماسا",
      bio_en: "Daimyo of Kumamoto (1562–1611). One of Hideyoshi's 'Seven Spears of Shizugatake' and master castle-builder.",
      bio_ar: "دايميو كوماموتو (1562–1611). أحد «رماح شيزوغاتاكي السبعة» لهيديوشي، وأستاذ بناء القلاع." },
    { name_en: "Yamamoto Tsunetomo", name_ar: "يامامُتو تسونيتومو",
      bio_en: "Samurai philosopher (1659–1719). Dictated the Hagakure, the most influential treatise on the samurai's way of life and death.",
      bio_ar: "ساموراي وفيلسوف (1659–1719). أملى «هاغاكوري»، أكثر الرسائل تأثيرًا في طريق حياة الساموراي وموته." },
    { name_en: "Tomoe Gozen (legendary male peer)", name_ar: "رفيق توموي غوزن الأسطوري",
      bio_en: "(Legendary peer) Imai Kanehira (12th century). Foster brother and inseparable warrior of Yoshinaka, dying with him at Awazu.",
      bio_ar: "(الرفيق الأسطوري) إماي كانيهيرا (القرن الثاني عشر). الأخ بالرضاع والمحارب الذي لا يفارق يوشيناكا، استشهد معه في أوازو." },
    { name_en: "Hattori Hanzo", name_ar: "هاتوري هانزو",
      bio_en: "Iga ninja-samurai (1542–1597). Master spymaster of Tokugawa Ieyasu; saved Ieyasu's life during the Honnoji crisis.",
      bio_ar: "ساموراي ونينجا من إيغا (1542–1597). كبير جواسيس توكوغاوا إياسو، أنقذ حياته أثناء أزمة هونّوجي." },
    { name_en: "Yagyu Munenori", name_ar: "ياغيو موننوري",
      bio_en: "Sword master (1571–1646). Personal sword instructor to three Tokugawa shoguns and author of the Heihō Kadensho.",
      bio_ar: "أستاذ السيف (1571–1646). معلّم السيف الشخصي لثلاثة شوغونات من توكوغاوا، وصاحب «هايهو كادينشو»." },
    { name_en: "Sasaki Kojiro", name_ar: "ساساكي كوجيرو",
      bio_en: "Master swordsman (d. 1612). Famous opponent of Musashi in the legendary duel on Ganryu Island.",
      bio_ar: "سيّاف بارع (ت. 1612). الخصم الشهير لموساشي في مبارزة جزيرة غانريو الأسطورية." },
    { name_en: "Asakura Yoshikage", name_ar: "أساكورا يوشيكاغي",
      bio_en: "Daimyo of Echizen (1533–1573). Cultured warlord who hosted Ashikaga Yoshiaki before falling to Nobunaga.",
      bio_ar: "دايميو إيتشيزن (1533–1573). أمير حرب مثقّف استضاف أشيكاغا يوشياكي قبل أن يسقط أمام نوبوناغا." },
  ],
  "Samurai|warrior|female": [
    { name_en: "Tomoe Gozen", name_ar: "تومويه غوزن",
      bio_en: "Onna-musha of the late 12th century. Peerless mounted archer and swordswoman of the Genpei War.",
      bio_ar: "محاربة من نوع «أونّا موشا» في أواخر القرن الثاني عشر. فارسة ورامية لا تُجارى في حرب غنبي." },
    { name_en: "Nakano Takeko", name_ar: "ناكانو تاكيكو",
      bio_en: "Onna-bugeisha (1847–1868). Led an all-female unit at the Battle of Aizu, fighting with a naginata.",
      bio_ar: "محاربة من «أونّا بوغيشا» (1847–1868). قادت وحدة نسائية في معركة أيزو وقاتلت بالناغيناتا." },
    { name_en: "Hangaku Gozen", name_ar: "هانغاكو غوزن",
      bio_en: "Onna-musha of the early 13th century. Defended Torisakayama castle with three thousand archers against ten thousand Hojo besiegers.",
      bio_ar: "محاربة من بداية القرن الثالث عشر. دافعت عن قلعة توريساكاياما بثلاثة آلاف رامٍ في وجه عشرة آلاف من جند هوجو." },
    { name_en: "Tsuruhime", name_ar: "تسوروهيمه",
      bio_en: "Shrine maiden and warrior (1526–1543). Took up arms at fifteen to defend Omishima Island; called the 'Joan of Arc of Japan'.",
      bio_ar: "كاهنة معبد ومحاربة (1526–1543). حملت السلاح في الخامسة عشرة دفاعًا عن جزيرة أوميشيما، ولُقّبت بـ«جان دارك اليابان»." },
    { name_en: "Ii Naotora", name_ar: "إي ناوتورا",
      bio_en: "Female daimyo of the Ii clan (d. 1582). Took control of the clan after her male relatives were killed and ruled as warlord.",
      bio_ar: "دايميو امرأة من عشيرة إي (ت. 1582). تولّت قيادة العشيرة بعد مقتل أقاربها الذكور، وحكمت كأميرة حرب." },
    { name_en: "Ohori Tsuruhime", name_ar: "أوهوري تسوروهيمه",
      bio_en: "Shrine warrior (16th century). Led naval forces against the Ouchi clan, becoming a legend of Iyo Province.",
      bio_ar: "محاربة معبد (القرن السادس عشر). قادت قوات بحرية ضد عشيرة أوتشي، وصارت أسطورة في إقليم إيو." },
  ],
  "Samurai|scholar|male": [
    { name_en: "Sugawara no Michizane", name_ar: "سوغاوارا نو ميتشيزانه",
      bio_en: "Heian scholar-statesman (845–903). Greatest Confucian scholar of his era; deified after death as Tenjin, kami of learning.",
      bio_ar: "عالم ورجل دولة من عصر هيآن (845–903). أعظم عالم كونفوشي في عصره، أُلِّه بعد الموت باسم «تنجين»، إله التعلّم." },
    { name_en: "Hayashi Razan", name_ar: "هاياشي رازان",
      bio_en: "Neo-Confucian philosopher (1583–1657). Founder of the official Tokugawa academic school that shaped Edo intellectual life.",
      bio_ar: "فيلسوف نيو-كونفوشي (1583–1657). مؤسس المدرسة الأكاديمية الرسمية لتوكوغاوا التي شكّلت حياة إيدو الفكرية." },
    { name_en: "Ogyū Sorai", name_ar: "أوغيو سوراي",
      bio_en: "Confucian philosopher (1666–1728). Influential Edo-era scholar who reshaped Japanese political thought through historical study.",
      bio_ar: "فيلسوف كونفوشي (1666–1728). عالم مؤثّر من عصر إيدو، أعاد تشكيل الفكر السياسي الياباني عبر الدراسة التاريخية." },
    { name_en: "Motoori Norinaga", name_ar: "موتوري نوريناغا",
      bio_en: "Kokugaku scholar (1730–1801). Founder of National Learning; spent 35 years writing a commentary on the Kojiki.",
      bio_ar: "عالم «كوكوغاكو» (1730–1801). مؤسس «التعلّم الوطني»، أمضى 35 عامًا في كتابة شرح للكوجيكي." },
    { name_en: "Hiraga Gennai", name_ar: "هيراغا غناي",
      bio_en: "Polymath of the Edo era (1729–1779). Naturalist, inventor, painter and playwright — a true Japanese 'Renaissance man'.",
      bio_ar: "موسوعي من عصر إيدو (1729–1779). عالم طبيعة ومخترع ورسّام وكاتب مسرحي — «رجل نهضة» ياباني حقيقي." },
    { name_en: "Sakuma Shozan", name_ar: "ساكوما شوزان",
      bio_en: "Late-Edo intellectual (1811–1864). Pioneered the integration of Western science and Confucian ethics — 'Eastern ethics, Western technology'.",
      bio_ar: "مفكّر من أواخر إيدو (1811–1864). رائد دمج العلوم الغربية بالأخلاق الكونفوشية تحت شعار «أخلاق شرقية وتقنية غربية»." },
    { name_en: "Yoshida Shōin", name_ar: "يوشيدا شوإن",
      bio_en: "Bakumatsu scholar-rebel (1830–1859). Teacher of Meiji Restoration leaders; executed at twenty-nine for plotting against the shogunate.",
      bio_ar: "عالم وثوري من فترة باكوماتسو (1830–1859). معلّم قادة استعادة ميجي، أُعدم في التاسعة والعشرين بتهمة التآمر على الشوغونية." },
  ],
  "Samurai|scholar|female": [
    { name_en: "Murasaki Shikibu", name_ar: "موراساكي شيكيبو",
      bio_en: "Heian-era court lady (978–1014). Author of The Tale of Genji — widely regarded as the world's first novel.",
      bio_ar: "سيدة بلاط من عصر هيآن (978–1014). صاحبة «حكاية غنجي»، التي تُعدّ على نطاق واسع أوّل رواية في العالم." },
    { name_en: "Sei Shōnagon", name_ar: "سي شوناغون",
      bio_en: "Heian court writer (c. 966–1017). Author of The Pillow Book — a classic of personal observation and literary wit.",
      bio_ar: "كاتبة بلاط من عصر هيآن (نحو 966–1017). صاحبة «كتاب الوسادة»، كلاسيكية الملاحظة الشخصية والذكاء الأدبي." },
    { name_en: "Izumi Shikibu", name_ar: "إيزومي شيكيبو",
      bio_en: "Heian poet (c. 976–?). One of the 'Thirty-Six Female Poetic Geniuses' and a master of waka love poetry.",
      bio_ar: "شاعرة من عصر هيآن (نحو 976–؟). من «العبقريات الست والثلاثين في الشعر»، وأستاذة في شعر الواكا الغنائي." },
    { name_en: "Ono no Komachi", name_ar: "أونو نو كوماتشي",
      bio_en: "Heian poet (c. 825–900). One of the 'Six Poetic Geniuses' and a legendary beauty whose verses shaped Japanese aesthetics.",
      bio_ar: "شاعرة من عصر هيآن (نحو 825–900). من «العباقرة الشعريين الستة»، وجمالها الأسطوري وأشعارها شكّلا الجماليات اليابانية." },
    { name_en: "Akazome Emon", name_ar: "أكازومي إيمون",
      bio_en: "Heian poet (c. 956–1041). Compiler of A Tale of Flowering Fortunes, a major historical narrative of court life.",
      bio_ar: "شاعرة من عصر هيآن (نحو 956–1041). جامعة «حكاية حظوظ مزدهرة»، سرد تاريخي مهم لحياة البلاط." },
  ],
  "Samurai|priest|male": [
    { name_en: "Saicho", name_ar: "سايتشو",
      bio_en: "Buddhist monk (767–822). Founded the Tendai school of Buddhism on Mount Hiei, the cradle of Japanese Buddhist culture.",
      bio_ar: "راهب بوذي (767–822). أسّس مدرسة «تنداي» البوذية على جبل هيي، مهد الثقافة البوذية اليابانية." },
    { name_en: "Kūkai (Kōbō Daishi)", name_ar: "كوكاي (كوبو دايشي)",
      bio_en: "Buddhist monk and scholar (774–835). Founder of Shingon Buddhism and traditionally credited with creating the kana script.",
      bio_ar: "راهب وعالم بوذي (774–835). مؤسس بوذية «شينغون»، ويُنسب إليه تقليديًّا ابتكار خطّ «الكانا»." },
    { name_en: "Hōnen", name_ar: "هونن",
      bio_en: "Buddhist reformer (1133–1212). Founder of Pure Land Buddhism in Japan, opening salvation to ordinary people.",
      bio_ar: "مصلح بوذي (1133–1212). مؤسس بوذية «الأرض النقية» في اليابان، وفتح الخلاص لعامّة الناس." },
    { name_en: "Shinran", name_ar: "شينران",
      bio_en: "Buddhist reformer (1173–1263). Founded Jōdo Shinshū, today the largest Buddhist denomination in Japan.",
      bio_ar: "مصلح بوذي (1173–1263). أسّس «جودو شينشو»، أكبر طوائف البوذية في اليابان اليوم." },
    { name_en: "Nichiren", name_ar: "نيتشيرن",
      bio_en: "Buddhist monk (1222–1282). Founded Nichiren Buddhism centered on devotion to the Lotus Sutra.",
      bio_ar: "راهب بوذي (1222–1282). أسّس بوذية «نيتشيرن» المرتكزة على تبجيل «سوترا اللوتس»." },
    { name_en: "Dōgen", name_ar: "دوغن",
      bio_en: "Zen master (1200–1253). Founded the Sōtō school of Zen Buddhism and authored the influential Shōbōgenzō.",
      bio_ar: "أستاذ زن (1200–1253). أسّس مدرسة «سوتو» الزنية، وألّف «شوبوغنزو» المؤثّر." },
    { name_en: "Eisai", name_ar: "إيساي",
      bio_en: "Zen master (1141–1215). Founded the Rinzai school of Zen and introduced green tea cultivation to Japan.",
      bio_ar: "أستاذ زن (1141–1215). أسّس مدرسة «رينزاي» الزنية، وأدخل زراعة الشاي الأخضر إلى اليابان." },
    { name_en: "Ikkyū Sōjun", name_ar: "إيكّيو سوجون",
      bio_en: "Eccentric Zen master (1394–1481). Iconoclastic poet-monk who reformed Daitoku-ji and inspired the tea ceremony aesthetics.",
      bio_ar: "أستاذ زن متفرّد (1394–1481). راهب وشاعر متمرّد، أصلح معبد «دايتوكو-جي» وألهم جماليات حفل الشاي." },
  ],
  "Samurai|priest|female": [
    { name_en: "Mugai Nyodai", name_ar: "موغاي نيوداي",
      bio_en: "First female Zen master in Japan (1223–1298). Founded a network of Zen convents and a major figure in Rinzai Zen.",
      bio_ar: "أوّل أستاذة زن في اليابان (1223–1298). أسّست شبكة من أديرة الزن للنساء، وشخصية كبيرة في زن «رينزاي»." },
    { name_en: "Empress Kōken (priestess)", name_ar: "الإمبراطورة كوكن (الكاهنة)",
      bio_en: "Reigning empress (718–770). Ordained as a Buddhist nun while still empress, blending imperial and clerical authority.",
      bio_ar: "إمبراطورة حاكمة (718–770). رُسمت راهبة بوذية وهي إمبراطورة، فجمعت بين السلطة الإمبراطورية والكهنوتية." },
    { name_en: "Mizuko Yoshie", name_ar: "ميزوكو يوشيه",
      bio_en: "Shinto miko of the medieval era. Tradition records her as one of the great mediums of the Ise Grand Shrine.",
      bio_ar: "ميكو شنتوية من العصر الوسيط. يسجّلها التراث بوصفها من كبيرات الوسيطات في معبد «إيسي» الكبير." },
  ],
  "Samurai|artist|male": [
    { name_en: "Sen no Rikyū", name_ar: "سن نو ريكيو",
      bio_en: "Tea master (1522–1591). Most influential figure in the Japanese tea ceremony and refiner of the wabi-sabi aesthetic.",
      bio_ar: "أستاذ الشاي (1522–1591). أكثر الشخصيات تأثيرًا في حفل الشاي الياباني، وصقل جماليات «وابي سابي»." },
    { name_en: "Matsuo Bashō", name_ar: "ماتسو باشو",
      bio_en: "Edo-era poet (1644–1694). Greatest master of haiku; his Narrow Road to the Deep North is a classic of world literature.",
      bio_ar: "شاعر من عصر إيدو (1644–1694). أعظم أساتذة الهايكو، وكتابه «طريق ضيّقة إلى أقصى الشمال» كلاسيكية عالمية." },
    { name_en: "Hokusai (Katsushika)", name_ar: "هوكوساي (كاتسوشيكا)",
      bio_en: "Ukiyo-e master (1760–1849). Painter of the Great Wave off Kanagawa and the 36 Views of Mount Fuji.",
      bio_ar: "أستاذ «أوكييو-إي» (1760–1849). رسّام «الموجة العظيمة قبالة كاناغاوا» و«ستة وثلاثون منظرًا لجبل فوجي»." },
    { name_en: "Hiroshige (Utagawa)", name_ar: "هيروشيغي (أوتاغاوا)",
      bio_en: "Ukiyo-e master (1797–1858). His landscape series 'The Fifty-three Stations of the Tōkaidō' shaped Japanese travel imagery.",
      bio_ar: "أستاذ «أوكييو-إي» (1797–1858). سلسلته «المحطات الثلاث والخمسون لطريق توكايدو» شكّلت صور السفر في اليابان." },
    { name_en: "Sesshū Tōyō", name_ar: "سيشّو تويو",
      bio_en: "Zen monk-painter (1420–1506). Greatest master of Japanese ink painting (sumi-e), creating sweeping landscapes.",
      bio_ar: "راهب زن ورسّام (1420–1506). أعظم أساتذة الرسم الياباني بالحبر «سومي-إي»، صاحب مناظر طبيعية واسعة." },
    { name_en: "Utamaro Kitagawa", name_ar: "أوتامارو كيتاغاوا",
      bio_en: "Ukiyo-e master (c. 1753–1806). Foremost portrayer of female beauty (bijin-ga) in Edo Japan.",
      bio_ar: "أستاذ «أوكييو-إي» (نحو 1753–1806). أبرز رسّامي جمال المرأة «بيجين-غا» في اليابان في عصر إيدو." },
    { name_en: "Sharaku Tōshūsai", name_ar: "شاراكو توشوساي",
      bio_en: "Ukiyo-e master (active 1794–1795). Created over 140 Kabuki actor portraits in just ten months, then disappeared from history.",
      bio_ar: "أستاذ «أوكييو-إي» (نشط 1794–1795). أنجز أكثر من 140 لوحة لممثلي «الكابوكي» في عشرة أشهر فقط، ثم اختفى." },
    { name_en: "Zeami Motokiyo", name_ar: "زيامي موتوكيو",
      bio_en: "Noh playwright (1363–1443). Co-creator of Noh theatre with his father Kan'ami, and author of the foundational treatise Fūshikaden.",
      bio_ar: "كاتب مسرحي «نو» (1363–1443). شارك أباه كانامي في تأسيس مسرح «نو»، وصاحب الرسالة المؤسِّسة «فوشيكادن»." },
    { name_en: "Chikamatsu Monzaemon", name_ar: "تشيكاماتسو مونزيمون",
      bio_en: "Edo playwright (1653–1725). 'Japan's Shakespeare', master of jōruri puppet theater and Kabuki tragedies.",
      bio_ar: "كاتب مسرحي من إيدو (1653–1725). «شكسبير اليابان»، أستاذ مسرح الدمى «جوروري» وتراجيديا الكابوكي." },
    { name_en: "Kanō Eitoku", name_ar: "كانو إيتوكو",
      bio_en: "Momoyama painter (1543–1590). Court artist of Nobunaga and Hideyoshi; his gold-leaf screens defined the bold Momoyama style.",
      bio_ar: "رسّام مومُوياما (1543–1590). فنّان بلاط نوبوناغا وهيديوشي، شاشاته بورق الذهب حدّدت أسلوب مومُوياما الجريء." },
    { name_en: "Hasegawa Tōhaku", name_ar: "هاسيغاوا توهاكو",
      bio_en: "Painter (1539–1610). Founder of the Hasegawa school; his Pine Trees screen is one of Japan's national treasures.",
      bio_ar: "رسّام (1539–1610). مؤسس مدرسة «هاسيغاوا»، وشاشة «أشجار الصنوبر» له من كنوز اليابان الوطنية." },
    { name_en: "Buson Yosa", name_ar: "يوسا بوسون",
      bio_en: "Edo poet-painter (1716–1784). Master of haiku and ink painting, second only to Bashō in the haiku tradition.",
      bio_ar: "شاعر ورسّام من إيدو (1716–1784). أستاذ الهايكو والرسم بالحبر، يلي باشو في تقليد الهايكو." },
    { name_en: "Issa Kobayashi", name_ar: "كوباياشي إيسّا",
      bio_en: "Edo poet (1763–1828). Beloved haiku master whose verse celebrates small creatures and ordinary humanity.",
      bio_ar: "شاعر من إيدو (1763–1828). أستاذ هايكو محبوب، يحتفي شعره بالمخلوقات الصغيرة والإنسانية البسيطة." },
  ],
  "Samurai|artist|female": [
    { name_en: "Lady Hosokawa Gracia", name_ar: "السيدة هوسوكاوا غراسيا",
      bio_en: "Samurai noblewoman (1563–1600). Calligrapher and poet who became one of Japan's most famous Christian converts.",
      bio_ar: "نبيلة ساموراي (1563–1600). خطّاطة وشاعرة، صارت من أشهر المعتنقات للمسيحية في اليابان." },
    { name_en: "Chiyo-ni", name_ar: "تشيو-ني",
      bio_en: "Edo haiku poet (1703–1775). One of the greatest female haiku masters; her morning glory verse is among Japan's most loved poems.",
      bio_ar: "شاعرة هايكو من إيدو (1703–1775). من أعظم أستاذات الهايكو، وأبياتها عن «المجد الصباحي» من أحبّ القصائد اليابانية." },
    { name_en: "Otagaki Rengetsu", name_ar: "أوتاغاكي رنغتسو",
      bio_en: "Buddhist nun and poet (1791–1875). Master calligrapher and waka poet whose ceramic poems are treasured.",
      bio_ar: "راهبة بوذية وشاعرة (1791–1875). خطّاطة بارعة وشاعرة واكا، وقصائدها على الفخّار من المقتنيات الثمينة." },
  ],
  "Samurai|craftsman|male": [
    { name_en: "Masamune", name_ar: "ماساموني",
      bio_en: "Master swordsmith (1264–1343). Greatest sword maker in Japanese history; his blades are designated National Treasures.",
      bio_ar: "أستاذ صناعة السيوف (1264–1343). أعظم صانع سيوف في تاريخ اليابان، وسيوفه مصنّفة «كنوز وطنية»." },
    { name_en: "Muramasa", name_ar: "موراماسا",
      bio_en: "Sword maker (15th–16th century). Renowned Sengoku swordsmith whose blades gained a fearsome reputation as 'cursed' by Tokugawa lore.",
      bio_ar: "صانع سيوف (القرنان الخامس عشر والسادس عشر). صانع سيوف شهير من «سنغوكو»، اكتسبت نصاله سمعة «اللعنة» في تراث توكوغاوا." },
    { name_en: "Hon'ami Kōetsu", name_ar: "هون أمي كويتسو",
      bio_en: "Renaissance man of early Edo (1558–1637). Sword polisher, calligrapher, potter and lacquer artist; founder of an artistic colony at Takagamine.",
      bio_ar: "عبقري متعدّد من بداية إيدو (1558–1637). صَقّال سيوف وخطّاط وخزّاف وفنّان لاكيه، ومؤسس مستعمرة فنّية في «تاكاغامينه»." },
    { name_en: "Ogata Kōrin", name_ar: "أوغاتا كورين",
      bio_en: "Rinpa school painter (1658–1716). Created iconic decorative folding screens like the 'Iris' and 'Red and White Plum Blossoms'.",
      bio_ar: "رسّام من مدرسة «رنبا» (1658–1716). أبدع شاشات قابلة للطيّ أيقونية مثل «السوسن» و«أزهار البرقوق الحمراء والبيضاء»." },
    { name_en: "Kobori Enshū", name_ar: "كوبوري إنشو",
      bio_en: "Tea master and architect (1579–1647). Designed iconic tea gardens at Sento Imperial Palace and refined the kirei sabi aesthetic.",
      bio_ar: "أستاذ شاي ومهندس (1579–1647). صمّم حدائق شاي أيقونية في قصر «سنتو» الإمبراطوري، وصقل جماليات «كيري سابي»." },
    { name_en: "Furuta Oribe", name_ar: "فوروتا أوريبي",
      bio_en: "Tea master (1544–1615). Successor of Rikyū who introduced bold, irregular ceramics — the famous Oribe ware.",
      bio_ar: "أستاذ شاي (1544–1615). خليفة ريكيو، أدخل خزفًا جريئًا غير منتظم عُرف بـ«خزف أوريبي»." },
  ],
  "Samurai|craftsman|female": [
    { name_en: "Lady Yodogimi (patron)", name_ar: "السيدة يودوغيمي (الراعية)",
      bio_en: "Toyotomi noblewoman (1569–1615). Patron of the Osaka castle works and of Buddhist art at Kōdai-ji and Daigo-ji.",
      bio_ar: "نبيلة من تويوتومي (1569–1615). راعية لأعمال قلعة أوساكا والفنّ البوذي في «كوداي-جي» و«دايغو-جي»." },
  ],
  "Samurai|explorer|male": [
    { name_en: "Yamada Nagamasa", name_ar: "ياما دا ناغاماسا",
      bio_en: "Adventurer-soldier (1590–1630). Rose to be governor of Nakhon Si Thammarat in Siam, leading a Japanese mercenary corps.",
      bio_ar: "مغامر وعسكري (1590–1630). صار حاكمًا لـ«ناخون سي ثاماراث» في سيام، وقاد فيلقًا من المرتزقة اليابانيين." },
    { name_en: "Hasekura Tsunenaga", name_ar: "هاسيكورا تسوننيغا",
      bio_en: "Samurai diplomat (1571–1622). Led the Keichō Embassy to Mexico, Spain and Rome — the first official Japanese mission to Europe.",
      bio_ar: "دبلوماسي ساموراي (1571–1622). قاد سفارة «كيتشو» إلى المكسيك وإسبانيا وروما، أوّل بعثة يابانية رسمية إلى أوروبا." },
    { name_en: "Tanaka Shōsuke", name_ar: "تاناكا شوسوكي",
      bio_en: "Tokugawa-era merchant-explorer (16th–17th century). Among the first Japanese to cross the Pacific to Acapulco in 1610.",
      bio_ar: "تاجر ومستكشف من عصر توكوغاوا (القرن السادس عشر والسابع عشر). من أوائل اليابانيين الذين عبروا المحيط الهادئ إلى أكابولكو عام 1610." },
  ],
  "Samurai|noble|male": [
    { name_en: "Prince Shōtoku", name_ar: "الأمير شوتوكو",
      bio_en: "Asuka-era regent (574–622). Promulgated the 17-Article Constitution, promoted Buddhism, and centralized the imperial court.",
      bio_ar: "وصيّ من عصر أسوكا (574–622). أصدر «دستور المواد السبع عشرة»، وعزّز البوذية، ومركز البلاط الإمبراطوري." },
    { name_en: "Fujiwara no Michinaga", name_ar: "فوجيوارا نو ميتشيناغا",
      bio_en: "Heian regent (966–1028). Apex of Fujiwara power; effectively ruled Japan as the emperors' father-in-law for decades.",
      bio_ar: "وصيّ من عصر هيآن (966–1028). ذروة سلطة الفوجيوارا، حكم اليابان فعليًّا بصفته حما الأباطرة لعقود." },
    { name_en: "Takeda Nobushige", name_ar: "تاكيدا نوبوشيغي",
      bio_en: "Sengoku samurai (1525–1561). Brother of Shingen and author of the 99 maxims, a key samurai ethics manual.",
      bio_ar: "ساموراي من سنغوكو (1525–1561). أخو شينغن، صاحب «الحكم التسع والتسعين»، دليل أخلاقيات أساسي للساموراي." },
    { name_en: "Hosokawa Yūsai", name_ar: "هوسوكاوا يوساي",
      bio_en: "Daimyo and waka poet (1534–1610). Last living transmitter of the secret Kokin-denju tradition of poetic interpretation.",
      bio_ar: "دايميو وشاعر واكا (1534–1610). آخر حامل سرّ «كوكين-دنجو» في تأويل الشعر." },
    { name_en: "Maeda Toshiie", name_ar: "ماي دا توشي إيي",
      bio_en: "Daimyo of Kaga (1538–1599). One of Hideyoshi's greatest generals; founded the wealthiest non-Tokugawa domain in Edo Japan.",
      bio_ar: "دايميو كاغا (1538–1599). من كبار قادة هيديوشي، أسّس أغنى إقطاعية غير توكوغاوا في إيدو." },
  ],
  "Samurai|noble|female": [
    { name_en: "Lady Kasuga", name_ar: "السيدة كاسوغا",
      bio_en: "Tokugawa noblewoman (1579–1643). Wet-nurse of shogun Iemitsu and de facto head of the shogunal women's quarters (Ōoku).",
      bio_ar: "نبيلة من توكوغاوا (1579–1643). مرضعة الشوغون إيميتسو، والرئيسة الفعلية لجناح النساء «أووكو» في الشوغونية." },
    { name_en: "Yodo-dono (noble)", name_ar: "يودو دونو (النبيلة)",
      bio_en: "Toyotomi noblewoman (1569–1615). Mother of Hideyori and final defender of the Toyotomi cause at Osaka.",
      bio_ar: "نبيلة من تويوتومي (1569–1615). أمّ هيديوري، والمدافعة الأخيرة عن قضية تويوتومي في أوساكا." },
  ],
  // ===== Viking =====
  "Viking|royalty|male": [
    { name_en: "Ragnar Lothbrok", name_ar: "راغنار لوثبروك",
      bio_en: "Legendary Norse king and raider (9th century). Famed in sagas for raids on Paris and Northumbria.",
      bio_ar: "ملك نرويجي أسطوري ومُغير (القرن التاسع). اشتُهر في الملاحم بغاراته على باريس ونورثمبريا." },
    { name_en: "Harald Hardrada", name_ar: "هارالد هاردرادا",
      bio_en: "King of Norway (1015–1066). 'The Last Great Viking', he served the Byzantine Varangian Guard and died at Stamford Bridge.",
      bio_ar: "ملك النرويج (1015–1066). «آخر الفايكنج العظماء»، خدم في الحرس الفارانجي البيزنطي، وقُتل في «جسر ستامفورد»." },
    { name_en: "Harald Fairhair", name_ar: "هارالد فيرهير",
      bio_en: "First King of Norway (c. 850–932). Unified Norway after winning the Battle of Hafrsfjord around 872.",
      bio_ar: "أوّل ملوك النرويج (نحو 850–932). وحّد النرويج بعد انتصاره في معركة «هافرسفيورد» نحو عام 872." },
    { name_en: "Cnut the Great", name_ar: "كنوت الأكبر",
      bio_en: "King of England, Denmark and Norway (c. 995–1035). Built the North Sea Empire and ruled with skill and Christian piety.",
      bio_ar: "ملك إنجلترا والدنمارك والنرويج (نحو 995–1035). بنى «إمبراطورية بحر الشمال» وحكم بكفاءة وتقوى مسيحية." },
    { name_en: "Sweyn Forkbeard", name_ar: "سفين فوركبيرد",
      bio_en: "King of Denmark and England (c. 960–1014). Father of Cnut who briefly conquered all of England in 1013.",
      bio_ar: "ملك الدنمارك وإنجلترا (نحو 960–1014). والد كنوت، فتح إنجلترا كلّها لفترة قصيرة عام 1013." },
    { name_en: "Olaf Tryggvason", name_ar: "أولاف تريغفاسون",
      bio_en: "King of Norway (995–1000). Forcibly Christianized Norway and founded the city of Trondheim.",
      bio_ar: "ملك النرويج (995–1000). نشر المسيحية بالقوّة في النرويج، وأسّس مدينة «تروندهايم»." },
    { name_en: "Olaf II Haraldsson", name_ar: "أولاف الثاني هارالدسون",
      bio_en: "King and saint of Norway (c. 995–1030). Patron saint of Norway who completed the country's Christianization.",
      bio_ar: "ملك وقدّيس في النرويج (نحو 995–1030). شفيع النرويج الذي أتمّ تنصير البلاد." },
    { name_en: "Rollo of Normandy", name_ar: "رولو النورماندي",
      bio_en: "Norse leader (c. 860–930). Founder of the Duchy of Normandy and ancestor of William the Conqueror.",
      bio_ar: "زعيم نوردي (نحو 860–930). مؤسس دوقية نورماندي، وجدّ ويليام الفاتح." },
    { name_en: "Gorm the Old", name_ar: "غورم العجوز",
      bio_en: "First historical King of Denmark (d. c. 958). Founder of the Jelling dynasty that united Denmark.",
      bio_ar: "أوّل ملوك الدنمارك التاريخيين (ت. نحو 958). مؤسس سلالة «يلّينغ» التي وحّدت الدنمارك." },
    { name_en: "Harald Bluetooth", name_ar: "هارالد بلوتوث",
      bio_en: "King of Denmark and Norway (c. 935–986). Christianized Denmark and gave his name to modern Bluetooth technology.",
      bio_ar: "ملك الدنمارك والنرويج (نحو 935–986). نصّر الدنمارك، وأعطى اسمه لتقنية «بلوتوث» الحديثة." },
    { name_en: "Magnus the Good", name_ar: "ماغنوس الصالح",
      bio_en: "King of Norway and Denmark (1024–1047). Reunited the two kingdoms and was loved as 'the Good' for his just rule.",
      bio_ar: "ملك النرويج والدنمارك (1024–1047). أعاد توحيد المملكتين، ولُقّب بـ«الصالح» لعدله." },
    { name_en: "Olof Skötkonung", name_ar: "أولوف سكوتكونونغ",
      bio_en: "First Christian king of Sweden (c. 980–1022). Minted Sweden's first coins and unified the kingdom.",
      bio_ar: "أوّل ملك مسيحي للسويد (نحو 980–1022). سكّ أوّل عملة سويدية، ووحّد المملكة." },
  ],
  "Viking|royalty|female": [
    { name_en: "Sigrid the Haughty", name_ar: "سغريد المتكبّرة",
      bio_en: "Legendary Norse queen (10th century). Reputed wife of Sweyn Forkbeard and queen-mother of Cnut the Great.",
      bio_ar: "ملكة نوردية أسطورية (القرن العاشر). يُذكر أنها زوجة سفين فوركبيرد، وأمّ الملك كنوت الأكبر." },
    { name_en: "Emma of Normandy", name_ar: "إيما النورماندية",
      bio_en: "Queen of England (c. 985–1052). Wife of two kings and mother of two kings; commissioned the Encomium Emmae Reginae.",
      bio_ar: "ملكة إنجلترا (نحو 985–1052). زوجة ملكَين وأمّ ملكَين، وكلّفت بكتابة «مدح إيما الملكة»." },
    { name_en: "Aud the Deep-Minded (queen)", name_ar: "آود العميقة الفكر (الملكة)",
      bio_en: "Norse settler-queen of Iceland (9th century). Daughter of a Hebridean Norse king who led settlers across the North Atlantic.",
      bio_ar: "ملكة ومستوطنة نوردية في آيسلندا (القرن التاسع). ابنة ملك نوردي من جزر هبريدس، قادت المستوطنين عبر شمال الأطلسي." },
    { name_en: "Thyra of Denmark", name_ar: "ثيرا الدنماركية",
      bio_en: "Queen of Denmark (10th century). Wife of Gorm the Old, credited with completing the Danevirke defensive wall.",
      bio_ar: "ملكة الدنمارك (القرن العاشر). زوجة غورم العجوز، يُنسب إليها إكمال جدار «دانفيركي» الدفاعي." },
    { name_en: "Estrid Svendsdatter", name_ar: "إستريد سفنزداتر",
      bio_en: "Danish queen-mother (c. 990–1057). Half-sister of Cnut the Great and ancestress of all later medieval Danish kings.",
      bio_ar: "أمّ ملكة دنماركية (نحو 990–1057). أخت كنوت الأكبر غير الشقيقة، وجدّة جميع ملوك الدنمارك المتأخّرين في العصر الوسيط." },
  ],
  "Viking|warrior|male": [
    { name_en: "Ivar the Boneless", name_ar: "إيفار العظمي",
      bio_en: "Viking warlord (9th century). Leader of the Great Heathen Army that conquered Anglo-Saxon kingdoms.",
      bio_ar: "أمير حرب فايكنغي (القرن التاسع). قاد «الجيش الوثني العظيم» الذي فتح ممالك الأنغلوسكسون." },
    { name_en: "Egil Skallagrímsson", name_ar: "إيغيل سكالاغريمسون",
      bio_en: "Icelandic warrior-poet (c. 904–995). One of the greatest skalds; fought across Scandinavia and Britain.",
      bio_ar: "محارب وشاعر آيسلندي (نحو 904–995). من أعظم شعراء «السكالد»، قاتل في إسكندنافيا وبريطانيا." },
    { name_en: "Bjorn Ironside", name_ar: "بيورن آيرنسايد",
      bio_en: "Norse king-warrior (9th century). Reputed son of Ragnar; led legendary raids into the Mediterranean as far as Italy.",
      bio_ar: "ملك ومحارب نوردي (القرن التاسع). يُذكر أنه ابن راغنار، قاد غارات أسطورية في المتوسط حتى إيطاليا." },
    { name_en: "Ubba", name_ar: "أوبّا",
      bio_en: "Danish chieftain (9th century). Co-leader of the Great Heathen Army; killed during the Battle of Cynwit in 878.",
      bio_ar: "زعيم دنماركي (القرن التاسع). شارك في قيادة «الجيش الوثني العظيم»، قُتل في معركة «سينويت» عام 878." },
    { name_en: "Halfdan Ragnarsson", name_ar: "هالفدان راغنارسون",
      bio_en: "Viking commander (9th century). Co-leader of the Great Heathen Army and first Norse king of Northumbria.",
      bio_ar: "قائد فايكنغي (القرن التاسع). شارك في قيادة «الجيش الوثني العظيم»، وأوّل ملك نوردي لنورثمبريا." },
    { name_en: "Sigurd Snake-in-the-Eye", name_ar: "سيغورد ذو العين الثعبانية",
      bio_en: "Viking king (9th century). Son of Ragnar Lothbrok and ancestor of the Danish royal line according to the sagas.",
      bio_ar: "ملك فايكنغي (القرن التاسع). ابن راغنار لوثبروك، وجدّ السلالة الملكية الدنماركية وفقًا للملاحم." },
    { name_en: "Guthrum", name_ar: "غوثرم",
      bio_en: "Danish king of East Anglia (d. 890). Faced Alfred the Great; defeated at Edington and converted to Christianity in 878.",
      bio_ar: "ملك دنماركي في إيست أنغليا (ت. 890). واجه ألفريد الكبير، وهُزم في «إيدنغتون»، واعتنق المسيحية عام 878." },
    { name_en: "Eric Bloodaxe", name_ar: "إيريك بلودآكس",
      bio_en: "King of Norway and Northumbria (c. 885–954). Last independent ruler of Viking York; figure of saga and feud.",
      bio_ar: "ملك النرويج ونورثمبريا (نحو 885–954). آخر حاكم مستقلّ لـ«يورك الفايكنغ»، وشخصية ملحمية محورية." },
    { name_en: "Olaf the Stout (warrior)", name_ar: "أولاف الضخم (المحارب)",
      bio_en: "Norwegian warrior-king (c. 995–1030). Fought alongside the Anglo-Saxons before becoming King Olaf II of Norway.",
      bio_ar: "ملك نرويجي محارب (نحو 995–1030). قاتل مع الأنغلوسكسون قبل أن يصبح أولاف الثاني ملكًا للنرويج." },
    { name_en: "Thorkell the Tall", name_ar: "ثوركيل الطويل",
      bio_en: "Jomsviking chieftain (10th–11th century). Defected from Sweyn Forkbeard to Aethelred II and helped Cnut conquer England.",
      bio_ar: "زعيم من «جومس فايكنغ» (القرنان العاشر والحادي عشر). انشقّ عن سفين فوركبيرد إلى أثلريد الثاني، وأعان كنوت على فتح إنجلترا." },
    { name_en: "Hastein", name_ar: "هاستاين",
      bio_en: "Viking sea-king (9th century). Led massive raids on the Mediterranean coastline from Spain to Italy.",
      bio_ar: "ملك بحر فايكنغي (القرن التاسع). قاد غارات ضخمة على ساحل البحر المتوسط من إسبانيا إلى إيطاليا." },
  ],
  "Viking|warrior|female": [
    { name_en: "Lagertha", name_ar: "لاغيرثا",
      bio_en: "Legendary shieldmaiden of Norway (9th century). Recorded by Saxo Grammaticus as a fierce warrior who fought at Ragnar's side.",
      bio_ar: "محاربة الترس الأسطورية من النرويج (القرن التاسع). دوّن المؤرخ ساكسو غراماتيكوس أنها قاتلت إلى جانب راغنار." },
    { name_en: "Freydís Eiríksdóttir", name_ar: "فريديس إيريكسدوتير",
      bio_en: "Norse explorer (c. 970–?). Daughter of Erik the Red and one of the first European women in North America.",
      bio_ar: "مستكشفة نوردية (نحو 970–؟). ابنة إيريك الأحمر، وإحدى أوائل الأوروبيات في أمريكا الشمالية." },
    { name_en: "Birka warrior woman", name_ar: "محاربة بيركا",
      bio_en: "Viking-era warrior (c. 10th century). The Bj 581 grave at Birka revealed a high-status woman buried with full warrior weapons.",
      bio_ar: "محاربة من عصر الفايكنج (نحو القرن العاشر). كشف القبر «Bj 581» في «بيركا» امرأة رفيعة المكانة دُفنت بكامل أسلحة المحارب." },
    { name_en: "Hervor", name_ar: "هيرفور",
      bio_en: "Legendary shieldmaiden of the Hervarar saga. Sought out her father's cursed sword Tyrfing and died in battle as a warrior.",
      bio_ar: "محاربة ترس أسطورية من ملحمة «هيرفارار». بحثت عن سيف أبيها الملعون «تيرفنغ»، واستشهدت في المعركة محاربةً." },
    { name_en: "Rusla the Red Maiden", name_ar: "روسلا «العذراء الحمراء»",
      bio_en: "Norse pirate-queen (8th century). Recorded by Saxo Grammaticus as a sea-rover who terrorized Denmark and Norway.",
      bio_ar: "ملكة قرصنة نوردية (القرن الثامن). دوّن ساكسو غراماتيكوس أنها بحّارة جابت بحار الدنمارك والنرويج باحثة عن الغنائم." },
    { name_en: "Veborg", name_ar: "فيبورغ",
      bio_en: "Legendary shieldmaiden (8th century). Fought at the Battle of Brávellir, recorded as one of the most fearsome warriors there.",
      bio_ar: "محاربة ترس أسطورية (القرن الثامن). قاتلت في معركة «برافيلير»، وسُجّلت بوصفها من أشجع المحاربين فيها." },
  ],
  "Viking|scholar|male": [
    { name_en: "Snorri Sturluson", name_ar: "سنوري ستورلوسون",
      bio_en: "Icelandic skald and historian (1179–1241). Author of the Prose Edda and Heimskringla.",
      bio_ar: "شاعر «سكالد» ومؤرخ آيسلندي (1179–1241). صاحب «الإيدا النثرية» و«هايمسكرنغلا»." },
    { name_en: "Ari Þorgilsson", name_ar: "آري ثورغلسون",
      bio_en: "Icelandic chronicler (1067–1148). 'Ari the Wise' authored the Íslendingabók — the first Icelandic history in vernacular.",
      bio_ar: "مؤرخ آيسلندي (1067–1148). «آري الحكيم»، صاحب «إيسلندينغا بوك»، أوّل تاريخ آيسلندي بلغة الناس." },
    { name_en: "Sæmundr Sigfússon", name_ar: "سيموندر سيغفوسون",
      bio_en: "Icelandic priest-scholar (1056–1133). Pioneered the historical chronicle tradition in Iceland; legend made him a wizard.",
      bio_ar: "كاهن وعالم آيسلندي (1056–1133). رائد التاريخ التأريخي في آيسلندا، وصارت الأسطورة تجعله ساحرًا." },
    { name_en: "Adam of Bremen", name_ar: "آدم البريمي",
      bio_en: "German cleric-historian (c. 1040–1081). Recorded the most detailed surviving description of pagan Norse religion at Uppsala.",
      bio_ar: "كاهن ومؤرخ ألماني (نحو 1040–1081). دوّن أكثر الأوصاف الباقية تفصيلًا للديانة النوردية الوثنية في أوبسالا." },
    { name_en: "Ohthere of Hålogaland", name_ar: "أوهتيري الهالوغالاندي",
      bio_en: "Norwegian explorer-merchant (9th century). His travel report at Alfred the Great's court is the earliest surviving description of Scandinavia.",
      bio_ar: "مستكشف وتاجر نرويجي (القرن التاسع). تقريره في بلاط ألفريد الكبير أقدم وصف باقٍ لإسكندنافيا." },
  ],
  "Viking|scholar|female": [
    { name_en: "Heiðr (legendary völva)", name_ar: "هايد (الفولفا الأسطورية)",
      bio_en: "Legendary Norse seeress of the Edda. Embodiment of the wise wandering völva tradition that preserved Norse cosmology.",
      bio_ar: "عرّافة نوردية أسطورية من «الإيدا». تجسيد لتقليد «الفولفا» الحكيمة المتجوّلة التي حفظت كوسمولوجيا الفايكنج." },
    { name_en: "Gunnhildr Konungamóðir", name_ar: "غنّهيلد كونونغاموذير",
      bio_en: "Queen of Norway (c. 910–980). Skilled in seiðr magic and political intrigue; mother of kings of York and Norway.",
      bio_ar: "ملكة النرويج (نحو 910–980). بارعة في سحر «سيدر» والمكائد السياسية، وأمّ ملوك يورك والنرويج." },
  ],
  "Viking|priest|male": [
    { name_en: "Thorgeir Ljósvetningagoði", name_ar: "ثورغير ليوسفتنينغاغوذي",
      bio_en: "Icelandic lawspeaker (10th–11th century). Brokered the peaceful conversion of Iceland to Christianity at the Althing in 1000.",
      bio_ar: "ناطق القانون الآيسلندي (القرنان العاشر والحادي عشر). رتّب تنصير آيسلندا سلميًا في «الألثينغ» عام 1000." },
    { name_en: "Ulfljotr", name_ar: "أولفليوتر",
      bio_en: "Lawspeaker of Iceland (10th century). Author of the original Ulfljot's Law that founded Icelandic government.",
      bio_ar: "ناطق قانون آيسلندي (القرن العاشر). صاحب «قانون أولفليوت» الأصلي الذي أسّس الحكم الآيسلندي." },
    { name_en: "Snorri Goði", name_ar: "سنوري غوذي",
      bio_en: "Icelandic chieftain-priest (964–1031). Famous goði (priest-chief) whose actions shaped the Christianization of Iceland.",
      bio_ar: "زعيم وكاهن آيسلندي (964–1031). «غوذي» مشهور (كاهن-زعيم)، شكّلت أفعاله مسار تنصير آيسلندا." },
  ],
  "Viking|priest|female": [
    { name_en: "Þorbjörg Lítilvölva", name_ar: "ثوربيورغ الفولفا",
      bio_en: "Norse seeress described in the Saga of Erik the Red (c. 1000 AD). A revered völva whose seiðr foretold Greenland's fate.",
      bio_ar: "عرّافة نوردية ورد ذكرها في «ملحمة إيريك الأحمر» (نحو 1000 م). فولفا موقّرة، تنبّأت طقوس «سيدر» الخاصة بها بمصير غرينلاند." },
    { name_en: "Þorgerðr Hörgabrúðr", name_ar: "ثورغرذر هورغابرودر",
      bio_en: "Legendary Norse priestess-deity (10th century). Patron goddess and ancestress of the Hlaðir earls of Trøndelag.",
      bio_ar: "كاهنة-إلهة نوردية أسطورية (القرن العاشر). إلهة شفيعة وجدّة لأمراء «هلاثير» في «ترونديلاغ»." },
    { name_en: "Veleda (Norse echo)", name_ar: "فيليدا (الصدى النوردي)",
      bio_en: "Germanic seeress (1st century AD). Bructeri prophetess whose tradition lived on among Norse völvas of later centuries.",
      bio_ar: "عرّافة جرمانية (القرن الأوّل م). كاهنة من قبيلة «بروكتيري»، وامتدّ تقليدها لاحقًا إلى «الفولفا» النوردية." },
  ],
  "Viking|artist|male": [
    { name_en: "Egill Skallagrímsson (skald)", name_ar: "إيغيل سكالاغريمسون (الشاعر)",
      bio_en: "Icelandic skald (c. 904–995). One of the greatest poets of the Viking age and protagonist of his own saga.",
      bio_ar: "شاعر «سكالد» آيسلندي (نحو 904–995). من أعظم شعراء عصر الفايكنج، وبطل ملحمته الخاصة." },
    { name_en: "Bragi Boddason", name_ar: "براغي بودّاسون",
      bio_en: "Norwegian skald (9th century). Earliest historically attested skald, namesake of the Norse god of poetry Bragi.",
      bio_ar: "شاعر «سكالد» نرويجي (القرن التاسع). أقدم شاعر «سكالد» موثّق تاريخيًّا، ومنه أُخذ اسم الإله النوردي للشعر «براغي»." },
    { name_en: "Sighvatr Þórðarson", name_ar: "سيغفاتر ثورذرسون",
      bio_en: "Skald of King Olaf II (c. 995–1045). Court poet whose surviving verse is a key source for the king's reign.",
      bio_ar: "شاعر بلاط الملك أولاف الثاني (نحو 995–1045). أبياته الباقية مصدر رئيسي لتاريخ عهد الملك." },
    { name_en: "Þjóðólfr of Hvinir", name_ar: "ثيوذولفر الهفينيري",
      bio_en: "Norwegian skald (9th century). Court poet of Harald Fairhair; composed the Ynglingatal genealogical poem.",
      bio_ar: "شاعر نرويجي (القرن التاسع). شاعر بلاط هارالد فيرهير، نظم قصيدة الأنساب «يِنغلِنغاتال»." },
    { name_en: "Eilífr Goðrúnarson", name_ar: "إيليفر غوذرونارسون",
      bio_en: "Icelandic skald (10th century). Author of the Þórsdrápa, a major mythological poem about the god Thor.",
      bio_ar: "شاعر آيسلندي (القرن العاشر). صاحب «ثورس درابا»، قصيدة أسطورية كبرى عن الإله ثور." },
  ],
  "Viking|artist|female": [
    { name_en: "Steinunn Refsdóttir", name_ar: "شتاينون ريفسدوتير",
      bio_en: "Icelandic poet (10th century). Famous female skald who composed sharp verses defending the old gods against missionaries.",
      bio_ar: "شاعرة آيسلندية (القرن العاشر). شاعرة «سكالد» شهيرة، نظمت أبياتًا حادّة دفاعًا عن الآلهة القديمة في وجه المبشّرين." },
    { name_en: "Jórunn Skáldmær", name_ar: "يورون سكالد مير",
      bio_en: "Norwegian skald (10th century). 'The Maiden Poet' whose verse on King Harald Fairhair is preserved in the sagas.",
      bio_ar: "شاعرة نرويجية (القرن العاشر). «الشاعرة العذراء»، حُفظت أبياتها عن الملك هارالد فيرهير في الملاحم." },
  ],
  "Viking|craftsman|male": [
    { name_en: "Wayland the Smith", name_ar: "وايلاند الحدّاد",
      bio_en: "Legendary master smith of Germanic and Norse mythology. Fame as maker of magical swords and armor spread across Europe.",
      bio_ar: "الحدّاد الأسطوري في الأساطير الجرمانية والنوردية. اشتُهر بصناعة السيوف والدروع السحرية، وامتدّت شهرته في أوروبا." },
    { name_en: "Ulfberht", name_ar: "أولفبرت",
      bio_en: "Frankish-Norse swordsmith (9th–11th century). Maker of the famous Ulfberht swords prized across the Viking world for crucible steel.",
      bio_ar: "صانع سيوف فرنجي-نوردي (القرنان التاسع والحادي عشر). صانع سيوف «أولفبرت» الشهيرة المعتمدة في عالم الفايكنج لجودة فولاذ البَوْتقة." },
    { name_en: "Hreiðmarr", name_ar: "هريذمار",
      bio_en: "Mythic Norse goldsmith. Father of the dragon Fáfnir; his treasure became the cursed Andvaranaut hoard.",
      bio_ar: "صائغ ذهب أسطوري نوردي. والد التنين فافنير، وصار كنزه «كنز أندفاراناوت» الملعون." },
    { name_en: "Audumla's smiths (Jelling masters)", name_ar: "حدّادو يلّينغ",
      bio_en: "Anonymous masters of the 10th-century Jelling royal workshops who made the silver and gold treasures of Harald Bluetooth.",
      bio_ar: "أساتذة مجهولون من ورش «يلّينغ» الملكية في القرن العاشر، صنعوا كنوز الفضة والذهب لهارالد بلوتوث." },
  ],
  "Viking|craftsman|female": [
    { name_en: "Aud the Deep-Minded", name_ar: "آود العميقة الفكر",
      bio_en: "Norse settler and matriarch (9th century). Led her household across the seas to settle Iceland.",
      bio_ar: "مستوطنة نوردية وأمّ كبيرة (القرن التاسع). قادت أهل بيتها عبر البحار لتستوطن آيسلندا." },
    { name_en: "Oseberg ship weavers", name_ar: "نسّاجات سفينة أوسبرغ",
      bio_en: "Anonymous Norse women (9th century). Created the breathtaking woven tapestries found in the Oseberg ship burial.",
      bio_ar: "نوردياتٌ مجهولات (القرن التاسع). نسجن المعلّقات المذهلة المكتشفة في دفن سفينة «أوسبرغ»." },
    { name_en: "Asa Haraldsdottir", name_ar: "آسا هارالدسدوتير",
      bio_en: "Norwegian queen (c. 9th century). Likely occupant of the Oseberg ship burial, surrounded by exquisite craftsmanship.",
      bio_ar: "ملكة نرويجية (نحو القرن التاسع). يُرجَّح أنها صاحبة دفن سفينة «أوسبرغ» المحاطة بصنائع رفيعة." },
  ],
  "Viking|explorer|male": [
    { name_en: "Leif Erikson", name_ar: "ليف إيركسون",
      bio_en: "Norse explorer (c. 970–1020). First European to reach North America at Vinland (Newfoundland) around 1000 AD.",
      bio_ar: "مستكشف نوردي (نحو 970–1020). أوّل أوروبي يصل إلى أمريكا الشمالية في «فينلاند» (نيوفاوندلاند) نحو عام 1000 م." },
    { name_en: "Erik the Red", name_ar: "إيريك الأحمر",
      bio_en: "Norse explorer (c. 950–1003). Founder of the first European settlement in Greenland; opened Norse Atlantic exploration.",
      bio_ar: "مستكشف نوردي (نحو 950–1003). مؤسس أوّل مستوطنة أوروبية في غرينلاند، وافتتح عصر الاستكشاف النوردي للأطلسي." },
    { name_en: "Bjarni Herjólfsson", name_ar: "بيارني هريولفسون",
      bio_en: "Norse merchant (10th century). First European to sight North America (986 AD), inspiring Leif Erikson's voyage.",
      bio_ar: "تاجر نوردي (القرن العاشر). أوّل أوروبي يلمح أمريكا الشمالية (986 م)، فألهم رحلة ليف إيركسون." },
    { name_en: "Thorfinn Karlsefni", name_ar: "ثورفين كارلسفني",
      bio_en: "Icelandic explorer (c. 980–1007). Led an attempt to colonize Vinland, where his son Snorri became the first European born in America.",
      bio_ar: "مستكشف آيسلندي (نحو 980–1007). قاد محاولة استيطان «فينلاند»، حيث صار ابنه «سنوري» أوّل أوروبي يُولد في أمريكا." },
    { name_en: "Floki Vilgerdarson", name_ar: "فلوكي فيلغرذرسون",
      bio_en: "Norse explorer (9th century). Used ravens to find his way and named the new land Iceland after a harsh winter.",
      bio_ar: "مستكشف نوردي (القرن التاسع). استعان بالغربان ليهتدي إلى الطريق، وسمّى الأرض الجديدة «آيسلندا» (أرض الجليد) بعد شتاء قاسٍ." },
    { name_en: "Ingólfr Arnarson", name_ar: "إنغولفر أرنارسون",
      bio_en: "First Norse settler of Iceland (c. 870 AD). Founded Reykjavík, which remains Iceland's capital today.",
      bio_ar: "أوّل مستوطن نوردي في آيسلندا (نحو 870 م). أسّس ريكيافيك، التي لا تزال عاصمة آيسلندا اليوم." },
    { name_en: "Naddoddr", name_ar: "نادّود",
      bio_en: "Faroese-Norse Viking (9th century). Among the first to sight Iceland (c. 850 AD), originally naming it Snæland.",
      bio_ar: "فايكنغي من جزر فارو النوردية (القرن التاسع). من أوائل من رأوا آيسلندا (نحو 850 م)، وسمّاها «سنيلاند» (أرض الثلج)." },
  ],
  "Viking|noble|male": [
    { name_en: "Earl Hákon Sigurdarson", name_ar: "الإيرل هاكون سيغوردارسون",
      bio_en: "Last pagan ruler of Norway (c. 937–995). Devout heathen lord who defeated the Jomsvikings at Hjörungavágr.",
      bio_ar: "آخر حاكم وثني للنرويج (نحو 937–995). سيّد وثني تقيّ هزم «جومس فايكنغ» في معركة «هيورنغافاغر»." },
    { name_en: "Earl Sigvaldi", name_ar: "الإيرل سيغفالدي",
      bio_en: "Jomsviking chieftain (10th century). Leader of the legendary Jomsvikings, the elite mercenary brotherhood.",
      bio_ar: "زعيم «جومس فايكنغ» (القرن العاشر). قائد إخوة المرتزقة النخبة الأسطورية." },
    { name_en: "Earl Sigurd Hlodvirsson", name_ar: "الإيرل سيغورد هلودفيرسون",
      bio_en: "Earl of Orkney (d. 1014). Powerful viking jarl killed at Clontarf; his Raven Banner is famous in Norse legend.",
      bio_ar: "إيرل أوركني (ت. 1014). جارل فايكنغي قويّ، قُتل في «كلونتارف»، و«رايته الغرابية» شهيرة في الأسطورة النوردية." },
    { name_en: "Snorri Sturluson (chieftain)", name_ar: "سنوري ستورلوسون (الزعيم)",
      bio_en: "Icelandic chieftain (1179–1241). The most powerful goði of his era, who served twice as Lawspeaker of the Althing.",
      bio_ar: "زعيم آيسلندي (1179–1241). أقوى «غوذي» في عصره، تولّى منصب «ناطق القانون» في الألثينغ مرتين." },
  ],
  "Viking|noble|female": [
    { name_en: "Astrid Olofsdotter", name_ar: "أستريد أولوفسدوتر",
      bio_en: "Swedish princess and Norwegian queen (c. 1000–1035). Wife of Olaf II of Norway and a powerful political mediator.",
      bio_ar: "أميرة سويدية وملكة نرويجية (نحو 1000–1035). زوجة أولاف الثاني ملك النرويج، ووسيطة سياسية قويّة." },
    { name_en: "Asa Haraldsdottir (noble)", name_ar: "آسا هارالدسدوتير (النبيلة)",
      bio_en: "Norwegian queen (c. 9th century). Mother of King Halfdan the Black; possibly the woman of the Oseberg ship burial.",
      bio_ar: "ملكة نرويجية (نحو القرن التاسع). أمّ الملك «هالفدان الأسود»، وربما تكون صاحبة دفن سفينة «أوسبرغ»." },
    { name_en: "Sigríð Stórráða (Sigrid the Haughty)", name_ar: "سيغريد المتكبّرة (سترّاذا)",
      bio_en: "Legendary queen (10th century). Powerful pagan queen who refused to marry Christian kings, embodying old Norse pride.",
      bio_ar: "ملكة أسطورية (القرن العاشر). ملكة وثنية قوية رفضت الزواج من الملوك المسيحيين، تجسّد كبرياء النوردي القديم." },
  ],

  // ===== Chinese =====
  "Chinese|royalty|male": [
    { name_en: "Qin Shi Huang", name_ar: "تشين شي هوانغ",
      bio_en: "First Emperor of unified China (259–210 BC). Unified the warring states, standardized writing, currency and weights, began the Great Wall, and built the Terracotta Army.",
      bio_ar: "أول إمبراطور لصين موحّدة (259–210 ق.م). وحّد الممالك المتحاربة، ووحّد الكتابة والعملة والمكاييل، وبدأ ببناء سور الصين العظيم، وأقام جيش التيراكوتا." },
    { name_en: "Emperor Wu of Han", name_ar: "الإمبراطور وو من سلالة هان",
      bio_en: "Han emperor (156–87 BC). Expanded China to its greatest extent yet, opened the Silk Road, and made Confucianism the state ideology.",
      bio_ar: "إمبراطور هان (156–87 ق.م). وسّع الصين إلى أقصى حدودها، وفتح طريق الحرير، وجعل الكونفوشية أيديولوجيا الدولة." },
    { name_en: "Emperor Taizong of Tang", name_ar: "الإمبراطور تايزونغ من تانغ",
      bio_en: "Co-founder of the Tang Dynasty (598–649). Architect of a golden age of Chinese civilization, art, and military power.",
      bio_ar: "أحد مؤسّسي سلالة تانغ (598–649). مهندس عصر ذهبي للحضارة والفنون والقوة العسكرية في الصين." },
    { name_en: "Emperor Xuanzong of Tang", name_ar: "الإمبراطور شوان زونغ من تانغ",
      bio_en: "Tang emperor (685–762). His reign marked the zenith of Tang prosperity, poetry and cosmopolitan culture.",
      bio_ar: "إمبراطور تانغ (685–762). شكّل عهده ذروة ازدهار تانغ والشعر والثقافة المنفتحة." },
    { name_en: "Kublai Khan", name_ar: "قوبلاي خان",
      bio_en: "Founder of the Yuan Dynasty (1215–1294). Grandson of Genghis Khan; ruled the largest contiguous empire in history and welcomed Marco Polo.",
      bio_ar: "مؤسّس سلالة يوان (1215–1294). حفيد جنكيز خان، وحكم أكبر إمبراطورية متّصلة في التاريخ، واستقبل ماركو بولو." },
    { name_en: "Hongwu Emperor", name_ar: "إمبراطور هونغ وو",
      bio_en: "Founder of the Ming Dynasty (1328–1398). Rose from peasantry to overthrow Mongol rule and rebuild Han Chinese governance.",
      bio_ar: "مؤسّس سلالة مينغ (1328–1398). نهض من الفلاحين ليطيح بالحكم المغولي ويعيد بناء الحكم الصيني الهاني." },
    { name_en: "Yongle Emperor", name_ar: "إمبراطور يونغ لِه",
      bio_en: "Third Ming emperor (1360–1424). Built the Forbidden City, sponsored Zheng He's voyages, and commissioned the Yongle Encyclopedia.",
      bio_ar: "ثالث أباطرة مينغ (1360–1424). بنى المدينة المحرّمة، ورعى رحلات الأميرال جنغ خه، وأمر بتأليف موسوعة يونغ لِه." },
    { name_en: "Kangxi Emperor", name_ar: "إمبراطور كانغشي",
      bio_en: "Fourth Qing emperor (1654–1722). Longest-reigning emperor of China; consolidated Qing rule and patronized scholarship.",
      bio_ar: "رابع أباطرة تشينغ (1654–1722). أطول الأباطرة الصينيين حكمًا، وحّد سلطة تشينغ ورعى العلم والمعرفة." },
    { name_en: "Qianlong Emperor", name_ar: "إمبراطور تشيان لونغ",
      bio_en: "Qing emperor (1711–1799). Expanded China's borders to their greatest historical extent and was a renowned poet and patron of arts.",
      bio_ar: "إمبراطور تشينغ (1711–1799). وسّع حدود الصين إلى أقصى مداها التاريخي، وكان شاعرًا مرموقًا وراعيًا للفنون." },
  ],
  "Chinese|royalty|female": [
    { name_en: "Empress Wu Zetian", name_ar: "الإمبراطورة وو زيتيان",
      bio_en: "Only woman to rule China in her own name (624–705). Founded the Zhou Dynasty, expanded the empire, and reformed the civil-service exams.",
      bio_ar: "المرأة الوحيدة التي حكمت الصين باسمها (624–705). أسّست سلالة تشو، ووسّعت الإمبراطورية، وأصلحت امتحانات الخدمة المدنية." },
    { name_en: "Empress Dowager Cixi", name_ar: "الإمبراطورة الأم تسوشي",
      bio_en: "De facto ruler of Qing China (1835–1908). Controlled the Qing court for 47 years through three emperors during a turbulent era.",
      bio_ar: "الحاكمة الفعلية للصين في عهد تشينغ (1835–1908). تحكّمت في البلاط 47 عامًا عبر ثلاثة أباطرة في حقبة مضطربة." },
    { name_en: "Empress Zhangsun", name_ar: "الإمبراطورة جانغ سون",
      bio_en: "Empress consort of Tang Taizong (601–636). Renowned for her wisdom, virtue, and quiet political influence at court.",
      bio_ar: "زوجة الإمبراطور تايزونغ من تانغ (601–636). اشتهرت بالحكمة والفضيلة وتأثيرها السياسي الهادئ في البلاط." },
    { name_en: "Princess Pingyang", name_ar: "الأميرة بينغ يانغ",
      bio_en: "Tang princess (c. 600–623). Raised the 'Army of the Lady' that helped her father seize the throne and found the Tang Dynasty.",
      bio_ar: "أميرة من تانغ (نحو 600–623). جنّدت «جيش السيّدة» الذي ساعد والدها على انتزاع العرش وتأسيس سلالة تانغ." },
  ],
  "Chinese|warrior|male": [
    { name_en: "Sun Tzu", name_ar: "صن تزو",
      bio_en: "General and strategist (c. 544–496 BC). Author of 'The Art of War', the most influential military treatise in history.",
      bio_ar: "قائد عسكري واستراتيجي (نحو 544–496 ق.م). مؤلف «فن الحرب»، أكثر الكتب العسكرية تأثيرًا في التاريخ." },
    { name_en: "Cao Cao", name_ar: "تساو تساو",
      bio_en: "Warlord and statesman (155–220). Unified northern China at the end of the Han Dynasty; founder of the state of Wei.",
      bio_ar: "أمير حرب ورجل دولة (155–220). وحّد شمال الصين في نهاية سلالة هان، وأسّس دولة وي." },
    { name_en: "Zhuge Liang", name_ar: "تشوغه ليانغ",
      bio_en: "Chancellor and strategist of Shu Han (181–234). Legendary tactician of the Three Kingdoms era and inventor of military innovations.",
      bio_ar: "وزير واستراتيجي لمملكة شو هان (181–234). تكتيكي أسطوري في عصر الممالك الثلاث ومبتكر آلات حربية." },
    { name_en: "Yue Fei", name_ar: "يويه فِي",
      bio_en: "Song Dynasty general (1103–1142). National hero who fought the Jurchen invaders; revered for loyalty and martial skill.",
      bio_ar: "قائد من سلالة سونغ (1103–1142). بطل قومي قاتل غزاة الجورتشن، يُبجَّل لولائه وبراعته في القتال." },
    { name_en: "Guan Yu", name_ar: "قوان يو",
      bio_en: "Three Kingdoms general (160–220). Sworn brother of Liu Bei; later deified as the god of war and brotherhood.",
      bio_ar: "قائد من عصر الممالك الثلاث (160–220). أخ قسم لـ«ليو بَي»، ثم أُلِّه لاحقًا إلهًا للحرب والإخوة." },
    { name_en: "Zheng He", name_ar: "جنغ خه",
      bio_en: "Ming admiral (1371–1433). Led seven epic Treasure Fleet voyages from China to Africa with hundreds of giant ships.",
      bio_ar: "أميرال من سلالة مينغ (1371–1433). قاد سبع رحلات أسطورية بأسطول الكنوز من الصين إلى إفريقيا بمئات السفن العملاقة." },
    { name_en: "Qi Jiguang", name_ar: "تشي جي قوانغ",
      bio_en: "Ming general (1528–1588). Reformed the Ming army and crushed the wokou pirates harassing China's coast.",
      bio_ar: "قائد من سلالة مينغ (1528–1588). أصلح جيش مينغ وسحق قراصنة «الووكو» الذين كانوا يهاجمون السواحل الصينية." },
    { name_en: "Bodhidharma (legendary)", name_ar: "بوديدارما (الأسطوري)",
      bio_en: "Buddhist monk (5th–6th century). Traditionally credited with bringing Chan/Zen Buddhism and martial arts to Shaolin Temple.",
      bio_ar: "راهب بوذي (القرنان الخامس والسادس). يُنسب إليه تقليديًا إدخال البوذية الزن وفنون القتال إلى معبد شاولين." },
  ],
  "Chinese|warrior|female": [
    { name_en: "Hua Mulan", name_ar: "هوا مولان",
      bio_en: "Legendary warrior (c. 5th–6th century). Disguised herself as a man to take her father's place in the army for twelve years of service.",
      bio_ar: "محاربة أسطورية (نحو القرنين الخامس والسادس). تنكّرت في زي رجل لتحلّ محلّ أبيها في الجيش طوال اثني عشر عامًا." },
    { name_en: "Lady Fu Hao", name_ar: "السيدة فو هاو",
      bio_en: "Shang Dynasty general and queen (c. 1200 BC). One of the earliest female generals in history; led 13,000 troops in battle.",
      bio_ar: "قائدة وملكة من سلالة شانغ (نحو 1200 ق.م). من أوائل القائدات العسكريات في التاريخ، قادت 13 ألف جندي في المعركة." },
    { name_en: "Liang Hongyu", name_ar: "ليانغ هونغيو",
      bio_en: "Song Dynasty general (1102–1135). Beat war drums to rally Song forces to victory against the Jin invaders at Huangtiandang.",
      bio_ar: "قائدة من سلالة سونغ (1102–1135). قرعت طبول الحرب لتحفيز جيش سونغ على النصر ضد غزاة جين في معركة هوانغتيانغ." },
    { name_en: "Princess Pingyang (Tang)", name_ar: "الأميرة بينغ يانغ (تانغ)",
      bio_en: "Tang princess (c. 600–623). Commanded an army of 70,000 — the 'Army of the Lady' — that helped found the Tang Dynasty.",
      bio_ar: "أميرة من تانغ (نحو 600–623). قادت جيشًا من 70 ألف مقاتل عُرف بـ«جيش السيّدة»، أسهم في تأسيس سلالة تانغ." },
  ],
  "Chinese|scholar|male": [
    { name_en: "Confucius", name_ar: "كونفوشيوس",
      bio_en: "Philosopher and teacher (551–479 BC). Founder of Confucianism; his ethical teachings shaped East Asian civilization for 2,500 years.",
      bio_ar: "فيلسوف ومعلّم (551–479 ق.م). مؤسّس الكونفوشية، وأخلاقياته صاغت حضارة شرق آسيا طوال 2500 عام." },
    { name_en: "Laozi", name_ar: "لاو تزو",
      bio_en: "Sage philosopher (6th century BC). Traditional author of the 'Tao Te Ching' and founder of philosophical Daoism.",
      bio_ar: "فيلسوف حكيم (القرن السادس ق.م). المؤلف التقليدي لكتاب «تاو تي تشينغ» ومؤسّس الطاوية الفلسفية." },
    { name_en: "Mencius", name_ar: "مَنغ تزو (مينشيوس)",
      bio_en: "Confucian philosopher (372–289 BC). Most influential interpreter of Confucianism; argued that human nature is innately good.",
      bio_ar: "فيلسوف كونفوشي (372–289 ق.م). أبرز مفسّري الكونفوشية، رأى أن الطبيعة البشرية خيّرة فطريًا." },
    { name_en: "Zhuangzi", name_ar: "تشوانغ تزو",
      bio_en: "Daoist philosopher (c. 369–286 BC). His parables, including the butterfly dream, are foundational texts of Daoism.",
      bio_ar: "فيلسوف طاوي (نحو 369–286 ق.م). أمثاله — ومنها حلم الفراشة — من النصوص التأسيسية للطاوية." },
    { name_en: "Sima Qian", name_ar: "سيما تشيان",
      bio_en: "Historian (c. 145–86 BC). Author of the 'Records of the Grand Historian', the foundational work of Chinese historiography.",
      bio_ar: "مؤرّخ (نحو 145–86 ق.م). مؤلف «سجلات المؤرّخ الكبير»، العمل التأسيسي للتأريخ الصيني." },
    { name_en: "Zhang Heng", name_ar: "جانغ خنغ",
      bio_en: "Polymath (78–139). Invented the world's first seismometer and a pioneering armillary sphere; mapped the night sky.",
      bio_ar: "موسوعي (78–139). اخترع أوّل جهاز في العالم لرصد الزلازل، وكرة فلكية رائدة، ورسم خريطة لسماء الليل." },
    { name_en: "Zhu Xi", name_ar: "جو شي",
      bio_en: "Song Dynasty philosopher (1130–1200). Architect of Neo-Confucianism, which dominated Chinese thought for 700 years.",
      bio_ar: "فيلسوف من سلالة سونغ (1130–1200). مهندس الكونفوشية الجديدة التي هيمنت على الفكر الصيني سبعة قرون." },
    { name_en: "Shen Kuo", name_ar: "شِن كُوُو",
      bio_en: "Polymath scientist (1031–1095). Described the magnetic compass for navigation, true north, and movable-type printing.",
      bio_ar: "عالِم موسوعي (1031–1095). وصف البوصلة المغناطيسية للملاحة، والشمال الحقيقي، والطباعة بالحروف المتحركة." },
    { name_en: "Li Shizhen", name_ar: "لي شيجن",
      bio_en: "Ming physician (1518–1593). Compiled the 'Bencao Gangmu', the most comprehensive Chinese pharmacopeia.",
      bio_ar: "طبيب من سلالة مينغ (1518–1593). جمع موسوعة «بَن تساو غانغ مو»، أشمل دستور أدوية في الطب الصيني." },
  ],
  "Chinese|scholar|female": [
    { name_en: "Ban Zhao", name_ar: "بان جاو",
      bio_en: "Han historian (c. 45–116). Completed her brother's 'Book of Han' and wrote 'Lessons for Women', a classic of female education.",
      bio_ar: "مؤرّخة من سلالة هان (نحو 45–116). أكملت «كتاب هان» الذي بدأه أخوها، وكتبت «دروس للنساء» من كلاسيكيات تعليم النساء." },
    { name_en: "Wang Zhenyi", name_ar: "وانغ جنيي",
      bio_en: "Qing astronomer and mathematician (1768–1797). Explained lunar eclipses and equinoxes; wrote on Pythagorean theorem.",
      bio_ar: "فلكية ورياضياتية من سلالة تشينغ (1768–1797). فسّرت كسوف القمر والاعتدالات، وكتبت في نظرية فيثاغورس." },
  ],
  "Chinese|priest|male": [
    { name_en: "Xuanzang", name_ar: "شوان زانغ",
      bio_en: "Tang Buddhist monk (602–664). Made a 17-year pilgrimage to India and translated 657 Buddhist texts; inspired 'Journey to the West'.",
      bio_ar: "راهب بوذي من تانغ (602–664). قام برحلة حج إلى الهند استمرّت 17 عامًا وترجم 657 نصًا بوذيًا، وألهم رواية «رحلة إلى الغرب»." },
    { name_en: "Hui Neng", name_ar: "هوي نِنغ",
      bio_en: "Sixth Patriarch of Chan Buddhism (638–713). His 'Platform Sutra' is a foundational text of Zen Buddhism.",
      bio_ar: "البطريرك السادس للبوذية الزن (638–713). كتابه «سوترا المنبر» نصّ تأسيسي في البوذية الزن." },
    { name_en: "Zhang Daoling", name_ar: "جانغ داولينغ",
      bio_en: "Founder of Way of the Celestial Masters (34–156). Established institutional Daoism as China's first organized religion.",
      bio_ar: "مؤسّس «طريق المعلّمين السماويين» (34–156). أرسى الطاوية المؤسّسية بوصفها أول دين منظَّم في الصين." },
  ],
  "Chinese|priest|female": [
    { name_en: "Sun Bu'er", name_ar: "صن بو إِر",
      bio_en: "Daoist master (1119–1182). One of the Seven Masters of Quanzhen Daoism and founder of the Qingjing women's Daoist school.",
      bio_ar: "معلّمة طاوية (1119–1182). من «المعلّمين السبعة» في طاوية تشيوانجن، ومؤسّسة مدرسة تشينغجينغ الطاوية للنساء." },
    { name_en: "Wei Huacun", name_ar: "وي هواتسون",
      bio_en: "Daoist priestess (252–334). Founder of the Shangqing School of Daoism; revered as a celestial immortal.",
      bio_ar: "كاهنة طاوية (252–334). مؤسّسة مدرسة «شانغ تشينغ» الطاوية، وتُبجَّل بوصفها خالدة سماوية." },
  ],
  "Chinese|artist|male": [
    { name_en: "Li Bai", name_ar: "لي باي",
      bio_en: "Tang Dynasty poet (701–762). One of the two greatest poets in Chinese history; legendary for his wine-soaked verse.",
      bio_ar: "شاعر من سلالة تانغ (701–762). أحد أعظم شاعرَين في تاريخ الصين، اشتُهر بقصائده المعتّقة بالنبيذ." },
    { name_en: "Du Fu", name_ar: "دو فو",
      bio_en: "Tang Dynasty poet (712–770). Called the 'Poet-Sage' for his moral seriousness and mastery of every poetic form.",
      bio_ar: "شاعر من سلالة تانغ (712–770). لُقّب بـ«حكيم الشعراء» لجدّيته الأخلاقية وإتقانه كلّ الأشكال الشعرية." },
    { name_en: "Wang Xizhi", name_ar: "وانغ شي جي",
      bio_en: "Calligrapher (303–361). The 'Sage of Calligraphy', whose 'Preface to the Orchid Pavilion' is the most famous work of Chinese calligraphy.",
      bio_ar: "خطّاط (303–361). «حكيم الخط»، صاحب «مقدّمة جناح الأوركيد»، أشهر أعمال الخط الصيني." },
    { name_en: "Su Shi (Su Dongpo)", name_ar: "سو شي (سو دونغبو)",
      bio_en: "Song Dynasty polymath (1037–1101). Master poet, calligrapher, painter, statesman and gastronome — even Dongpo pork bears his name.",
      bio_ar: "موسوعي من سلالة سونغ (1037–1101). شاعر وخطّاط ورسّام ورجل دولة وذوّاقة، حتى أن طبق «خنزير دونغبو» يحمل اسمه." },
    { name_en: "Wu Daozi", name_ar: "وو داو زي",
      bio_en: "Tang Dynasty painter (c. 685–758). Called the 'Sage of Painting' and considered China's greatest master of brush painting.",
      bio_ar: "رسّام من سلالة تانغ (نحو 685–758). لُقّب بـ«حكيم الرسم» ويُعدّ أعظم أساتذة الرسم بالفرشاة في الصين." },
    { name_en: "Bai Juyi", name_ar: "باي جويي",
      bio_en: "Tang poet (772–846). Wrote in plain language for the people; one of the most prolific and beloved poets in Chinese history.",
      bio_ar: "شاعر من تانغ (772–846). كتب بلغة بسيطة للعامة، وهو من أغزر شعراء الصين وأحبّهم إلى قلوب الناس." },
  ],
  "Chinese|artist|female": [
    { name_en: "Li Qingzhao", name_ar: "لي تشينغ جاو",
      bio_en: "Song Dynasty poet (1084–c. 1155). The greatest woman poet of classical China; master of the ci (lyric) form.",
      bio_ar: "شاعرة من سلالة سونغ (1084–نحو 1155). أعظم شاعرات الصين الكلاسيكية، وسيّدة شكل «الـ تسي» الغنائي." },
    { name_en: "Cai Wenji", name_ar: "تساي وَنجي",
      bio_en: "Han poet and musician (c. 177–249). Renowned poet abducted by the Xiongnu; her '18 Songs of a Nomad Flute' became a classic.",
      bio_ar: "شاعرة وموسيقية من سلالة هان (نحو 177–249). شاعرة شهيرة اختطفها الخيونغنو، وأصبحت قصائدها «18 أغنية لناي البدو» من الكلاسيكيات." },
    { name_en: "Xue Tao", name_ar: "شويه تاو",
      bio_en: "Tang courtesan poet (768–831). One of the most famous female poets of the Tang and inventor of red 'Xue Tao' poetry paper.",
      bio_ar: "شاعرة من بلاط تانغ (768–831). من أشهر شواعر تانغ، ومخترعة ورق الشعر الأحمر المعروف بـ«ورق شويه تاو»." },
    { name_en: "Guan Daosheng", name_ar: "قوان داوشِنغ",
      bio_en: "Yuan Dynasty painter and poet (1262–1319). The most celebrated female painter in Chinese history, famed for her bamboo paintings.",
      bio_ar: "رسّامة وشاعرة من سلالة يوان (1262–1319). أشهر رسّامة في تاريخ الصين، اشتُهرت برسم الخيزران." },
  ],
  "Chinese|craftsman|male": [
    { name_en: "Cai Lun", name_ar: "تساي لون",
      bio_en: "Han court eunuch and inventor (c. 50–121). Credited with inventing modern paper-making — one of history's most important innovations.",
      bio_ar: "خصي بلاط ومخترع من سلالة هان (نحو 50–121). يُنسب إليه اختراع صناعة الورق الحديث، أحد أهم اختراعات التاريخ." },
    { name_en: "Bi Sheng", name_ar: "بِي شِنغ",
      bio_en: "Song Dynasty inventor (c. 990–1051). Inventor of movable type printing, four centuries before Gutenberg.",
      bio_ar: "مخترع من سلالة سونغ (نحو 990–1051). مخترع الطباعة بالحروف المتحركة، قبل غوتنبرغ بأربعة قرون." },
    { name_en: "Lu Ban", name_ar: "لو بان",
      bio_en: "Master carpenter (507–444 BC). Patron saint of Chinese builders, traditionally credited with inventing the saw, plane and umbrella.",
      bio_ar: "كبير النجّارين (507–444 ق.م). شفيع البنّائين في الصين، يُنسب إليه تقليديًا اختراع المنشار والمسحاج والمظلّة." },
    { name_en: "Kuai Xiang", name_ar: "كواي شيانغ",
      bio_en: "Ming master architect (1397–1481). Chief architect of the Forbidden City and many of Beijing's enduring imperial buildings.",
      bio_ar: "كبير المعماريين في سلالة مينغ (1397–1481). كبير معماريي المدينة المحرّمة وكثير من مباني بكين الإمبراطورية الخالدة." },
  ],
  "Chinese|craftsman|female": [
    { name_en: "Huang Daopo", name_ar: "هوانغ داوبو",
      bio_en: "Yuan Dynasty textile innovator (1245–1330). Revolutionized Chinese cotton weaving with new spinning and looming techniques.",
      bio_ar: "مبتكِرة في صناعة النسيج من سلالة يوان (1245–1330). أحدثت ثورة في حياكة القطن الصيني بتقنيات غزل ونول جديدة." },
    { name_en: "Lady Leizu (legendary)", name_ar: "السيدة لِي تزو (الأسطورية)",
      bio_en: "Legendary empress (c. 27th century BC). Traditionally credited with discovering silk and inventing the silk loom.",
      bio_ar: "إمبراطورة أسطورية (نحو القرن السابع والعشرين ق.م). يُنسب إليها تقليديًا اكتشاف الحرير واختراع نول الحرير." },
  ],
  "Chinese|explorer|male": [
    { name_en: "Zhang Qian", name_ar: "جانغ تشيان",
      bio_en: "Han diplomat-explorer (d. 113 BC). Pioneer of the Silk Road; opened China's first overland routes to Central Asia.",
      bio_ar: "دبلوماسي ومستكشف من سلالة هان (ت. 113 ق.م). رائد طريق الحرير، وفتح أول طرق برّية للصين نحو آسيا الوسطى." },
    { name_en: "Faxian", name_ar: "فا شيان",
      bio_en: "Buddhist monk-explorer (337–c. 422). Walked from China to India and back via Sri Lanka; recorded a priceless travelogue.",
      bio_ar: "راهب بوذي ومستكشف (337–نحو 422). مشى من الصين إلى الهند وعاد عبر سريلانكا، ودوّن رحلة لا تُقدَّر بثمن." },
    { name_en: "Xu Xiake", name_ar: "شوي شيا كه",
      bio_en: "Ming traveler-geographer (1587–1641). Spent 30 years exploring China's mountains and rivers; his diaries are a geographic classic.",
      bio_ar: "رحّالة وجغرافي من سلالة مينغ (1587–1641). أمضى ثلاثين عامًا في استكشاف جبال الصين وأنهارها، ومذكّراته من كلاسيكيات الجغرافيا." },
  ],
  "Chinese|noble|male": [
    { name_en: "Wang Anshi", name_ar: "وانغ آنشي",
      bio_en: "Song Dynasty chancellor (1021–1086). Architect of sweeping economic and government reforms known as the New Policies.",
      bio_ar: "وزير من سلالة سونغ (1021–1086). مهندس إصلاحات اقتصادية وحكومية واسعة عُرفت بـ«السياسات الجديدة»." },
    { name_en: "Liu Bei", name_ar: "ليو بَي",
      bio_en: "Founder of Shu Han (161–223). Three Kingdoms warlord renowned for benevolence; protagonist of the 'Romance of the Three Kingdoms'.",
      bio_ar: "مؤسّس مملكة شو هان (161–223). أمير حرب من عصر الممالك الثلاث اشتُهر بالرحمة، وبطل رواية «رومانسية الممالك الثلاث»." },
  ],
  "Chinese|noble|female": [
    { name_en: "Xiao Yanyan", name_ar: "شياو يانيان",
      bio_en: "Liao Dynasty empress dowager (953–1009). Brilliant regent who personally led armies and negotiated the Chanyuan Treaty.",
      bio_ar: "إمبراطورة أم من سلالة لياو (953–1009). وصيّة لامعة قادت الجيوش بنفسها وتفاوضت على معاهدة شانيوان." },
    { name_en: "Lady Xian", name_ar: "السيدة شيان",
      bio_en: "Sui-Tang noblewoman (512–602). Tribal leader of southern China who kept the region peaceful across three dynasties.",
      bio_ar: "نبيلة من سلالتي سُوي وتانغ (512–602). زعيمة قبلية في جنوب الصين حفظت سلام الإقليم عبر ثلاث سلالات حاكمة." },
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

// --- In-memory persona descriptor cache ---
// Persona descriptors change rarely (only on enroll/re-enroll). Cache them
// in memory for the lifetime of the edge function instance (typically minutes).
// TTL keeps data fresh without hitting the DB on every request.
type CachedPersona = {
  id: string;
  name: string;
  category: string;
  description: string;
  image_url: string;
  source_image_url: string | null;
  gender: string | null;
  role: string | null;
  face_descriptor: number[];
  skin_tone: { h: number; s: number; l: number; category: string } | null;
  name_en: string | null;
  description_en: string | null;
};

// ===== Vector Index =====
// Stores all persona descriptors in a contiguous Float64Array for cache-friendly
// batch distance computation. Uses a min-heap for top-K extraction (O(N log K)
// instead of O(N log N) full sort). Rebuilt when persona cache expires.
class VectorIndex {
  private matrix: Float64Array; // flat NxD array
  private personas: CachedPersona[];
  private dim: number;
  private builtAt: number;

  constructor(personas: CachedPersona[], dim: number) {
    this.personas = personas;
    this.dim = dim;
    this.builtAt = Date.now();
    // Pack all descriptors into a single contiguous buffer
    this.matrix = new Float64Array(personas.length * dim);
    for (let i = 0; i < personas.length; i++) {
      const desc = personas[i].face_descriptor;
      const offset = i * dim;
      for (let j = 0; j < dim; j++) {
        this.matrix[offset + j] = desc[j];
      }
    }
  }

  get length() { return this.personas.length; }
  get age() { return Date.now() - this.builtAt; }
  getPersona(i: number) { return this.personas[i]; }

  /** Compute euclidean distance between query and the i-th stored vector */
  private distanceTo(query: number[], i: number): number {
    const offset = i * this.dim;
    let sum = 0;
    for (let j = 0; j < this.dim; j++) {
      const d = query[j] - this.matrix[offset + j];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  /** Return ALL personas scored & sorted by distance (needed for tiered filtering). */
  scoreAll(
    query: number[],
    userSkinTone?: { h: number; s: number; l: number } | null,
  ): Array<CachedPersona & { distance: number; similarity: number }> {
    const results: Array<CachedPersona & { distance: number; similarity: number }> = new Array(this.personas.length);
    for (let i = 0; i < this.personas.length; i++) {
      let distance = this.distanceTo(query, i);

       // Adjust distance based on skin tone similarity (up to ±22% weight)
      if (userSkinTone && this.personas[i].skin_tone) {
        const pTone = this.personas[i].skin_tone!;
        const skinDist = skinToneDistance(userSkinTone, pTone);
        // skinDist ranges 0-1; 0 = perfect match, 1 = opposite ends
         // Apply as a multiplier: matching skin tone reduces distance by up to 22%,
         // mismatching increases by up to 22%
         const skinFactor = 1.0 + (skinDist - 0.25) * 0.35;
         distance *= Math.max(0.78, Math.min(1.22, skinFactor));
      }

      results[i] = {
        ...this.personas[i],
        distance,
        similarity: distanceToSimilarity(distance),
      };
    }
    // Sort by distance ascending
    results.sort((a, b) => a.distance - b.distance);
    return results;
  }
}

/**
 * Compute a 0-1 skin tone distance between two HSL skin tones.
 * Emphasizes lightness (most perceptible) with some hue/saturation weight.
 */
function skinToneDistance(
  a: { h: number; s: number; l: number },
  b: { h: number; s: number; l: number },
): number {
  // Lightness difference (0-100 range, most important)
  const lDiff = Math.abs(a.l - b.l) / 100;
  // Saturation difference
  const sDiff = Math.abs(a.s - b.s) / 100;
  // Hue difference (circular, 0-180 max)
  const hDiff = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h)) / 180;

  // Weighted: lightness 60%, hue 25%, saturation 15%
  return lDiff * 0.6 + hDiff * 0.25 + sDiff * 0.15;
}

let vectorIndex: VectorIndex | null = null;
let vectorIndexTime = 0;
const PERSONA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getPersonasWithDescriptors(
  supabase: ReturnType<typeof createClient>,
): Promise<{ index: VectorIndex; fromCache: boolean }> {
  const now = Date.now();
  if (vectorIndex && now - vectorIndexTime < PERSONA_CACHE_TTL_MS) {
    return { index: vectorIndex, fromCache: true };
  }
  const { data: allPersonas, error: fetchErr } = await supabase
    .from("personas")
    .select("id, name, name_en, category, description, description_en, image_url, source_image_url, gender, role, face_descriptor, skin_tone")
    .not("face_descriptor", "is", null)
    .not("image_url", "like", "%placeholder%")
    .eq("is_drawing", false)
    .limit(2000);
  if (fetchErr) throw fetchErr;
  const enrolled = (allPersonas ?? []).filter(
    (p: any) => Array.isArray(p.face_descriptor) && p.face_descriptor.length === DESCRIPTOR_LEN,
  ) as CachedPersona[];
  vectorIndex = new VectorIndex(enrolled, DESCRIPTOR_LEN);
  vectorIndexTime = now;
  return { index: vectorIndex, fromCache: false };
}

// --- Result cache: keyed by descriptor hash + filters ---
// If the same face descriptor + filter combo is sent again within TTL,
// return the cached result instantly (< 50ms).
type CachedResult = { body: Record<string, unknown>; at: number };
const resultCache = new Map<string, CachedResult>();
const RESULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESULT_CACHE_MAX = 200;

function resultCacheKey(descriptor: number[], filters: Record<string, string>): string {
  // Quantize descriptor to 3 decimal places to tolerate minor float diffs
  const dStr = descriptor.map((v) => v.toFixed(3)).join(",");
  const fStr = Object.entries(filters).sort().map(([k, v]) => `${k}=${v}`).join("&");
  return `${dStr}|${fStr}`;
}

function pruneResultCache() {
  if (resultCache.size <= RESULT_CACHE_MAX) return;
  const now = Date.now();
  for (const [k, v] of resultCache) {
    if (now - v.at > RESULT_CACHE_TTL_MS) resultCache.delete(k);
  }
  // If still too large, drop oldest half
  if (resultCache.size > RESULT_CACHE_MAX) {
    const entries = [...resultCache.entries()].sort((a, b) => a[1].at - b[1].at);
    const toDrop = Math.floor(entries.length / 2);
    for (let i = 0; i < toDrop; i++) resultCache.delete(entries[i][0]);
  }
}

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

// Euclidean distance between two equal-length vectors.
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// face-api.js descriptor distance is typically 0.3 (very similar) – 1.0+ (different).
// Map to a 5–98% resemblance score with a gentler curve to accommodate more results.
function distanceToSimilarity(distance: number): number {
  // Gentler curve: 0.0→98%, 0.3→88%, 0.5→72%, 0.7→55%, 0.9→38%, 1.0→30%, 1.2→18%
  const normalized = Math.max(0, Math.min(1.5, distance));
  const pct = Math.round(98 * Math.exp(-1.6 * normalized * normalized));
  return Math.max(5, Math.min(98, pct));
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
    name_en?: string | null;
    description_en?: string | null;
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
  // NOTE: figureFor() overlay disabled — always use the actual matched
  // persona's name and description from the DB to avoid showing an
  // unrelated famous figure's name/biography on top of the real match.

  // If the DB name already contains Arabic characters, use it directly
  // instead of the generic fallback translation.
  const hasArabicName = /[\u0600-\u06FF]/.test(p.name);
  const archetypeName = lang === "ar"
    ? (hasArabicName ? p.name : arabicNameFor(p.name, p.category, role, gender))
    : (p.name_en && p.name_en.trim()
        ? p.name_en
        : (hasArabicName ? englishNameFor(p.name, p.category, role, gender) : p.name));
  const localCategory = lang === "ar" ? arabicCategoryFor(p.category) : p.category;
  // If the DB description already contains Arabic text, use it directly.
  const hasArabicDesc = /[\u0600-\u06FF]/.test(p.description ?? "");
  const archetypeDesc = lang === "ar"
    ? (hasArabicDesc ? p.description : arabicDescriptionFor(p.category, role, gender))
    : (p.description_en && p.description_en.trim()
        ? p.description_en
        : (hasArabicDesc ? englishDescriptionFor(p.category, role, gender) : p.description));

  return {
    name: archetypeName,
    category: localCategory,
    description: archetypeDesc,
    figure: null,
  };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const t0 = performance.now();
  const debug: {
    enabled: boolean;
    timings_ms: Record<string, number>;
    descriptor_len: number | null;
    candidates_with_descriptor: number;
    fallback_used: string | null;
    rate_limit_remaining: number;
  } = {
    enabled: false,
    timings_ms: {},
    descriptor_len: null,
    candidates_with_descriptor: 0,
    fallback_used: null,
    rate_limit_remaining: 0,
  };
  const mark = (label: string) => {
    debug.timings_ms[label] = Math.round(performance.now() - t0);
  };

  // Optional API-key gate
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

  // Parse JSON payload
  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  mark("parse_body");

  const debugEnabled = payload.debug === true || payload.debug === "1";
  debug.enabled = debugEnabled;

  const userDescriptor = payload.descriptor;
  if (!Array.isArray(userDescriptor) || userDescriptor.length !== DESCRIPTOR_LEN) {
    return jsonResponse(
      { error: `Missing or invalid 'descriptor' (need ${DESCRIPTOR_LEN}-float array)` },
      400,
    );
  }
  // Validate every element is a finite number.
  for (const v of userDescriptor) {
    if (typeof v !== "number" || !isFinite(v)) {
      return jsonResponse({ error: "Descriptor must contain only finite numbers" }, 400);
    }
  }
  debug.descriptor_len = userDescriptor.length;

  const nationalityCode = ((payload.nationality as string) ?? "").toUpperCase();
  const userSkinTone = payload.skin_tone as { h: number; s: number; l: number } | undefined;
  const gender = ((payload.gender as string) ?? "").toLowerCase();
  const roleFilter = ((payload.role as string) ?? "").toLowerCase().trim();
  const civilizationFilter = ((payload.civilization as string) ?? "").trim();
  const dobRaw = ((payload.date_of_birth as string) ?? "").toString();
  const langRaw = ((payload.lang as string) ?? "en").toString().toLowerCase();
  const lang: "en" | "ar" = langRaw === "ar" ? "ar" : "en";
  const dob = dobRaw ? new Date(dobRaw) : null;
  const zodiac = dob && !isNaN(dob.getTime()) ? getZodiac(dob) : null;
  const traitLine = zodiac ? personalityLine(zodiac, lang) : "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve eligible civilization categories from nationality.
  let eligibleCategories: string[] | null = null;
  if (nationalityCode) {
    const { data: natRow } = await supabase
      .from("nationality_categories")
      .select("categories")
      .eq("nationality_code", nationalityCode)
      .maybeSingle();
    if (natRow?.categories?.length) eligibleCategories = natRow.categories;
  }
  if (civilizationFilter && civilizationFilter.toLowerCase() !== "any") {
    eligibleCategories = [civilizationFilter];
  }

  // Strict gender lock: when the user picks male/female we ONLY return personas
  // of that exact gender (personas marked "any" are excluded so the result is
  // unambiguously male or female to match the user). When no gender is given
  // we allow everything.
  const userGender: "male" | "female" | null =
    gender === "male" || gender === "female" ? gender : null;
  const allowedGenders = userGender ? [userGender] : ["male", "female", "any"];

  function genderMatches(p: { gender?: string | null }) {
    if (!userGender) return true;
    return (p.gender ?? "") === userGender;
  }

  function personaPasses(p: { gender?: string | null; category: string; role?: string | null }) {
    if (!genderMatches(p)) return false;
    if (eligibleCategories && !eligibleCategories.includes(p.category)) return false;
    if (roleFilter && (p.role ?? "") !== roleFilter) return false;
    return true;
  }

  const ipHash = await hashIp(ip);

  // Free-tier hook: count successful queries this IP has had in 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: priorQueryCount } = await supabase
    .from("query_logs")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("success", true)
    .gte("created_at", since);
  const requiresAd = (priorQueryCount ?? 0) >= 1;

  // --- Check result cache ---
  const cacheFilters: Record<string, string> = {
    gender: gender || "",
    role: roleFilter || "",
    civ: civilizationFilter || "",
    nat: nationalityCode || "",
    lang,
    skin: userSkinTone ? `${userSkinTone.h}_${userSkinTone.s}_${userSkinTone.l}` : "off",
  };
  const cKey = resultCacheKey(userDescriptor as number[], cacheFilters);
  const cached = resultCache.get(cKey);
  if (cached && Date.now() - cached.at < RESULT_CACHE_TTL_MS) {
    mark("cache_hit");
    mark("total");
    return jsonResponse({
      ...cached.body,
      rate_limit_remaining: rl.remaining,
      _cached: true,
      ...(debugEnabled ? { _debug: { ...debug, cache: "hit" } } : {}),
    });
  }

  // Fetch personas (from in-memory cache or DB).
  let index: VectorIndex;
  let personaCacheHit = false;
  try {
    const res = await getPersonasWithDescriptors(supabase);
    index = res.index;
    personaCacheHit = res.fromCache;
  } catch (fetchErr) {
    console.error("Failed to load personas:", fetchErr);
    return jsonResponse({ error: "Database error" }, 500);
  }
  mark("load_personas");
  debug.candidates_with_descriptor = index.length;

  // Use the vector index for fast batch distance computation + sorting
  const scored = index.scoreAll(userDescriptor as number[], userSkinTone ?? null);
  mark("scored");

  // Tiered selection — try to return 5 results for more variety.
  type Ranked = {
    match_name: string;
    category: string;
    similarity: number;
    image_url: string;
    source_image_url: string | null;
    description: string;
    historical_figure: { name: string; bio: string } | null;
    persona_id: string;
  };

  const TARGET = 3;
  const ranked: Ranked[] = [];
  const usedIds = new Set<string>();

  function pushFromScored(
    predicate: (p: { gender: string | null; category: string; role: string | null }) => boolean,
  ) {
    for (const s of scored) {
      if (ranked.length >= TARGET) return;
      if (usedIds.has(s.id)) continue;
      if (!predicate(s)) continue;
      const loc = buildLocalized(
        { id: s.id, name: s.name, category: s.category, description: s.description, gender: s.gender, role: s.role, name_en: s.name_en, description_en: s.description_en },
        lang,
      );
      ranked.push({
        match_name: loc.name,
        category: loc.category,
        similarity: s.similarity,
        image_url: s.image_url,
        source_image_url: s.source_image_url,
        description: loc.description,
        historical_figure: loc.figure,
        persona_id: s.id,
      });
      usedIds.add(s.id);
    }
  }

  // Tier 1: strict gender + nationality + role
  pushFromScored(personaPasses);
  // Tier 2: drop role, keep gender + civilization
  if (ranked.length < TARGET) {
    pushFromScored(
      (p) =>
        genderMatches(p) &&
        (!eligibleCategories || eligibleCategories.includes(p.category)),
    );
  }
  // Tier 3: gender only
  if (ranked.length < TARGET) {
    pushFromScored((p) => genderMatches(p));
  }
  // Tier 4: anyone with a descriptor — but NEVER cross gender if the user
  // explicitly picked one. A male user must not get a female result.
  if (ranked.length < TARGET) {
    pushFromScored((p) => genderMatches(p));
  }

  // If nothing has descriptors yet, fall back to a random persona so the user
  // still gets a result. (Should not happen once enrollment is complete.)
  if (ranked.length === 0) {
    debug.fallback_used = "no_enrolled_personas";
    const { data: anyPersonas } = await supabase
      .from("personas")
      .select("id, name, category, description, image_url, source_image_url, gender, role")
      .limit(2000);
    const pool = (anyPersonas ?? []).filter(personaPasses);
    // Final fallback still respects the user's gender if they picked one.
    const fallbackByGender = (anyPersonas ?? []).filter(genderMatches);
    const finalPool =
      pool.length > 0
        ? pool
        : fallbackByGender.length > 0
          ? fallbackByGender
          : (anyPersonas ?? []);
    if (finalPool.length === 0) {
      return jsonResponse({ error: "No personas available" }, 500);
    }
    const random = finalPool[Math.floor(Math.random() * finalPool.length)];
    const fallbackSimilarity = Math.floor(Math.random() * 16) + 60;
    await supabase.from("query_logs").insert({
      ip_hash: ipHash,
      matched_persona_id: random.id,
      similarity: fallbackSimilarity,
      success: true,
      error_code: "fallback_no_enrollment",
    });
    const loc = buildLocalized(random, lang);
    mark("total");
    return jsonResponse({
      match_name: loc.name,
      category: loc.category,
      similarity: fallbackSimilarity,
      image_url: random.image_url,
      source_image_url: (random as any).source_image_url ?? null,
      description: traitLine ? `${loc.description}\n\n${traitLine}` : loc.description,
      historical_figure: loc.figure,
      runners_up: [],
      requires_ad: requiresAd,
      rate_limit_remaining: rl.remaining,
      ...(debugEnabled ? { _debug: debug } : {}),
    });
  }

  const top = ranked[0];

  // Reject results below minimum similarity threshold (30%)
  const MIN_SIMILARITY = 30;
  if (top.similarity < MIN_SIMILARITY) {
    debug.rejected_similarity = top.similarity;
    await supabase.from("query_logs").insert({
      ip_hash: ipHash,
      matched_persona_id: top.persona_id,
      similarity: top.similarity,
      success: false,
      error_code: "low_similarity",
    });
    mark("total");
    return jsonResponse({
      error: lang === "ar"
        ? "لم نجد تطابقًا كافيًا. جرّب صورة أوضح للوجه أو بإضاءة أفضل."
        : "No sufficient match found. Try a clearer face photo with better lighting.",
      similarity: top.similarity,
      requires_ad: requiresAd,
      rate_limit_remaining: rl.remaining,
      ...(debugEnabled ? { _debug: debug } : {}),
    }, 200);
  }

  if (traitLine) {
    top.description = `${top.description}\n\n${traitLine}`;
  }
  await supabase.from("query_logs").insert({
    ip_hash: ipHash,
    matched_persona_id: top.persona_id,
    similarity: top.similarity,
    success: true,
  });

  const stripId = ({ persona_id: _pid, ...rest }: Ranked, rank?: number) => ({
    ...rest,
    ...(rank !== undefined ? { rank } : {}),
  });
  mark("total");

  const responseBody = {
    total_matches: ranked.length,
    best_match: stripId(top, 1),
    matches: ranked.map((r, i) => stripId(r, i + 1)),
    // Backward-compatible fields
    ...stripId(top),
    runners_up: ranked.slice(1).map((r, i) => stripId(r, i + 2)),
    requires_ad: requiresAd,
  };

  // Store in result cache
  pruneResultCache();
  resultCache.set(cKey, { body: responseBody, at: Date.now() });

  return jsonResponse({
    ...responseBody,
    rate_limit_remaining: rl.remaining,
    ...(debugEnabled ? { _debug: { ...debug, cache: "miss", persona_cache: personaCacheHit ? "hit" : "miss" } } : {}),
  });
});
