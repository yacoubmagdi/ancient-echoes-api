import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute(
  "/api/public/hooks/regenerate-persona-image"
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const corsHeaders = {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        };

        try {
          const authHeader =
            request.headers.get("authorization") ??
            (request.headers.get("apikey")
              ? `Bearer ${request.headers.get("apikey")}`
              : null);

          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return new Response(
              JSON.stringify({ error: "Missing apikey" }),
              { status: 401, headers: corsHeaders }
            );
          }

          const supabaseUrl = process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
          const lovableKey = process.env.LOVABLE_API_KEY;

          if (!supabaseUrl || !serviceKey || !publishableKey || !lovableKey) {
            return new Response(
              JSON.stringify({ error: "Server misconfigured" }),
              { status: 500, headers: corsHeaders }
            );
          }

          // Verify JWT + admin
          const token = authHeader.replace("Bearer ", "");
          const userClient = createClient(supabaseUrl, publishableKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: userData, error: userErr } =
            await userClient.auth.getUser();
          if (userErr || !userData?.user) {
            return new Response(
              JSON.stringify({ error: "Unauthorized" }),
              { status: 401, headers: corsHeaders }
            );
          }
          const { data: isAdmin } = await userClient.rpc("has_role", {
            _user_id: userData.user.id,
            _role: "admin",
          });
          if (!isAdmin) {
            return new Response(
              JSON.stringify({ error: "Forbidden" }),
              { status: 403, headers: corsHeaders }
            );
          }

          const body = await request.json();
          const personaId = body?.personaId;
          if (!personaId) {
            return new Response(
              JSON.stringify({ error: "personaId required" }),
              { status: 400, headers: corsHeaders }
            );
          }

          const supabase = createClient(supabaseUrl, serviceKey);

          // Fetch persona
          const { data: persona, error: fetchErr } = await supabase
            .from("personas")
            .select("id, name, gender, role, category, description, source_image_url, image_url")
            .eq("id", personaId)
            .single();

          if (fetchErr || !persona) {
            return new Response(
              JSON.stringify({ error: "Persona not found" }),
              { status: 404, headers: corsHeaders }
            );
          }

          // Build a detailed prompt based on historical sources
          const sourceContext = persona.source_image_url
            ? `Reference the historical source artwork/engraving at: ${persona.source_image_url}. The generated portrait MUST closely match the facial features, clothing, headdress, and accessories shown in the original historical engraving/relief/statue.`
            : "";

          const descSnippet = persona.description?.slice(0, 300) || "";

          const prompt = `Create a hyper-realistic portrait painting of the ancient ${persona.category} historical figure "${persona.name}" (${persona.gender}, ${persona.role}).

${descSnippet}

${sourceContext}

STYLE: Museum-quality realistic oil painting. Historically accurate clothing, jewelry, and headdress based on archaeological evidence. Dramatic chiaroscuro lighting. Rich gold, lapis lazuli blue, and earthy tones. Skin tone must be historically accurate for ancient ${persona.category === "Pharaoh" ? "Egyptian" : persona.category} people — warm brown/olive complexion. Dark brown eyes.

CRITICAL: NO text, letters, numbers, or watermarks. NO modern elements. Face must be clear, detailed, and undistorted. The portrait must look like it belongs in a world-class museum exhibition about ancient ${persona.category === "Pharaoh" ? "Egypt" : persona.category} civilization.`;

          // If there's a source image, use image editing to reference it
          let aiResp: Response;
          // Check if source_image_url is a direct image link (not a wiki/webpage)
          const isDirectImage = persona.source_image_url &&
            /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(persona.source_image_url);

          if (isDirectImage) {
            aiResp = await fetch(
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
                          image_url: { url: persona.source_image_url },
                        },
                      ],
                    },
                  ],
                  modalities: ["image", "text"],
                }),
              }
            );
          } else {
            aiResp = await fetch(
              "https://ai.gateway.lovable.dev/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${lovableKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-3-pro-image-preview",
                  messages: [{ role: "user", content: prompt }],
                  modalities: ["image", "text"],
                }),
              }
            );
          }

          if (!aiResp.ok) {
            const errText = await aiResp.text();
            return new Response(
              JSON.stringify({ error: `AI error ${aiResp.status}: ${errText.slice(0, 200)}` }),
              { status: 502, headers: corsHeaders }
            );
          }

          const aiData = await aiResp.json();
          const imageB64 =
            aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (!imageB64) {
            return new Response(
              JSON.stringify({ error: "No image returned from AI" }),
              { status: 502, headers: corsHeaders }
            );
          }

          // Upload to storage
          const b64Data = imageB64.includes(",")
            ? imageB64.split(",")[1]
            : imageB64;
          const bytes = Uint8Array.from(atob(b64Data), (c) =>
            c.charCodeAt(0)
          );

          const storagePath = `${persona.category}/${persona.id}_regen_${Date.now()}.png`;
          const { error: uploadErr } = await supabase.storage
            .from("personas")
            .upload(storagePath, bytes, {
              contentType: "image/png",
              upsert: true,
            });

          if (uploadErr) {
            return new Response(
              JSON.stringify({ error: `Upload failed: ${uploadErr.message}` }),
              { status: 500, headers: corsHeaders }
            );
          }

          const { data: urlData } = supabase.storage
            .from("personas")
            .getPublicUrl(storagePath);

          // Update persona image
          const { error: updateErr } = await supabase
            .from("personas")
            .update({ image_url: urlData.publicUrl })
            .eq("id", persona.id);

          if (updateErr) {
            return new Response(
              JSON.stringify({ error: `DB update failed: ${updateErr.message}` }),
              { status: 500, headers: corsHeaders }
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              image_url: urlData.publicUrl,
              persona_name: persona.name,
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