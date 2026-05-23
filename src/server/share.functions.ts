import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const saveSharedResult = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        match_name: z.string().min(1).max(200),
        category: z.string().min(1).max(100),
        similarity: z.number().min(0).max(100),
        description: z.string().min(1).max(5000),
        match_image_url: z.string().url().max(2000),
        user_image_data: z.string().max(2_000_000).optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("shared_results")
      .insert({
        match_name: data.match_name,
        category: data.category,
        similarity: data.similarity,
        description: data.description,
        match_image_url: data.match_image_url,
        user_image_data: data.user_image_data ?? null,
      })
      .select("id")
      .limit(1);

    if (error || !rows || rows.length === 0) {
      throw new Error(`Failed to save: ${error?.message ?? "no row"}`);
    }
    return { id: rows[0].id };
  });

export const getSharedResult = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("shared_results")
      .select("id, match_name, category, similarity, description, match_image_url, user_image_data, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) return null;
    return row;
  });