import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Schema = z.object({
  match_name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  similarity: z.number().min(0).max(100),
  description: z.string().min(1).max(5000),
  match_image_url: z.string().url().max(2000),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/hooks/save-result")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const data = Schema.parse(body);

          const supabaseUrl = process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!supabaseUrl || !serviceKey) {
            return new Response("Server misconfigured", { status: 500, headers: CORS });
          }

          const resp = await fetch(`${supabaseUrl}/rest/v1/shared_results`, {
            method: "POST",
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify(data),
          });
          if (!resp.ok) {
            const txt = await resp.text().catch(() => "");
            return new Response(`Insert failed: ${txt}`, { status: 500, headers: CORS });
          }
          const rows = await resp.json();
          const id = Array.isArray(rows) && rows[0]?.id;
          if (!id) return new Response("No id", { status: 500, headers: CORS });
          return new Response(JSON.stringify({ id }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (e: any) {
          return new Response(`Bad request: ${e?.message ?? "unknown"}`, { status: 400, headers: CORS });
        }
      },
    },
  },
});