import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export const Route = createFileRoute("/api/public/hooks/game-analyze")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        try {
          const supabaseUrl = process.env.SUPABASE_URL;
          const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!supabaseUrl || !anonKey) {
            return json({ error: "Server misconfigured" }, 500);
          }

          const payload = (await request.json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          if (
            !payload ||
            !Array.isArray(payload.descriptor) ||
            (payload.descriptor as unknown[]).length !== 128
          ) {
            return json({ error: "Invalid descriptor (need 128 numbers)" }, 400);
          }

          const body: Record<string, unknown> = {
            descriptor: payload.descriptor as number[],
            lang: payload.lang === "ar" ? "ar" : "en",
          };
          // Forward optional filters supported by analyze-face
          for (const k of [
            "gender",
            "date_of_birth",
            "nationality",
            "role",
            "civilization",
            "skin_tone",
          ]) {
            if (payload[k] !== undefined && payload[k] !== null && payload[k] !== "") {
              body[k] = payload[k];
            }
          }

          const resp = await fetch(`${supabaseUrl}/functions/v1/analyze-face`, {
            method: "POST",
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });

          const data = await resp.json().catch(() => ({ error: "Bad upstream" }));
          if (!resp.ok) {
            return json(
              { error: (data as { error?: string })?.error || `Upstream ${resp.status}` },
              502,
            );
          }
          return json(data, 200);
        } catch (err) {
          return json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            500,
          );
        }
      },
    },
  },
});