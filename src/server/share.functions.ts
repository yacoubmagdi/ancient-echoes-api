import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
    );

    const { data: row, error } = await supabase
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
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const getSharedResult = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
    );

    const { data: row, error } = await supabase
      .from("shared_results")
      .select("*")
      .eq("id", data.id)
      .single();

    if (error || !row) return null;
    return row;
  });