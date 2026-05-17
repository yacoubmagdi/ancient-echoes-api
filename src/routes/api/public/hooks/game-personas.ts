import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export const Route = createFileRoute("/api/public/hooks/game-personas")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),

      GET: async ({ request }) => {
        try {
          const supabaseUrl = process.env.SUPABASE_URL;
          const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!supabaseUrl || !anonKey) {
            return new Response(
              JSON.stringify({ error: "Server misconfigured" }),
              {
                status: 500,
                headers: { "Content-Type": "application/json", ...CORS_HEADERS },
              },
            );
          }

          const url = new URL(request.url);
          const limitParam = url.searchParams.get("limit");
          const limit = Math.min(
            Math.max(parseInt(limitParam || "12", 10) || 12, 1),
            50,
          );

          // Public, non-sensitive fields only (no face_descriptor / no audit data).
          const restUrl = `${supabaseUrl}/rest/v1/personas?select=id,name,role,category,image_url&image_url=not.is.null&limit=${limit}`;
          const resp = await fetch(restUrl, {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
              Accept: "application/json",
            },
          });

          if (!resp.ok) {
            return new Response(
              JSON.stringify({ error: "Upstream error", status: resp.status }),
              {
                status: 502,
                headers: { "Content-Type": "application/json", ...CORS_HEADERS },
              },
            );
          }

          const rows = (await resp.json()) as Array<{
            id: string;
            name: string;
            role: string | null;
            category: string | null;
            image_url: string | null;
          }>;

          return new Response(
            JSON.stringify({ personas: rows }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=300",
                ...CORS_HEADERS,
              },
            },
          );
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Unknown error",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            },
          );
        }
      },
    },
  },
});