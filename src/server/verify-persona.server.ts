import { createClient } from "@supabase/supabase-js";

type VerifyInput = {
  name: string;
  category: string;
  role?: string;
  gender?: string;
  description?: string;
};

type VerifyResult = {
  verdict: "accepted" | "rejected" | "uncertain";
  reason: string;
  sources: string[];
  confidence: number;
  correctedName?: string;
  correctedDescription?: string;
};

export async function verifyPersonaHistorically(
  input: VerifyInput
): Promise<VerifyResult> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  const prompt = `You are an expert Egyptologist and historian. Verify if this ancient Egyptian persona is a real, historically documented figure.

Persona details:
- Name: ${input.name}
- Role: ${input.role || "unknown"}
- Gender: ${input.gender || "unknown"}
- Category: ${input.category}
- Description: ${input.description || "none provided"}

Your task:
1. Determine if this person actually existed in ancient Egyptian history
2. Check if the description is historically accurate
3. Identify any factual errors
4. Provide source references (museums, archaeological sites, papyri, inscriptions)

Respond ONLY with a JSON object:
{
  "verdict": "accepted" | "rejected" | "uncertain",
  "reason": "detailed explanation in Arabic of why accepted/rejected/uncertain",
  "sources": ["source1", "source2"],
  "confidence": 0.0-1.0,
  "correctedName": "corrected name if needed, or null",
  "correctedDescription": "corrected description if needed, or null"
}

Rules:
- "accepted": The person is well-documented historically with archaeological evidence
- "rejected": No historical evidence exists, or the person is clearly fictional
- "uncertain": Some evidence exists but details are debatable or poorly documented
- Always explain in Arabic
- Include specific archaeological references (tomb numbers, museum artifacts, papyri)`;

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
        messages: [{ role: "user", content: prompt }],
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI verification failed: ${resp.status} - ${errText.slice(0, 200)}`);
  }

  const aiData = await resp.json();
  const content = aiData?.choices?.[0]?.message?.content ?? "";

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      verdict: "uncertain",
      reason: "تعذر تحليل نتيجة التحقق من الذكاء الاصطناعي",
      sources: [],
      confidence: 0,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      verdict: parsed.verdict || "uncertain",
      reason: parsed.reason || "لا يوجد سبب محدد",
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      correctedName: parsed.correctedName || undefined,
      correctedDescription: parsed.correctedDescription || undefined,
    };
  } catch {
    return {
      verdict: "uncertain",
      reason: "تعذر تحليل نتيجة التحقق",
      sources: [],
      confidence: 0,
    };
  }
}