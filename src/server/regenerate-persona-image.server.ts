import { createClient } from "@supabase/supabase-js";

export async function regeneratePersonaImageServer(personaId: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;

  if (!supabaseUrl || !serviceKey || !lovableKey) {
    throw new Error("Server misconfigured");
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: persona, error: fetchErr } = await supabase
    .from("personas")
    .select("id, name, gender, role, category, description, source_image_url, image_url")
    .eq("id", personaId)
    .single();

  if (fetchErr || !persona) {
    throw new Error("Persona not found");
  }

  const sourceContext = persona.source_image_url
    ? `Reference the historical source artwork/engraving at: ${persona.source_image_url}. The generated portrait MUST closely match the facial features, clothing, headdress, and accessories shown in the original historical engraving/relief/statue.`
    : "";

  const descSnippet = persona.description?.slice(0, 300) || "";

  const prompt = `Create a hyper-realistic portrait painting of the ancient ${persona.category} historical figure "${persona.name}" (${persona.gender}, ${persona.role}).

${descSnippet}

${sourceContext}

STYLE: Museum-quality realistic oil painting. Historically accurate clothing, jewelry, and headdress based on archaeological evidence. Dramatic chiaroscuro lighting. Rich gold, lapis lazuli blue, and earthy tones. Skin tone must be historically accurate for ancient ${persona.category === "Pharaoh" ? "Egyptian" : persona.category} people — warm brown/olive complexion. Dark brown eyes.

CRITICAL: NO text, letters, numbers, or watermarks. NO modern elements. Face must be clear, detailed, and undistorted. The portrait must look like it belongs in a world-class museum exhibition about ancient ${persona.category === "Pharaoh" ? "Egypt" : persona.category} civilization.`;

  const isDirectImage = persona.source_image_url &&
    /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(persona.source_image_url);

  const messages = isDirectImage
    ? [{
        role: "user" as const,
        content: [
          { type: "text" as const, text: prompt },
          { type: "image_url" as const, image_url: { url: persona.source_image_url! } },
        ],
      }]
    : [{ role: "user" as const, content: prompt }];

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",
      messages,
      modalities: ["image", "text"],
    }),
  });

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    throw new Error(`AI error ${aiResp.status}: ${errText.slice(0, 200)}`);
  }

  const aiData = await aiResp.json();
  const imageB64 = aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

  if (!imageB64) {
    throw new Error("No image returned from AI");
  }

  const b64Data = imageB64.includes(",") ? imageB64.split(",")[1] : imageB64;
  const bytes = Uint8Array.from(atob(b64Data), (c: string) => c.charCodeAt(0));

  const storagePath = `${persona.category}/${persona.id}_regen_${Date.now()}.png`;
  const { error: uploadErr } = await supabase.storage
    .from("personas")
    .upload(storagePath, bytes, { contentType: "image/png", upsert: true });

  if (uploadErr) {
    throw new Error(`Upload failed: ${uploadErr.message}`);
  }

  const { data: urlData } = supabase.storage.from("personas").getPublicUrl(storagePath);

  const { error: updateErr } = await supabase
    .from("personas")
    .update({ image_url: urlData.publicUrl })
    .eq("id", persona.id);

  if (updateErr) {
    throw new Error(`DB update failed: ${updateErr.message}`);
  }

  return { success: true, image_url: urlData.publicUrl, persona_name: persona.name };
}