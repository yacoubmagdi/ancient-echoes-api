import { createClient } from "@supabase/supabase-js";

export type SourceMatchVerdict = "match" | "partial" | "mismatch" | "no_source" | "fetch_error";

export type SourceMatchResult = {
  persona_id: string;
  persona_name: string;
  category: string;
  source_url: string | null;
  wiki_title: string;
  wiki_extract: string;
  description: string;
  verdict: SourceMatchVerdict;
  confidence: number;
  reason: string;
};

async function fetchWikiSummary(url: string): Promise<{ title: string; extract: string } | null> {
  try {
    const m = url.match(/\/\/([a-z]{2,3})\.wikipedia\.org\/wiki\/(.+?)(?:#.*)?$/);
    if (!m) return null;
    const [, lang, slug] = m;
    const apiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(apiUrl, {
      signal: ctrl.signal,
      headers: { "User-Agent": "PharaonicReviewBot/1.0" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const d = (await r.json()) as { title?: string; extract?: string };
    return { title: d.title || "", extract: d.extract || "" };
  } catch {
    return null;
  }
}

async function aiCompare(
  name: string,
  description: string,
  wikiTitle: string,
  wikiExtract: string
): Promise<{ verdict: SourceMatchVerdict; confidence: number; reason: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) {
    return { verdict: "fetch_error", confidence: 0, reason: "LOVABLE_API_KEY غير مهيأ" };
  }

  const prompt = `أنت خبير فى التاريخ المصرى القديم. قيّم التطابق الثلاثى بين: (1) اسم الشخصية، (2) الوصف المحفوظ، (3) صفحة المصدر التاريخى من ويكيبيديا.

اسم الشخصية: ${name}

الوصف المحفوظ فى قاعدة البيانات:
"""${description}"""

عنوان صفحة ويكيبيديا: ${wikiTitle}
ملخص ويكيبيديا:
"""${wikiExtract}"""

أعد JSON فقط بهذا الشكل:
{
  "name_matches_source": true | false,
  "name_matches_description": true | false,
  "description_matches_source": true | false,
  "verdict": "match" | "partial" | "mismatch",
  "confidence": 0.0-1.0,
  "reason": "شرح موجز بالعربية (سطر أو سطرين) يوضح أى الفحوص الثلاثة فشل ولماذا"
}

قواعد الحكم:
- "match": الفحوص الثلاثة ناجحة (الاسم يطابق الصفحة والوصف، والوصف متوافق مع المصدر بدون تناقضات).
- "partial": واحد على الأكثر من الفحوص فشل بشكل بسيط (مثل تفاصيل إضافية فى الوصف غير مذكورة فى المصدر، أو صفحة سياقية مرتبطة بالشخصية).
- "mismatch": الاسم لا يطابق صفحة المصدر، أو الوصف يتحدث عن شخص مختلف، أو تناقض جوهرى بين الوصف والمصدر.
- اعتبر الاختلافات فى النقحرة (مثل Ramesses/Ramses، تحوتمس/Thutmose) تطابقاً.`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { verdict: "fetch_error", confidence: 0, reason: `AI ${resp.status}: ${t.slice(0, 120)}` };
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const jm = content.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
    if (!jm) return { verdict: "fetch_error", confidence: 0, reason: "تعذر تحليل رد الذكاء الاصطناعي" };
    const parsed = JSON.parse(jm[0]);
    const v = parsed.verdict as SourceMatchVerdict;
    const checks: string[] = [];
    if (parsed.name_matches_source === false) checks.push("الاسم↔المصدر");
    if (parsed.name_matches_description === false) checks.push("الاسم↔الوصف");
    if (parsed.description_matches_source === false) checks.push("الوصف↔المصدر");
    const reasonText = checks.length
      ? `فشل: ${checks.join("، ")}. ${parsed.reason || ""}`.trim()
      : parsed.reason || "";
    return {
      verdict: v === "match" || v === "partial" || v === "mismatch" ? v : "fetch_error",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reason: reasonText,
    };
  } catch (e) {
    return { verdict: "fetch_error", confidence: 0, reason: (e as Error).message };
  }
}

export async function reviewSourceMatchBatch(ids?: string[], category?: string): Promise<SourceMatchResult[]> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  let q = sb.from("personas").select("id, name, category, description, source_image_url");
  if (ids && ids.length > 0) q = q.in("id", ids);
  if (category) q = q.eq("category", category);

  const { data, error } = await q.order("name");
  if (error) throw new Error(error.message);

  const personas = data || [];
  const results: SourceMatchResult[] = [];
  const BATCH = 4;

  for (let i = 0; i < personas.length; i += BATCH) {
    const slice = personas.slice(i, i + BATCH);
    const chunk = await Promise.all(
      slice.map(async (p): Promise<SourceMatchResult> => {
        const base = {
          persona_id: p.id,
          persona_name: p.name,
          category: p.category,
          source_url: p.source_image_url,
          description: p.description || "",
        };
        if (!p.source_image_url) {
          return { ...base, wiki_title: "", wiki_extract: "", verdict: "no_source", confidence: 0, reason: "لا يوجد رابط مصدر تاريخي" };
        }
        const wiki = await fetchWikiSummary(p.source_image_url);
        if (!wiki) {
          return { ...base, wiki_title: "", wiki_extract: "", verdict: "fetch_error", confidence: 0, reason: "تعذر جلب صفحة ويكيبيديا" };
        }
        const ai = await aiCompare(p.name, p.description || "", wiki.title, wiki.extract);
        return { ...base, wiki_title: wiki.title, wiki_extract: wiki.extract, ...ai };
      })
    );
    results.push(...chunk);
  }

  return results;
}

export async function deletePersonasByIds(ids: string[]): Promise<{ deleted: number }> {
  if (!ids.length) return { deleted: 0 };
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error, count } = await sb.from("personas").delete({ count: "exact" }).in("id", ids);
  if (error) throw new Error(error.message);
  return { deleted: count || 0 };
}