import { describe, it, expect } from "vitest";
import {
  auditDescription,
  countSentences,
  isDescriptionAcceptable,
} from "../src/lib/description-audit.ts";

describe("countSentences", () => {
  it("counts Arabic sentences split by periods", () => {
    const text = "جملة أولى طويلة بما يكفي. جملة ثانية طويلة كذلك. جملة ثالثة مقبولة.";
    expect(countSentences(text)).toBe(3);
  });

  it("counts sentences split by question marks", () => {
    const text = "هل كان ملكًا عظيمًا؟ نعم كان حاكمًا قويًا وعادلاً.";
    expect(countSentences(text)).toBe(2);
  });

  it("ignores very short fragments", () => {
    const text = "نعم. جملة طويلة بما يكفي للعد.";
    expect(countSentences(text)).toBe(1);
  });
});

describe("auditDescription", () => {
  it("rejects null/undefined descriptions", () => {
    expect(auditDescription(null).valid).toBe(false);
    expect(auditDescription(undefined).valid).toBe(false);
    expect(auditDescription("").valid).toBe(false);
  });

  it("rejects very short descriptions", () => {
    const result = auditDescription("وصف قصير");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("قصير"))).toBe(true);
  });

  it("accepts a well-written historical description", () => {
    const good =
      "كان سنموت مهندسًا معماريًا بارزًا في عهد الملكة حتشبسوت خلال الأسرة الثامنة عشرة. " +
      "أشرف على تصميم وبناء المعبد الجنائزي في الدير البحري. " +
      "يُعتبر من أبرز المهندسين في تاريخ مصر القديمة.";
    const result = auditDescription(good);
    expect(result.valid).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(8);
  });

  it("flags exaggerations in Arabic", () => {
    const exaggerated =
      "كان أعظم شخصية في التاريخ بلا منازع. " +
      "لم يسبق له مثيل في كل العصور. " +
      "حقق إنجازات خارقة لا يمكن وصفها.";
    const result = auditDescription(exaggerated);
    expect(result.issues.some((i) => i.includes("مبالغة"))).toBe(true);
    expect(result.score).toBeLessThan(8);
  });

  it("flags exaggerations in English", () => {
    const eng =
      "He was the greatest ever pharaoh who single-handedly built all pyramids. " +
      "His achievements were unmatched in history and beyond comprehension.";
    const result = auditDescription(eng);
    expect(result.issues.some((i) => i.includes("مبالغة"))).toBe(true);
  });

  it("flags anachronistic terms", () => {
    const anachronistic =
      "استخدم الفرعون الإنترنت للتواصل مع شعبه عبر البريد الإلكتروني. " +
      "كما استعمل الكمبيوتر في إدارة شؤون المملكة.";
    const result = auditDescription(anachronistic);
    expect(result.issues.some((i) => i.includes("عصري"))).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("penalizes descriptions with too few sentences", () => {
    const oneSentence = "كان حاكمًا مصريًا قديمًا حكم في عهد الأسرة الثامنة عشرة وأشرف على بناء المعابد";
    const result = auditDescription(oneSentence);
    expect(result.issues.some((i) => i.includes("عدد الجمل قليل"))).toBe(true);
  });

  it("penalizes excessively long descriptions", () => {
    const long = ("جملة طويلة ومفصلة عن الشخصية التاريخية المصرية. ").repeat(50);
    const result = auditDescription(long);
    expect(result.issues.some((i) => i.includes("طويل"))).toBe(true);
  });
});

describe("isDescriptionAcceptable", () => {
  it("returns true for clean descriptions", () => {
    const clean =
      "كان رخميرع وزيرًا في عهد تحتمس الثالث خلال الأسرة الثامنة عشرة. " +
      "أشرف على الشؤون الإدارية والقضائية للمملكة. " +
      "تُعد مقبرته من أغنى المقابر بالنقوش التي تصف واجبات الوزير.";
    expect(isDescriptionAcceptable(clean)).toBe(true);
  });

  it("returns false for exaggerated descriptions", () => {
    const bad =
      "أعظم شخصية في التاريخ بلا منازع. " +
      "لم يسبق له مثيل ولا يمكن مقارنته بأي إنسان آخر.";
    expect(isDescriptionAcceptable(bad)).toBe(false);
  });

  it("supports custom threshold", () => {
    const mediocre =
      "كان حاكمًا مصريًا قديمًا حكم في عهد الأسرة الثامنة عشرة وأشرف على بناء المعابد";
    expect(isDescriptionAcceptable(mediocre, 3)).toBe(true);
  });
});
