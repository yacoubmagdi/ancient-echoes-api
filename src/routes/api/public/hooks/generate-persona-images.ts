import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const BATCH_SIZE = 5;
const MAX_VALIDATION_RETRIES = 2;
const VALIDATION_CACHE_MAX = 200;

/** In-memory LRU cache for validation results keyed by image content hash */
const validationCache = new Map<
  string,
  { valid: boolean; issues: string[]; ts: number }
>();

function getImageHash(base64: string): string {
  // Use only the raw data portion (strip data-url prefix if present)
  const raw = base64.includes(",") ? base64.split(",")[1] : base64;
  return createHash("sha256").update(raw).digest("hex");
}

function getCachedValidation(hash: string): { valid: boolean; issues: string[] } | null {
  const entry = validationCache.get(hash);
  if (!entry) return null;
  // Expire after 1 hour
  if (Date.now() - entry.ts > 3_600_000) {
    validationCache.delete(hash);
    return null;
  }
  return { valid: entry.valid, issues: entry.issues };
}

function setCachedValidation(hash: string, result: { valid: boolean; issues: string[] }) {
  // Evict oldest entries when cache is full
  if (validationCache.size >= VALIDATION_CACHE_MAX) {
    const oldest = validationCache.keys().next().value;
    if (oldest) validationCache.delete(oldest);
  }
  validationCache.set(hash, { ...result, ts: Date.now() });
}

/**
 * Validates a generated persona image using AI vision analysis.
 * Checks for:
 * - Random text/letters/numbers on the image
 * - Non-Egyptian or anachronistic elements
 * - Wrong eye colors (blue/green on ancient Egyptians)
 * - Modern clothing or accessories
 * - Distorted faces or artifacts
 * Returns { valid: boolean; issues: string[] }
 */
async function validatePersonaImage(
  imageBase64: string,
  persona: { name: string; gender: string; role: string },
  lovableKey: string
): Promise<{ valid: boolean; issues: string[] }> {
  // Check cache first
  const hash = getImageHash(imageBase64);
  const cached = getCachedValidation(hash);
  if (cached) {
    console.log(`Validation cache hit for ${persona.name} (hash=${hash.slice(0, 8)})`);
    return cached;
  }

  try {
    const validationPrompt = `You are an expert quality-control reviewer for AI-generated historical Egyptian portrait images.

Analyze this image of "${persona.name}" (${persona.gender} ${persona.role}) and check for these defects:

1. RANDOM TEXT: Any Latin letters, numbers, watermarks, or non-hieroglyphic text visible on the image (e.g. "AR", "AI", random characters on crowns/clothing)
2. WRONG EYE COLOR: Blue or green eyes on an ancient Egyptian figure (should be brown/dark)
3. ANACHRONISTIC ELEMENTS: Modern items, non-Egyptian clothing, wrong era accessories
4. FACE DISTORTION: Deformed features, extra fingers, melted/blurred face
5. WRONG GENDER: Image shows wrong gender for the specified persona

Respond ONLY with a JSON object:
{"valid": true/false, "issues": ["issue description 1", ...]}

If no issues, respond: {"valid": true, "issues": []}`;

    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: validationPrompt },
                {
                  type: "image_url",
                  image_url: { url: imageBase64 },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!resp.ok) {
      console.error(`Validation API error: ${resp.status}`);
      // If validation service is down, allow image through with a warning
      return { valid: true, issues: ["validation_skipped: API error"] };
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*"valid"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Validation returned non-JSON:", content.slice(0, 200));
      return { valid: true, issues: ["validation_skipped: parse error"] };
    }

    const result = JSON.parse(jsonMatch[0]);
    const validationResult = {
      valid: Boolean(result.valid),
      issues: Array.isArray(result.issues) ? result.issues : [],
    };
    setCachedValidation(hash, validationResult);
    return validationResult;
  } catch (e) {
    console.error("Image validation error:", (e as Error).message);
    return { valid: true, issues: ["validation_skipped: exception"] };
  }
}

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

              // --- Image Validation Gate ---
              let finalImageB64 = imageB64;
              let validationPassed = false;
              let validationIssues: string[] = [];

              for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
                const validation = await validatePersonaImage(
                  finalImageB64,
                  persona,
                  lovableKey
                );

                if (validation.valid) {
                  validationPassed = true;
                  if (validation.issues.length > 0 && validation.issues[0]?.startsWith("validation_skipped")) {
                    console.warn(`Validation skipped for ${persona.name}: ${validation.issues[0]}`);
                  }
                  break;
                }

                validationIssues = validation.issues;
                console.warn(
                  `Image validation failed for ${persona.name} (attempt ${attempt + 1}): ${validation.issues.join(", ")}`
                );

                // If we have retries left, regenerate the image with stricter prompt
                if (attempt < MAX_VALIDATION_RETRIES) {
                  const issuesList = validation.issues.join("; ");
                  const fixPrompt = `Ancient Egyptian ${persona.role} portrait painting, historically accurate, ${persona.gender} figure named "${persona.name}". ${persona.description?.slice(0, 100) || ""}. Oil painting style, dramatic lighting, gold and blue tones, hieroglyphic background, museum quality.
CRITICAL REQUIREMENTS: Do NOT add any text, letters, numbers or watermarks on the image. The person MUST have dark brown eyes. No modern elements. No blue or green eyes. Clean, artifact-free image.
Previous issues to fix: ${issuesList}`;

                  const retryResp = await fetch(
                    "https://ai.gateway.lovable.dev/v1/chat/completions",
                    {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${lovableKey}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        model: "google/gemini-3.1-flash-image-preview",
                        messages: [{ role: "user", content: fixPrompt }],
                        modalities: ["image", "text"],
                      }),
                    }
                  );

                  if (retryResp.ok) {
                    const retryData = await retryResp.json();
                    const retryB64 = retryData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
                    if (retryB64) {
                      finalImageB64 = retryB64;
                    }
                  }

                  await new Promise((r) => setTimeout(r, 1500));
                }
              }

              if (!validationPassed) {
                results.push({
                  id: persona.id,
                  name: persona.name,
                  success: false,
                  error: `Image validation failed after ${MAX_VALIDATION_RETRIES + 1} attempts: ${validationIssues.join("; ")}`,
                });
                continue;
              }

              // Convert validated base64 to bytes
              const b64Data = finalImageB64.includes(",")
                ? finalImageB64.split(",")[1]
                : finalImageB64;
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