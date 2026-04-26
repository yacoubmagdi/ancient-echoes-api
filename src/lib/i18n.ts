import { createContext, useContext } from "react";

export type Lang = "en" | "ar";

export const translations = {
  en: {
    badge: "AI Face Matching",
    title: "Echoes of the Ancients",
    subtitle:
      "Upload your portrait. Discover which legendary persona — pharaoh, viking, samurai, philosopher, or emperor — your face echoes through history.",
    consulting: "Consulting the ancients…",
    uploadCta: "Upload a clear face photo",
    uploadHint: "JPG, PNG or WEBP · max 8 MB · one face, well-lit",
    tryAnother: "Try another photo",
    youEcho: "You echo",
    resemblance: "Resemblance",
    adNote:
      "✨ Ad would play here on additional reads (free first reading per day).",
    alsoResemble: "You also resemble",
    footer:
      "Powered by Luxand Cloud face recognition · historical personas across 5 civilizations",
    langLabel: "العربية",
    dobLabel: "Date of birth",
    dobPlaceholder: "Pick your date of birth",
    dobRequired: "Please select your date of birth first.",
    nationalityLabel: "Nationality",
    nationalityPlaceholder: "Select your nationality",
    nationalityRequired: "Please select your nationality first.",
    nationalitySearchPlaceholder: "Search nationality…",
    nationalityNoResults: "No nationality found.",
    genderLabel: "Gender",
    genderMale: "Male",
    genderFemale: "Female",
    genderRequired: "Please select your gender first.",
    roleLabel: "Preferred role",
    rolePlaceholder: "Pick a role (optional)",
    roleAny: "Any role",
    roleRoyalty: "Royalty",
    roleWarrior: "Warrior",
    rolePriest: "Priest / Mystic",
    roleScholar: "Scholar / Sage",
    roleArtist: "Artist / Poet",
    roleCraftsman: "Craftsman / Builder",
    roleExplorer: "Explorer / Hunter",
    roleNoble: "Noble",
    civilizationLabel: "Civilization",
    civilizationPlaceholder: "Pick a civilization (optional)",
    civilizationAny: "Any civilization",
    civPharaoh: "Pharaoh (Ancient Egypt)",
    civGreek: "Greek",
    civPersian: "Persian",
    civSamurai: "Samurai (Japan)",
    civViking: "Viking",
    civChinese: "Chinese (Imperial China)",
  },
  ar: {
    badge: "مطابقة الوجه بالذكاء الاصطناعي",
    title: "أصداء القدماء",
    subtitle:
      "ارفع صورتك واكتشف أيّ شخصية أسطورية — فرعون، فايكنغ، ساموراي، فيلسوف، أو إمبراطور — يشبهها وجهك عبر التاريخ.",
    consulting: "نستشير القدماء…",
    uploadCta: "ارفع صورة واضحة لوجهك",
    uploadHint: "JPG أو PNG أو WEBP · بحدّ أقصى 8 ميغابايت · وجه واحد بإضاءة جيدة",
    tryAnother: "جرّب صورة أخرى",
    youEcho: "أنت تشبه",
    resemblance: "نسبة التشابه",
    adNote: "✨ سيظهر إعلان هنا في القراءات الإضافية (القراءة الأولى مجانية يوميًا).",
    alsoResemble: "تشبه أيضًا",
    footer:
      "مدعوم بتقنية Luxand Cloud للتعرف على الوجوه · شخصيات تاريخية من 5 حضارات",
    langLabel: "English",
    dobLabel: "تاريخ الميلاد",
    dobPlaceholder: "اختر تاريخ ميلادك",
    dobRequired: "يرجى تحديد تاريخ ميلادك أولًا.",
    nationalityLabel: "الجنسية",
    nationalityPlaceholder: "اختر جنسيتك",
    nationalityRequired: "يرجى تحديد جنسيتك أولًا.",
    nationalitySearchPlaceholder: "ابحث عن جنسيتك…",
    nationalityNoResults: "لا توجد جنسية مطابقة.",
    genderLabel: "النوع",
    genderMale: "ذكر",
    genderFemale: "أنثى",
    genderRequired: "يرجى تحديد النوع أولًا.",
    roleLabel: "الدور المفضّل",
    rolePlaceholder: "اختر دورًا (اختياري)",
    roleAny: "أي دور",
    roleRoyalty: "ملك / حاكم",
    roleWarrior: "محارب",
    rolePriest: "كاهن / متصوّف",
    roleScholar: "عالِم / حكيم",
    roleArtist: "فنان / شاعر",
    roleCraftsman: "حِرَفي / بنّاء",
    roleExplorer: "مستكشف / صياد",
    roleNoble: "نبيل",
    civilizationLabel: "الحضارة",
    civilizationPlaceholder: "اختر حضارة (اختياري)",
    civilizationAny: "أي حضارة",
    civPharaoh: "الفراعنة (مصر القديمة)",
    civGreek: "الإغريق",
    civPersian: "الفرس",
    civSamurai: "الساموراي (اليابان)",
    civViking: "الفايكنج",
    civChinese: "الصينيون (الصين الإمبراطورية)",
  },
} as const;

export type Dict = (typeof translations)[Lang];

export const I18nContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
});

export const useI18n = () => useContext(I18nContext);