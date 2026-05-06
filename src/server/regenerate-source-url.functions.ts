import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const regenerateSourceUrl = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      name: z.string(),
      role: z.string(),
      category: z.string(),
      description: z.string(),
      personaId: z.string(),
    }).parse(data)
  )
  .handler(async ({ data }) => {
    const LOVABLE_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_KEY) throw new Error("Missing LOVABLE_API_KEY");

    const prompt = `You are an expert Egyptologist and historian. For the following ancient persona, provide the MOST SPECIFIC and CORRECT English Wikipedia URL.

CRITICAL RULES:
- The URL MUST be about THIS SPECIFIC person, not a different person or generic topic
- Use the person's own Wikipedia page if it exists
- If no personal page exists, use their specific tomb (TT##), stela, papyrus, or artifact
- NEVER use generic category/period/location pages
- URL must start with https://en.wikipedia.org/wiki/
- The Wikipedia page title must match the person described

Name: ${data.name}
Role: ${data.role}
Category: ${data.category}
Description: ${data.description.slice(0, 300)}

Return ONLY the URL, nothing else.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!resp.ok) throw new Error(`AI request failed: ${resp.status}`);

    const json = await resp.json() as any;
    const content = (json.choices?.[0]?.message?.content || "").trim();
    
    const urlMatch = content.match(/https:\/\/en\.wikipedia\.org\/wiki\/[^\s)"\]]+/);
    if (!urlMatch) throw new Error("لم يتم العثور على رابط صالح من الذكاء الاصطناعي");

    const newUrl = urlMatch[0];

    // Update in DB using admin client
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("personas")
      .update({ source_image_url: newUrl })
      .eq("id", data.personaId);

    if (error) throw new Error(`فشل التحديث: ${error.message}`);

    return { url: newUrl };
  });