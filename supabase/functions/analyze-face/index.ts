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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

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

  const photo = formData.get("photo");
  if (!(photo instanceof File)) {
    return jsonResponse({ error: "Missing 'photo' file field" }, 400);
  }
  const nationalityCode = (formData.get("nationality") ?? "").toString().toUpperCase();
  const gender = (formData.get("gender") ?? "").toString().toLowerCase();
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

  function personaPasses(p: { gender?: string | null; category: string }) {
    if (!allowedGenders.includes(p.gender ?? "any")) return false;
    if (eligibleCategories && !eligibleCategories.includes(p.category)) return false;
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
  const luxandForm = new FormData();
  luxandForm.append("photo", photo, photo.name || "upload.jpg");
  luxandForm.append("collections", COLLECTION);

  let luxandResp: Response;
  try {
    luxandResp = await fetch(`${LUXAND_BASE}/photo/search`, {
      method: "POST",
      headers: { token: luxandToken },
      body: luxandForm,
    });
  } catch (err) {
    console.error("Luxand network error:", err);
    await supabase.from("query_logs").insert({
      ip_hash: ipHash,
      success: false,
      error_code: "luxand_network",
    });
    return jsonResponse({ error: "Face recognition service unavailable" }, 502);
  }

  const rawText = await luxandResp.text();
  let luxandData: unknown;
  try {
    luxandData = JSON.parse(rawText);
  } catch {
    luxandData = rawText;
  }

  if (!luxandResp.ok) {
    console.error("Luxand error:", luxandResp.status, luxandData);
    await supabase.from("query_logs").insert({
      ip_hash: ipHash,
      success: false,
      error_code: `luxand_${luxandResp.status}`,
    });
    const message =
      typeof luxandData === "object" && luxandData && "message" in luxandData
        ? (luxandData as { message: string }).message
        : "Face recognition failed";
    return jsonResponse({ error: message }, 422);
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
    // Fallback: no resemblance found — pick a random persona so the user always gets a result.
    const { data: allPersonas } = await supabase
      .from("personas")
      .select("id, name, category, description, image_url, gender");
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
    return jsonResponse({
      match_name: random.name,
      category: random.category,
      similarity: fallbackSimilarity,
      image_url: random.image_url,
      description: traitLine ? `${random.description}\n\n${traitLine}` : random.description,
      runners_up: [],
      requires_ad: requiresAd,
      rate_limit_remaining: rl.remaining,
    });
  }

  // Sort by probability desc just to be safe
  matches.sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
  // Pull a wider slice so we have candidates left after gender/nationality filtering.
  const candidateMatches = matches.slice(0, 20);
  const candidateIds = candidateMatches
    .map((m) => extractPersonaId(m.name))
    .filter((x): x is string => Boolean(x));

  const { data: personas } = await supabase
    .from("personas")
    .select("id, name, category, description, image_url, gender")
    .in("id", candidateIds);

  const personaById = new Map((personas ?? []).map((p) => [p.id, p]));

  // First pass: keep only personas that match gender + nationality.
  let ranked = candidateMatches.flatMap((m) => {
    const pid = extractPersonaId(m.name);
    const persona = pid ? personaById.get(pid) : null;
    if (!persona || !personaPasses(persona)) return [];
    return [
      {
        match_name: persona.name,
        category: persona.category,
        similarity: Math.round((m.probability ?? 0) * 100),
        image_url: persona.image_url,
        description: persona.description,
      },
    ];
  });

  // Fallback: if filtering removed everything, drop nationality filter but keep gender.
  if (ranked.length === 0) {
    ranked = candidateMatches.flatMap((m) => {
      const pid = extractPersonaId(m.name);
      const persona = pid ? personaById.get(pid) : null;
      if (!persona) return [];
      if (!allowedGenders.includes(persona.gender ?? "any")) return [];
      return [
        {
          match_name: persona.name,
          category: persona.category,
          similarity: Math.round((m.probability ?? 0) * 100),
          image_url: persona.image_url,
          description: persona.description,
        },
      ];
    });
  }

  // Last resort: pick a random persona that passes gender + nationality (or just gender).
  if (ranked.length === 0) {
    const { data: allPersonas } = await supabase
      .from("personas")
      .select("id, name, category, description, image_url, gender");
    const pool = (allPersonas ?? []).filter(personaPasses);
    const finalPool = pool.length > 0
      ? pool
      : (allPersonas ?? []).filter((p) => allowedGenders.includes(p.gender ?? "any"));
    if (finalPool.length > 0) {
      const random = finalPool[Math.floor(Math.random() * finalPool.length)];
      const fallbackSimilarity = Math.floor(Math.random() * 16) + 60;
      ranked = [{
        match_name: random.name,
        category: random.category,
        similarity: fallbackSimilarity,
        image_url: random.image_url,
        description: random.description,
      }];
    }
  }

  // Keep top 3 after filtering.
  ranked = ranked.slice(0, 3);

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
  const topPid =
    candidateMatches
      .map((m) => extractPersonaId(m.name))
      .find((id) => id && personaById.get(id)?.name === top.match_name) ?? null;
  await supabase.from("query_logs").insert({
    ip_hash: ipHash,
    matched_persona_id: topPid ?? null,
    similarity: top.similarity,
    success: true,
  });

  return jsonResponse({
    ...top,
    runners_up: ranked.slice(1),
    requires_ad: requiresAd,
    rate_limit_remaining: rl.remaining,
  });
});