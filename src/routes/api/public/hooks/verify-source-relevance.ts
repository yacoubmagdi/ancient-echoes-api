import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { matchPersonaToWiki, transliterateArabic, FULL_NAME_DICTIONARY } from "@/lib/egyptian-transliteration";

// Categories of generic/contextual pages
const GENERIC_PATTERNS = [
  /^(ancient egyptian|deir|theban|valley|tomb|tt\d|kv\d|qv\d|dynasty|period|kingdom|intermediate)/i,
  /^(papyrus|stela|temple|pyramid|mastaba|saqqara|giza|abydos|luxor|karnak|memphis)/i,
  /^(book of|instruction of|military|vizier|nomarch|priest|women|music|royal|el kab)/i,
  /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)/i,
  /^(twenty|thirtieth|nineteenth|seventeenth|serapeum|bab el|db320|nrt|cosmetic|nurse)/i,
  /^(god.s wife|great kenbet|edwin smith|insinger|carnarvon|satire|turin|lansing)/i,
];

type VerificationResult = {
  persona_id: string;
  persona_name: string;
  source_url: string;
  wiki_title: string;
  relevance: "direct" | "related" | "contextual" | "mismatch";
  confidence: number;
  notes: string;
};

async function fetchWikiTitle(url: string): Promise<{ title: string; extract: string } | null> {
  try {
    const slug = url.match(/\/wiki\/(.+?)(?:#.*)?$/)?.[1];
    if (!slug) return null;

    const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "PharaonicPersonaBot/1.0 (source verification)" },
    });
    clearTimeout(timeout);

    if (!resp.ok) return null;
    const data = (await resp.json()) as { title?: string; extract?: string };
    return { title: data.title || "", extract: data.extract || "" };
  } catch {
    return null;
  }
}

function extractSlugFromUrl(url: string): string {
  const match = url.match(/\/wiki\/(.+?)(?:#.*)?$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function checkRelevance(
  personaName: string,
  role: string,
  wikiTitle: string,
  wikiExtract: string,
  sourceUrl: string
): { relevance: "direct" | "related" | "contextual" | "mismatch"; confidence: number; notes: string } {
  const slug = extractSlugFromUrl(sourceUrl);
  const slugLower = slug.replace(/_/g, " ").toLowerCase();
  const titleLower = wikiTitle.toLowerCase();
  
  // Use the new multi-strategy matching engine
  const match = matchPersonaToWiki(personaName, wikiTitle, wikiExtract, slug);
  
  if (match.matched) {
    if (match.confidence >= 0.85) {
      return {
        relevance: "direct",
        confidence: match.confidence,
        notes: `${match.strategy}: ${match.details}`,
      };
    }
    if (match.confidence >= 0.55) {
      return {
        relevance: "related",
        confidence: match.confidence,
        notes: `${match.strategy}: ${match.details}`,
      };
    }
  }
  
  // Check for contextual/generic pages
  for (const pattern of GENERIC_PATTERNS) {
    if (pattern.test(slugLower) || pattern.test(titleLower)) {
      return {
        relevance: "contextual",
        confidence: 0.5,
        notes: `صفحة سياقية عامة: "${wikiTitle}"`,
      };
    }
  }
  
  // Role-based contextual check
  const roleMap: Record<string, string[]> = {
    warrior: ["military", "soldier", "battle", "army", "war", "general", "commander"],
    priest: ["priest", "temple", "religious", "divine", "clergy"],
    priestess: ["priestess", "temple", "divine"],
    scribe: ["scribe", "writing", "papyrus", "record"],
    architect: ["architect", "build", "construction", "pyramid", "temple"],
    scholar: ["scholar", "learn", "wisdom", "physician", "doctor", "medicine"],
    queen: ["queen", "royal wife", "consort", "princess"],
    royalty: ["pharaoh", "king", "ruler", "dynasty", "reign"],
    pharaoh: ["pharaoh", "king", "ruler", "dynasty", "reign"],
    noble: ["noble", "official", "governor", "nomarch"],
    craftsman: ["craft", "artisan", "worker", "sculptor"],
    artist: ["artist", "sculptor", "painter", "relief"],
    vizier: ["vizier", "minister", "administrator"],
    "حاكم إقليمي": ["governor", "nomarch", "ruler", "official"],
    "مهندس عسكري": ["military", "engineer", "architect"],
    "مربية ملكية": ["nurse", "royal nurse", "tutor"],
    "عالم فلك": ["astronomer", "astronomy"],
    أميرة: ["princess", "royal"],
    ملكة: ["queen", "royal wife"],
    نحات: ["sculptor", "sculpture", "art"],
  };
  
  const combined = `${titleLower} ${wikiExtract.toLowerCase()}`;
  const roleTerms = roleMap[role.toLowerCase()] || roleMap[role] || [];
  const roleMatch = roleTerms.some((t) => combined.includes(t));
  
  if (roleMatch) {
    return {
      relevance: "contextual",
      confidence: 0.4,
      notes: `الدور "${role}" مرتبط بالصفحة "${wikiTitle}"`,
    };
  }
  
  // If transliteration produced a partial match, still mark as contextual
  if (match.matched && match.confidence >= 0.4) {
    return {
      relevance: "contextual",
      confidence: match.confidence,
      notes: `${match.strategy}: ${match.details}`,
    };
  }
  
  return {
    relevance: "mismatch",
    confidence: 0.1,
    notes: `لا تطابق: "${personaName}" (${transliterateArabic(personaName)}) ↔ "${wikiTitle}"`,
  };
}

export const Route = createFileRoute("/api/public/hooks/verify-source-relevance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader =
          request.headers.get("apikey") || request.headers.get("authorization")?.replace("Bearer ", "");

        if (!authHeader) {
          return new Response(JSON.stringify({ error: "Missing authorization" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
        const supabase = createClient(supabaseUrl!, authHeader, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const body = await request.json().catch(() => ({})) as { limit?: number; offset?: number };
        const limit = Math.min(body.limit || 50, 100);
        const offset = body.offset || 0;

        const { data: personas, error: fetchError } = await supabase
          .from("personas")
          .select("id, name, role, category, source_image_url")
          .not("source_image_url", "is", null)
          .neq("source_image_url", "")
          .order("name")
          .range(offset, offset + limit - 1);

        if (fetchError) {
          return new Response(JSON.stringify({ error: fetchError.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: VerificationResult[] = [];
        const BATCH_SIZE = 5;

        for (let i = 0; i < (personas?.length || 0); i += BATCH_SIZE) {
          const batch = personas!.slice(i, i + BATCH_SIZE);
          const checks = batch.map(async (persona) => {
            const wikiData = await fetchWikiTitle(persona.source_image_url);
            if (!wikiData) {
              results.push({
                persona_id: persona.id,
                persona_name: persona.name,
                source_url: persona.source_image_url,
                wiki_title: "",
                relevance: "mismatch",
                confidence: 0,
                notes: "تعذر جلب بيانات الصفحة من ويكيبيديا",
              });
              return;
            }

            const { relevance, confidence, notes } = checkRelevance(
              persona.name,
              persona.role,
              wikiData.title,
              wikiData.extract,
              persona.source_image_url
            );

            results.push({
              persona_id: persona.id,
              persona_name: persona.name,
              source_url: persona.source_image_url,
              wiki_title: wikiData.title,
              relevance,
              confidence,
              notes,
            });
          });
          await Promise.all(checks);

          // Small delay between batches
          if (i + BATCH_SIZE < (personas?.length || 0)) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        const summary = {
          total: results.length,
          direct: results.filter((r) => r.relevance === "direct").length,
          related: results.filter((r) => r.relevance === "related").length,
          contextual: results.filter((r) => r.relevance === "contextual").length,
          mismatch: results.filter((r) => r.relevance === "mismatch").length,
          offset,
          limit,
          results,
          mismatches: results.filter((r) => r.relevance === "mismatch"),
        };

        return new Response(JSON.stringify(summary, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});