import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/og-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) {
            return new Response("Missing id", { status: 400 });
          }

          const size = url.searchParams.get("size") || "large";

          const supabaseUrl = process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (!supabaseUrl || !serviceKey) {
            return new Response("Server misconfigured", { status: 500 });
          }

          // Check cached PNG first
          const cachedUrl = `${supabaseUrl}/storage/v1/object/public/personas/og-cache/${id}_${size}.png`;
          try {
            const headResp = await fetch(cachedUrl, { method: "HEAD" });
            if (headResp.ok) {
              return new Response(null, {
                status: 302,
                headers: { Location: cachedUrl, "Cache-Control": "public, max-age=86400" },
              });
            }
          } catch {
            // not cached
          }

          // Fetch shared result via REST API (service role — table is no longer publicly readable)
          const restUrl = `${supabaseUrl}/rest/v1/shared_results?id=eq.${encodeURIComponent(id)}&select=*&limit=1`;
          const dbResp = await fetch(restUrl, {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Accept: "application/json",
            },
          });

          if (!dbResp.ok) {
            return new Response("Not found", { status: 404 });
          }

          const rows = await dbResp.json();
          const data = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          if (!data) {
            return new Response("Not found", { status: 404 });
          }

          const similarity = Math.round(Number(data.similarity));
          const lovableKey = process.env.LOVABLE_API_KEY;

          if (!lovableKey) {
            // Fallback: redirect to the match image
            return new Response(null, {
              status: 302,
              headers: { Location: data.match_image_url },
            });
          }

          const aspectMap: Record<string, string> = {
            large: "wide horizontal 1200x630 social media card",
            square: "square 1:1 social media post",
            story: "vertical 9:16 Instagram/TikTok story",
          };
          const layoutDesc = aspectMap[size] || aspectMap.large;

          const prompt = `Create a ${layoutDesc} image for sharing on social media.

Design: Dark navy-to-purple gradient background. Elegant gold (#c9a84c) border frame.

Content layout:
- Title "أصداء القدماء" in decorative gold Arabic calligraphy at top
- The historical persona "${data.match_name}" shown as a prominent portrait (use the provided reference image)
- Category: "${data.category}" in muted purple text
- Large golden number: "${similarity}%" with Arabic text "تطابق" (match percentage)
- A gold gradient progress bar showing ${similarity}% filled
- Call-to-action: "اكتشف شبيهك التاريخي!" in a gold pill button
- Subtle Egyptian hieroglyphic decorative elements in background
- Professional museum-quality aesthetic, dramatic lighting
- All Arabic text must be clear, readable, right-to-left
- Ancient Egyptian themed, premium quality`;

          const aiResp = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${lovableKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-pro-image-preview",
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: prompt },
                      {
                        type: "image_url",
                        image_url: { url: data.match_image_url },
                      },
                    ],
                  },
                ],
                modalities: ["image", "text"],
              }),
            }
          );

          if (!aiResp.ok) {
            return new Response(null, {
              status: 302,
              headers: { Location: data.match_image_url },
            });
          }

          const aiData = await aiResp.json();
          const imgB64 =
            aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (!imgB64) {
            return new Response(null, {
              status: 302,
              headers: { Location: data.match_image_url },
            });
          }

          const b64 = imgB64.includes(",") ? imgB64.split(",")[1] : imgB64;
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

          // Cache in storage via REST (fire and forget)
          fetch(
            `${supabaseUrl}/storage/v1/object/personas/og-cache/${id}_${size}.png`,
            {
              method: "POST",
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                "Content-Type": "image/png",
                "x-upsert": "true",
              },
              body: bytes,
            }
          ).catch(() => {});

          return new Response(bytes, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch {
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
