import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import crypto from "crypto";

const ContactSchema = z.object({
  name: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")).nullable(),
  message: z.string().trim().min(1).max(5000),
});

function hashIp(ip: string) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ContactSchema.parse(d))
  .handler(async ({ data }) => {
    const rawIp =
      getRequestIP({ xForwardedFor: true }) ||
      getRequestHeader("x-real-ip") ||
      "unknown";
    const ipKey = `contact:${hashIp(rawIp)}`;

    // 3 messages per 10 minutes per IP
    const { data: allowed, error: rlErr } = await supabaseAdmin.rpc(
      "check_rate_limit",
      { _key: ipKey, _max: 3, _window_seconds: 600 }
    );
    if (rlErr) throw new Error("تعذّر التحقق من معدّل الإرسال");
    if (allowed === false) {
      throw new Error("تم تجاوز الحد المسموح. يرجى المحاولة بعد قليل.");
    }

    const { error } = await supabaseAdmin.from("user_messages").insert({
      name: data.name?.trim() || null,
      email: data.email?.trim() || null,
      message: data.message.trim(),
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });