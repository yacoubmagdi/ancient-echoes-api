// Admin function: enrolls all personas (without a luxand_uuid) into Luxand Cloud
// and stores the returned UUID for later face matching.
// Call once (or after adding new personas) — protected by the SETUP_TOKEN env var.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-setup-token",
};

const LUXAND_BASE = "https://api.luxand.cloud";
const COLLECTION = "historical_personas";

interface Persona {
  id: string;
  name: string;
  category: string;
  image_url: string;
}

async function enrollPersona(token: string, persona: Persona): Promise<string | null> {
  // Download the image as bytes, then upload as multipart file (more reliable than URL)
  let bytes: Uint8Array;
  try {
    const imgResp = await fetch(persona.image_url);
    if (!imgResp.ok) {
      console.error(`Failed to fetch image for ${persona.name}: ${imgResp.status}`);
      return null;
    }
    const buf = await imgResp.arrayBuffer();
    bytes = new Uint8Array(buf);
  } catch (e) {
    console.error(`Image download error for ${persona.name}:`, (e as Error).message);
    return null;
  }

  try {
    const form = new FormData();
    form.append("name", `${persona.name} [${persona.id}]`);
    form.append("store", "1");
    form.append("collections", COLLECTION);
    const file = new File([bytes], `${persona.id}.jpg`, { type: "image/jpeg" });
    form.append("photos", file);

    const resp = await fetch(`${LUXAND_BASE}/v2/person`, {
      method: "POST",
      headers: { token },
      body: form,
    });

    const text = await resp.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* not json */ }

    if (!resp.ok) {
      console.error(`Failed to enroll ${persona.name}: HTTP ${resp.status} body=${text.slice(0, 300)}`);
      return null;
    }
    const uuid = (data as { uuid?: string }).uuid;
    if (!uuid) {
      console.error(`No UUID for ${persona.name}: ${text.slice(0, 300)}`);
      return null;
    }
    return uuid;
  } catch (e) {
    console.error(`Luxand request error for ${persona.name}:`, (e as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Simple shared-secret protection
  const setupToken = Deno.env.get("SETUP_TOKEN");
  if (setupToken && req.headers.get("x-setup-token") !== setupToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const luxandToken = Deno.env.get("LUXAND_API_TOKEN");
  if (!luxandToken) {
    return new Response(JSON.stringify({ error: "LUXAND_API_TOKEN not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Fetch all personas without a luxand_uuid yet
  const { data: personas, error } = await supabase
    .from("personas")
    .select("id, name, category, image_url")
    .is("luxand_uuid", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!personas || personas.length === 0) {
    return new Response(
      JSON.stringify({ message: "All personas already enrolled", enrolled: 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const results: Array<{ name: string; uuid: string | null }> = [];
  for (const persona of personas as Persona[]) {
    const uuid = await enrollPersona(luxandToken, persona);
    results.push({ name: persona.name, uuid });

    if (uuid) {
      await supabase
        .from("personas")
        .update({ luxand_uuid: uuid })
        .eq("id", persona.id);
    }
    // Small delay to be gentle on Luxand's rate limit
    await new Promise((r) => setTimeout(r, 250));
  }

  const successCount = results.filter((r) => r.uuid).length;
  return new Response(
    JSON.stringify({
      enrolled: successCount,
      failed: results.length - successCount,
      results,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});