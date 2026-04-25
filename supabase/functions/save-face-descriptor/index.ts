// Admin endpoint: stores face descriptors computed in the browser.
// The browser uses face-api.js to extract a 128-float vector from each persona
// portrait and posts it here for persistent storage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  // Verify admin role
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

  // Parse payload: either { id, descriptor } or { items: [{ id, descriptor }, ...] }
  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  type Item = { id: string; descriptor: number[] | null };
  let items: Item[] = [];
  if (Array.isArray(payload.items)) {
    items = payload.items as Item[];
  } else if (typeof payload.id === "string") {
    items = [{ id: payload.id, descriptor: payload.descriptor as number[] | null }];
  } else {
    return json({ error: "Provide id+descriptor or items[]" }, 400);
  }

  // Validate each item
  for (const it of items) {
    if (!it.id || typeof it.id !== "string") {
      return json({ error: "Each item needs a string id" }, 400);
    }
    if (it.descriptor !== null) {
      if (!Array.isArray(it.descriptor) || it.descriptor.length !== 128) {
        return json(
          { error: `Descriptor for ${it.id} must be an array of 128 numbers` },
          400,
        );
      }
    }
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let updated = 0;
  const failed: { id: string; error: string }[] = [];
  for (const it of items) {
    const { error } = await admin
      .from("personas")
      .update({ face_descriptor: it.descriptor })
      .eq("id", it.id);
    if (error) {
      failed.push({ id: it.id, error: error.message });
    } else {
      updated++;
    }
  }

  return json({ updated, failed_count: failed.length, failed });
});