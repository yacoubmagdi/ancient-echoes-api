import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const analyzeFaceInputSchema = z.object({
  descriptor: z.array(z.number().finite()).length(128),
  lang: z.enum(["ar", "en"]).default("en"),
  date_of_birth: z.string().optional(),
  nationality: z.string().optional(),
  gender: z.string().optional(),
  role: z.string().optional(),
  civilization: z.string().optional(),
  skin_tone: z
    .object({
      h: z.number().finite(),
      s: z.number().finite(),
      l: z.number().finite(),
    })
    .optional(),
});

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing server environment variables");
  }

  return { supabaseUrl, anonKey };
}

export const analyzeFace = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => analyzeFaceInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseUrl, anonKey } = getSupabaseConfig();

    let resp: Response;
    try {
      resp = await fetch(`${supabaseUrl}/functions/v1/analyze-face`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error("analyze-face request failed:", error);
      throw new Error("تعذر الاتصال بخدمة المطابقة. حاول مرة أخرى.");
    }

    const body = await resp.json().catch(() => ({ error: "Invalid server response" }));

    if (!resp.ok) {
      throw new Error((body as { error?: string })?.error ?? `Request failed (${resp.status})`);
    }

    return body;
  });