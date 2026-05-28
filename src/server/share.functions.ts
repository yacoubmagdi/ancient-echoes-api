import { Buffer } from "node:buffer";
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
        share_image_data: z.string().max(8_000_000).optional(),
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

    const share_image_url = data.share_image_data
      ? await uploadShareCard(rows[0].id, data.share_image_data)
      : null;

    return { id: rows[0].id, share_image_url };
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

async function uploadShareCard(id: string, dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  const path = `og-cache/${id}_share.png`;

  const { error } = await supabaseAdmin.storage
    .from("personas")
    .upload(path, bytes, { contentType, upsert: true });

  if (error) return null;

  const { data } = supabaseAdmin.storage.from("personas").getPublicUrl(path);
  return data.publicUrl;
}