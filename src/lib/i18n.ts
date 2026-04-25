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