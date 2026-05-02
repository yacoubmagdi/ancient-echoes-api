import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function getSupabaseConfig() {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "https://kfycwzfhyermjhupyrpk.supabase.co";
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmeWN3emZoeWVybWpodXB5cnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MjA5NTMsImV4cCI6MjA5MjQ5Njk1M30.2j95N0uQNWUZV8f32_GRwfmL_2oL0UhX5QlQ28oenL4";
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