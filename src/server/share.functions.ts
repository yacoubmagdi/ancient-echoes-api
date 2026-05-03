import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing server environment variables");
  }
  return { supabaseUrl, anonKey };
}

export const saveSharedResult = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        match_name: z.string(),
        category: z.string(),
        similarity: z.number(),
        description: z.string(),
        match_image_url: z.string(),
        user_image_data: z.string().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { supabaseUrl, anonKey } = getSupabaseConfig();

    const resp = await fetch(`${supabaseUrl}/rest/v1/shared_results`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        match_name: data.match_name,
        category: data.category,
        similarity: data.similarity,
        description: data.description,
        match_image_url: data.match_image_url,
        user_image_data: data.user_image_data ?? null,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to save: ${text}`);
    }

    const rows = await resp.json();
    return { id: rows[0].id };
  });

export const getSharedResult = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseUrl, anonKey } = getSupabaseConfig();

    const resp = await fetch(
      `${supabaseUrl}/rest/v1/shared_results?id=eq.${encodeURIComponent(data.id)}&select=*&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!resp.ok) return null;
    const rows = await resp.json();
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  });