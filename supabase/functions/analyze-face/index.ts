// POST /analyze-face — accepts a user image (multipart/form-data, field "photo"),
// validates it, calls Luxand /photo/search restricted to our personas collection,
// and returns the top match plus the next two runners-up.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

const LUXAND_BASE = "https://api.luxand.cloud";
const COLLECTION = "historical_personas";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

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
    await supabase.from("query_logs").insert({
      ip_hash: ipHash,
      success: false,
      error_code: "no_match",
    });
    return jsonResponse(
      {
        error:
          "No face detected, or no resemblance found. Try a clearer, well-lit photo of one face.",
      },
      422,
    );
  }

  // Sort by probability desc just to be safe
  matches.sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
  const topUuids = matches.slice(0, 3).map((m) => m.uuid).filter(Boolean) as string[];

  const { data: personas } = await supabase
    .from("personas")
    .select("id, name, category, description, image_url, luxand_uuid")
    .in("luxand_uuid", topUuids);

  const personaByUuid = new Map(
    (personas ?? []).map((p) => [p.luxand_uuid, p]),
  );

  const ranked = matches.slice(0, 3).flatMap((m) => {
    const persona = m.uuid ? personaByUuid.get(m.uuid) : null;
    if (!persona) return [];
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

  if (ranked.length === 0) {
    return jsonResponse(
      { error: "Match found but persona record missing. Try again." },
      500,
    );
  }

  const top = ranked[0];
  await supabase.from("query_logs").insert({
    ip_hash: ipHash,
    matched_persona_id: personaByUuid.get(matches[0].uuid!)?.id ?? null,
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