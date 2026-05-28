import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Schema = z.object({
  match_name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  similarity: z.number().min(0).max(100),
  description: z.string().min(1).max(5000),
  match_image_url: z.string().url().max(2000),
  share_image_data: z.string().max(8_000_000).optional(),
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

          const shareImageUrl = data.share_image_data
            ? await uploadShareCard({
                supabaseUrl,
                serviceKey,
                id,
                dataUrl: data.share_image_data,
              })
            : null;

          return new Response(JSON.stringify({ id }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS, ...(shareImageUrl ? { "X-Share-Image": shareImageUrl } : {}) },
          });
        } catch (e: any) {
          return new Response(`Bad request: ${e?.message ?? "unknown"}`, { status: 400, headers: CORS });
        }
      },
    },
  },
});

async function uploadShareCard({
  supabaseUrl,
  serviceKey,
  id,
  dataUrl,
}: {
  supabaseUrl: string;
  serviceKey: string;
  id: string;
  dataUrl: string;
}) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  const path = `og-cache/${id}_share.png`;

  const uploadResp = await fetch(`${supabaseUrl}/storage/v1/object/personas/${path}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });

  if (!uploadResp.ok) {
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/personas/${path}`;
}