import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const generatePersonaDescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Verify admin role
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    // Fetch personas with short descriptions
    const { data: personas, error } = await supabaseAdmin
      .from("personas")
      .select("id, name, role, gender, category, description")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(`DB error: ${error.message}`);

    const shortOnes = (personas ?? []).filter(
      (p) => !p.description || p.description.length < 60
    );

    if (shortOnes.length === 0) {
      return { updated: 0, total: 0, message: "All personas already have rich descriptions." };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured on server");

    let updated = 0;
    const errors: string[] = [];

    for (const p of shortOnes) {
      try {
        const prompt = `You are a historian. Write a rich, engaging biographical description in Arabic (3-4 sentences) for this historical persona:
Name: ${p.name}
Role: ${p.role}
Gender: ${p.gender}
Civilization: ${p.category}

Write ONLY the Arabic description, no English, no labels, no quotes.`;

        const resp = await fetch("https://ai.lovable.dev/api/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 500,
          }),
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          if (resp.status === 402) {
            errors.push("Credits exhausted");
            break;
          }
          errors.push(`${p.name}: HTTP ${resp.status} ${txt.slice(0, 100)}`);
          continue;
        }

        const json = await resp.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const desc = json.choices?.[0]?.message?.content?.trim();
        if (!desc || desc.length < 20) {
          errors.push(`${p.name}: empty or too short response`);
          continue;
        }

        const { error: updateErr } = await supabaseAdmin
          .from("personas")
          .update({ description: desc })
          .eq("id", p.id);

        if (updateErr) {
          errors.push(`${p.name}: update failed - ${updateErr.message}`);
        } else {
          updated++;
        }

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 1200));
      } catch (e) {
        errors.push(`${p.name}: ${(e as Error).message}`);
      }
    }

    return {
      updated,
      total: shortOnes.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Updated ${updated}/${shortOnes.length} personas.`,
    };
  });