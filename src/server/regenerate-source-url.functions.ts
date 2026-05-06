import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Build a Wikipedia search URL and follow the first result
async function findWikipediaUrl(name: string, role: string, description: string): Promise<string> {
  // Try Wikipedia API search (free, no key needed)
  const searchTerms = `${name} ${role} ancient Egypt`;
  const apiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchTerms)}&limit=5&format=json`;
  
  const resp = await fetch(apiUrl, {
    headers: { "User-Agent": "LovableBot/1.0" },
  });
  
  if (resp.ok) {
    const json = await resp.json() as any;
    // opensearch returns [query, titles[], descriptions[], urls[]]
    const urls: string[] = json[3] || [];
    if (urls.length > 0) {
      return urls[0];
    }
  }

  // Fallback: construct URL from name directly
  const wikiTitle = name
    .replace(/\s+/g, "_")
    .replace(/^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة)\s*/i, "");
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;
}

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
    const newUrl = await findWikipediaUrl(data.name, data.role, data.description);

    // Update in DB using admin client
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("personas")
      .update({ source_image_url: newUrl })
      .eq("id", data.personaId);

    if (error) throw new Error(`فشل التحديث: ${error.message}`);

    return { url: newUrl };
  });