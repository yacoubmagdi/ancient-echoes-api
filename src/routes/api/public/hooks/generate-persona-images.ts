import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const BATCH_SIZE = 5;

export const Route = createFileRoute(
  "/api/public/hooks/generate-persona-images"
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const corsHeaders = {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        };

        try {
          // Auth: accept either apikey header or Authorization Bearer
          const apikey =
            request.headers.get("apikey") ??
            request.headers.get("authorization")?.replace("Bearer ", "");

          if (!apikey) {
            return new Response(
              JSON.stringify({ error: "Missing apikey" }),
              { status: 401, headers: corsHeaders }
            );
          }

          const supabaseUrl = process.env.SUPABASE_URL!;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
          const lovableKey = process.env.LOVABLE_API_KEY;

          if (!lovableKey) {
            return new Response(
              JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
              { status: 500, headers: corsHeaders }
            );
          }

          const supabase = createClient(supabaseUrl, serviceKey);

          // Parse optional body params
          let batchSize = BATCH_SIZE;
          try {
            const body = await request.json();
            if (body?.batchSize) batchSize = Math.min(Number(body.batchSize), 10);
          } catch {
            // no body is fine
          }

          // Fetch personas that still have placeholder images
          const { data: personas, error: fetchErr } = await supabase
            .from("personas")
            .select("id, name, gender, role, category, description")
            .like("image_url", "%placeholder%")
            .limit(batchSize);

          if (fetchErr) {
            return new Response(
              JSON.stringify({ error: fetchErr.message }),
              { status: 500, headers: corsHeaders }
            );
          }

          if (!personas || personas.length === 0) {
            return new Response(
              JSON.stringify({
                message: "All personas already have custom images",
                processed: 0,
                remaining: 0,
              }),
              { headers: corsHeaders }
            );
          }

          // Count remaining for progress tracking
          const { count: remaining } = await supabase
            .from("personas")
            .select("id", { count: "exact", head: true })
            .like("image_url", "%placeholder%");

          const results: Array<{
            id: string;
            name: string;
            success: boolean;
            error?: string;
          }> = [];

          for (const persona of personas) {
            try {
              const genderAr =
                persona.gender === "female" ? "أنثى" : "ذكر";
              const prompt = `Ancient Egyptian ${persona.role} portrait painting, historical accurate, ${persona.gender} figure named "${persona.name}". ${persona.description?.slice(0, 100) || ""}. Oil painting style, dramatic lighting, gold and blue tones, hieroglyphic background, museum quality, detailed face features, ancient Egyptian headdress and jewelry. Photorealistic digital art.`;

              // Call Lovable AI Gateway for image generation
              const aiResp = await fetch(
                "https://ai.gateway.lovable.dev/v1/chat/completions",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${lovableKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "google/gemini-3.1-flash-image-preview",
                    messages: [
                      {
                        role: "user",
                        content: prompt,
                      },
                    ],
                    modalities: ["image", "text"],
                  }),
                }
              );

              if (!aiResp.ok) {
                const errText = await aiResp.text();
                results.push({
                  id: persona.id,
                  name: persona.name,
                  success: false,
                  error: `AI API ${aiResp.status}: ${errText.slice(0, 200)}`,
                });
                continue;
              }

              const aiData = await aiResp.json();
              const imageB64 =
                aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

              if (!imageB64) {
                results.push({
                  id: persona.id,
                  name: persona.name,
                  success: false,
                  error: "No image returned from AI",
                });
                continue;
              }

              // Convert base64 to bytes
              const b64Data = imageB64.includes(",")
                ? imageB64.split(",")[1]
                : imageB64;
              const bytes = Uint8Array.from(atob(b64Data), (c) =>
                c.charCodeAt(0)
              );

              // Upload to storage
              const storagePath = `Pharaoh/${persona.id}_${Date.now()}.png`;
              const { error: uploadErr } = await supabase.storage
                .from("personas")
                .upload(storagePath, bytes, {
                  contentType: "image/png",
                  upsert: true,
                });

              if (uploadErr) {
                results.push({
                  id: persona.id,
                  name: persona.name,
                  success: false,
                  error: `Upload: ${uploadErr.message}`,
                });
                continue;
              }

              // Get public URL
              const { data: urlData } = supabase.storage
                .from("personas")
                .getPublicUrl(storagePath);

              // Update persona record
              // Re-check that persona still has placeholder to prevent race conditions
              const { data: currentPersona } = await supabase
                .from("personas")
                .select("image_url")
                .eq("id", persona.id)
                .single();

              if (currentPersona && !currentPersona.image_url?.includes("placeholder")) {
                await supabase.storage.from("personas").remove([storagePath]);
                results.push({
                  id: persona.id,
                  name: persona.name,
                  success: true,
                  error: "Already updated — skipped",
                });
                continue;
              }

              const { error: updateErr } = await supabase
                .from("personas")
                .update({ image_url: urlData.publicUrl })
                .eq("id", persona.id)
                .like("image_url", "%placeholder%");

              if (updateErr) {
                results.push({
                  id: persona.id,
                  name: persona.name,
                  success: false,
                  error: `DB update: ${updateErr.message}`,
                });
                continue;
              }

              results.push({
                id: persona.id,
                name: persona.name,
                success: true,
              });

              // Small delay between generations
              await new Promise((r) => setTimeout(r, 1000));
            } catch (e) {
              results.push({
                id: persona.id,
                name: persona.name,
                success: false,
                error: (e as Error).message,
              });
            }
          }

          const successCount = results.filter((r) => r.success).length;

          return new Response(
            JSON.stringify({
              processed: results.length,
              success: successCount,
              failed: results.length - successCount,
              remaining: (remaining ?? 0) - successCount,
              results,
            }),
            { headers: corsHeaders }
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ error: (e as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, apikey",
          },
        });
      },
    },
  },
});