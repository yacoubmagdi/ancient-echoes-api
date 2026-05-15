import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import crypto from "crypto";

const ALLOWED_ADMIN_EMAIL = "yacoubmgy@gmail.com";
const APPROVER_EMAIL = "yacoubmagdyyacoub@gmail.com";

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export const requestAdminOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined)?.toLowerCase();
    if (email !== ALLOWED_ADMIN_EMAIL) {
      throw new Error("Unauthorized");
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertErr } = await supabaseAdmin
      .from("admin_otp_codes")
      .insert({
        user_id: userId,
        code_hash: hashCode(code),
        expires_at: expiresAt,
      });
    if (insertErr) throw new Error(insertErr.message);

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY missing");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Admin Auth <onboarding@resend.dev>",
        to: [APPROVER_EMAIL],
        subject: "رمز تصريح دخول الأدمن",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: auto;">
            <h2>طلب تصريح دخول الأدمن</h2>
            <p>تم طلب تسجيل دخول جديد إلى لوحة الإدارة من البريد <strong>${email}</strong>.</p>
            <p>الرمز الصالح لمدة 10 دقائق:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px; background: #f3f4f6; text-align: center; border-radius: 8px; margin: 16px 0;">${code}</div>
            <p style="color: #6b7280; font-size: 12px;">إذا لم تتعرف على هذا الطلب، تجاهل هذه الرسالة.</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Email send failed: ${res.status} ${t.slice(0, 200)}`);
    }

    return { sent: true, sentTo: APPROVER_EMAIL.replace(/(.{3}).*(@.*)/, "$1***$2") };
  });

export const verifyAdminOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined)?.toLowerCase();
    if (email !== ALLOWED_ADMIN_EMAIL) {
      throw new Error("Unauthorized");
    }

    const codeHash = hashCode(data.code);
    const { data: row, error } = await supabaseAdmin
      .from("admin_otp_codes")
      .select("id, expires_at, used")
      .eq("user_id", userId)
      .eq("code_hash", codeHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) throw new Error("رمز غير صحيح");
    if (row.used) throw new Error("الرمز مستخدم بالفعل");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("انتهت صلاحية الرمز");

    await supabaseAdmin
      .from("admin_otp_codes")
      .update({ used: true })
      .eq("id", row.id);

    return { ok: true };
  });