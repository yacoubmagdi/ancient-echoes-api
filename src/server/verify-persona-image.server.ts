type ImageVerifyInput = {
  name: string;
  role?: string;
  gender?: string;
  description?: string;
  imageUrl: string;
};

type ImageVerifyResult = {
  verdict: "approved" | "rejected" | "needs_revision";
  score: number;
  issues: string[];
  details: {
    skinTone: { ok: boolean; note: string };
    facialFeatures: { ok: boolean; note: string };
    headdressAttire: { ok: boolean; note: string };
    historicalAccuracy: { ok: boolean; note: string };
    overallQuality: { ok: boolean; note: string };
  };
  suggestion: string;
};

export async function verifyPersonaImage(
  input: ImageVerifyInput
): Promise<ImageVerifyResult> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  const prompt = `أنت خبير في الآثار المصرية القديمة وإعادة البناء الوجهي الأثري.

راجع هذه الصورة المولّدة لشخصية مصرية قديمة وقيّم مدى تطابقها مع الأدلة التاريخية.

بيانات الشخصية:
- الاسم: ${input.name}
- الدور: ${input.role || "غير محدد"}
- النوع: ${input.gender === "male" ? "ذكر" : input.gender === "female" ? "أنثى" : "غير محدد"}
- الوصف التاريخي: ${input.description || "لا يوجد"}

معايير التقييم:
1. لون البشرة: يجب أن يكون قمحي/زيتوني كما في بورتريهات الفيوم والتماثيل (ليس أسود داكن وليس أبيض أوروبي)
2. ملامح الوجه: متوسطية شمال أفريقية - عيون لوزية كبيرة، أنف مستقيم أو خفيف الانحناء، شفاه متوسطة
3. الغطاء والملابس: مناسبة للدور التاريخي (تاج، نمس، شعر مستعار ثلاثي، كحل العيون)
4. الدقة التاريخية: تطابق مع التماثيل والنقوش المعروفة لهذه الشخصية أو فترتها الزمنية
5. جودة الصورة: واقعية، جودة متحفية، زاوية أمامية واضحة

أجب بصيغة JSON فقط:
{
  "verdict": "approved" | "rejected" | "needs_revision",
  "score": 0-100,
  "issues": ["مشكلة 1", "مشكلة 2"],
  "details": {
    "skinTone": { "ok": true/false, "note": "ملاحظة" },
    "facialFeatures": { "ok": true/false, "note": "ملاحظة" },
    "headdressAttire": { "ok": true/false, "note": "ملاحظة" },
    "historicalAccuracy": { "ok": true/false, "note": "ملاحظة" },
    "overallQuality": { "ok": true/false, "note": "ملاحظة" }
  },
  "suggestion": "اقتراح لتحسين الصورة إن وجد"
}

قواعد التقييم:
- approved (≥80): الصورة تطابق الأدلة التاريخية بشكل جيد
- needs_revision (50-79): بعض التعديلات مطلوبة
- rejected (<50): لا تطابق الأدلة التاريخية`;

  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: input.imageUrl } },
            ],
          },
        ],
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI image verification failed: ${resp.status} - ${errText.slice(0, 200)}`);
  }

  const aiData = await resp.json();
  const content = aiData?.choices?.[0]?.message?.content ?? "";

  const jsonMatch = content.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      verdict: "needs_revision",
      score: 0,
      issues: ["تعذر تحليل نتيجة التدقيق"],
      details: {
        skinTone: { ok: false, note: "لم يتم التحقق" },
        facialFeatures: { ok: false, note: "لم يتم التحقق" },
        headdressAttire: { ok: false, note: "لم يتم التحقق" },
        historicalAccuracy: { ok: false, note: "لم يتم التحقق" },
        overallQuality: { ok: false, note: "لم يتم التحقق" },
      },
      suggestion: "يرجى إعادة المحاولة",
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      verdict: parsed.verdict || "needs_revision",
      score: typeof parsed.score === "number" ? parsed.score : 0,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      details: {
        skinTone: parsed.details?.skinTone || { ok: false, note: "لم يتم التحقق" },
        facialFeatures: parsed.details?.facialFeatures || { ok: false, note: "لم يتم التحقق" },
        headdressAttire: parsed.details?.headdressAttire || { ok: false, note: "لم يتم التحقق" },
        historicalAccuracy: parsed.details?.historicalAccuracy || { ok: false, note: "لم يتم التحقق" },
        overallQuality: parsed.details?.overallQuality || { ok: false, note: "لم يتم التحقق" },
      },
      suggestion: parsed.suggestion || "",
    };
  } catch {
    return {
      verdict: "needs_revision",
      score: 0,
      issues: ["تعذر تحليل JSON"],
      details: {
        skinTone: { ok: false, note: "لم يتم التحقق" },
        facialFeatures: { ok: false, note: "لم يتم التحقق" },
        headdressAttire: { ok: false, note: "لم يتم التحقق" },
        historicalAccuracy: { ok: false, note: "لم يتم التحقق" },
        overallQuality: { ok: false, note: "لم يتم التحقق" },
      },
      suggestion: "يرجى إعادة المحاولة",
    };
  }
}