// Admin operations for personas (requires admin role).
// Actions: re-enroll a persona's face into Luxand, delete it from Luxand,
// and run a similarity test (upload a face, return top matches scoped to one persona or globally).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const LUXAND_BASE = "https://api.luxand.cloud";
const COLLECTION = "historical_personas";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function enrollImage(token: string, name: string, bytes: Uint8Array, id: string): Promise<{ uuid: string | null; error?: string }> {
  const form = new FormData();
  form.append("name", `${name} [${id}]`);
  form.append("store", "1");
  form.append("collections", COLLECTION);
  form.append("photos", new Blob([bytes.buffer as ArrayBuffer], { type: "image/jpeg" }), `${id}.jpg`);
  const resp = await fetch(`${LUXAND_BASE}/v2/person`, { method: "POST", headers: { token }, body: form });
  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "");
    return { uuid: null, error: errorText.slice(0, 300) || `HTTP ${resp.status}` };
  }
  const data = await resp.json().catch(() => ({}));
  return { uuid: (data as { uuid?: string }).uuid ?? null };
}

async function deleteFromLuxand(token: string, uuid: string) {
  try {
    await fetch(`${LUXAND_BASE}/v2/person/${uuid}`, { method: "DELETE", headers: { token } });
  } catch (_) { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const luxandToken = Deno.env.get("LUXAND_API_TOKEN");
  if (!luxandToken) return json({ error: "LUXAND_API_TOKEN not configured" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  // Use the user's JWT to verify they are admin (RLS-aware client)
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const { data: isAdmin } = await userClient.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "Forbidden: admin role required" }, 403);

  // Service-role client for write operations
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: Record<string, unknown> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) payload = await req.json();
  } catch (_) { /* */ }

  const action = (payload.action ?? "").toString();

  if (action === "reenroll") {
    const personaId = (payload.personaId ?? "").toString();
    if (!personaId) return json({ error: "personaId required" }, 400);
    const { data: persona, error } = await admin
      .from("personas")
      .select("id, name, image_url, luxand_uuid")
      .eq("id", personaId)
      .single();
    if (error || !persona) return json({ error: "Persona not found" }, 404);

    const imgResp = await fetch(persona.image_url);
    if (!imgResp.ok) return json({ error: `Failed to fetch image (${imgResp.status})` }, 400);
    const bytes = new Uint8Array(await imgResp.arrayBuffer());

    const enrollment = await enrollImage(luxandToken, persona.name, bytes, persona.id);
    if (!enrollment.uuid) {
      return json({ error: `Luxand enrollment failed: ${enrollment.error ?? "face not detected"}` }, 400);
    }

    if (persona.luxand_uuid && persona.luxand_uuid !== enrollment.uuid) {
      await deleteFromLuxand(luxandToken, persona.luxand_uuid);
    }

    await admin.from("personas").update({ luxand_uuid: enrollment.uuid }).eq("id", persona.id);
    return json({ ok: true, luxand_uuid: enrollment.uuid });
  }

  if (action === "luxand_delete") {
    const uuid = (payload.luxand_uuid ?? "").toString();
    if (!uuid) return json({ error: "luxand_uuid required" }, 400);
    await deleteFromLuxand(luxandToken, uuid);
    return json({ ok: true });
  }

  if (action === "similarity") {
    const imageBase64 = (payload.imageBase64 ?? "").toString();
    const personaId = (payload.personaId ?? "").toString() || null;
    if (!imageBase64) return json({ error: "imageBase64 required" }, 400);

    // strip data URL prefix if present
    const b64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const form = new FormData();
    form.append("photo", new Blob([binary.buffer as ArrayBuffer], { type: "image/jpeg" }), "probe.jpg");
    form.append("collections", COLLECTION);

    const resp = await fetch(`${LUXAND_BASE}/photo/search/v2`, {
      method: "POST",
      headers: { token: luxandToken },
      body: form,
    });
    const text = await resp.text();
    if (!resp.ok) return json({ error: `Luxand error: ${text.slice(0, 300)}` }, 400);
    let data: unknown = null;
    try { data = JSON.parse(text); } catch { /* */ }

    // Normalize matches into [{uuid, name, probability}]
    type Match = { uuid: string; name: string; probability: number };
    const matches: Match[] = [];
    const arr = Array.isArray(data) ? data : (Array.isArray((data as any)?.matches) ? (data as any).matches : []);
    for (const m of arr) {
      const uuid = m.uuid ?? m.person_uuid ?? m.id ?? "";
      const name = m.name ?? "";
      const probability = Number(m.probability ?? m.confidence ?? m.similarity ?? 0);
      if (uuid) matches.push({ uuid, name, probability });
    }

    let scopedMatch: Match | null = null;
    if (personaId) {
      const { data: p } = await admin
        .from("personas")
        .select("luxand_uuid")
        .eq("id", personaId)
        .single();
      const targetUuid = p?.luxand_uuid;
      scopedMatch = matches.find((m) => m.uuid === targetUuid) ?? { uuid: targetUuid ?? "", name: "", probability: 0 };
    }

    return json({ matches: matches.slice(0, 10), scopedMatch });
  }

  return json({ error: "Unknown action" }, 400);
});