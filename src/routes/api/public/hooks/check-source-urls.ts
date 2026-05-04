import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/check-source-urls")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("apikey") || request.headers.get("authorization")?.replace("Bearer ", "");

        if (!authHeader) {
          return new Response(
            JSON.stringify({ error: "Missing authorization" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }

        const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
        const supabase = createClient(supabaseUrl!, authHeader, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // Fetch all personas with source URLs
        const { data: personas, error: fetchError } = await supabase
          .from("personas")
          .select("id, name, source_image_url")
          .not("source_image_url", "is", null)
          .neq("source_image_url", "");

        if (fetchError) {
          console.error("Failed to fetch personas:", fetchError);
          return new Response(
            JSON.stringify({ error: fetchError.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        const batchId = crypto.randomUUID();
        const results: Array<{
          batch_id: string;
          persona_id: string;
          persona_name: string;
          source_url: string;
          status_code: number | null;
          is_ok: boolean;
          error_message: string | null;
        }> = [];

        // Check URLs in batches of 10 to avoid overwhelming
        const BATCH_SIZE = 10;
        for (let i = 0; i < (personas?.length || 0); i += BATCH_SIZE) {
          const batch = personas!.slice(i, i + BATCH_SIZE);
          const checks = batch.map(async (persona) => {
            const url = persona.source_image_url;
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 15000);
              const res = await fetch(url, {
                method: "HEAD",
                signal: controller.signal,
                headers: {
                  "User-Agent": "PharaonicPersonaBot/1.0 (URL health check)",
                },
                redirect: "follow",
              });
              clearTimeout(timeout);

              results.push({
                batch_id: batchId,
                persona_id: persona.id,
                persona_name: persona.name,
                source_url: url,
                status_code: res.status,
                is_ok: res.status >= 200 && res.status < 400,
                error_message: res.status >= 400 ? `HTTP ${res.status} ${res.statusText}` : null,
              });
            } catch (err: any) {
              results.push({
                batch_id: batchId,
                persona_id: persona.id,
                persona_name: persona.name,
                source_url: url,
                status_code: null,
                is_ok: false,
                error_message: err?.message || "Unknown error",
              });
            }
          });
          await Promise.all(checks);
        }

        // Insert only failures to save space (successes are implied)
        const failures = results.filter((r) => !r.is_ok);
        if (failures.length > 0) {
          const { error: insertError } = await supabase
            .from("source_url_check_logs")
            .insert(failures);
          if (insertError) {
            console.error("Failed to insert check logs:", insertError);
          }
        }

        // Also insert one summary record for successful batches
        const summary = {
          total: results.length,
          ok: results.filter((r) => r.is_ok).length,
          failed: failures.length,
          batch_id: batchId,
          checked_at: new Date().toISOString(),
          failures: failures.map((f) => ({
            name: f.persona_name,
            url: f.source_url,
            status: f.status_code,
            error: f.error_message,
          })),
        };

        console.log(`[URL Check] Batch ${batchId}: ${summary.ok}/${summary.total} OK, ${summary.failed} failed`);

        return new Response(JSON.stringify(summary), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});