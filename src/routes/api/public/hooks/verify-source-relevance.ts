import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Name mapping: transliterated Arabic persona names → expected Wikipedia article slug patterns.
 * We fetch the Wikipedia page, extract the title and first paragraph,
 * then check for name relevance using multiple strategies.
 */

// Common Arabic-to-English name mappings for Egyptian figures
const NAME_MAPPINGS: Record<string, string[]> = {
  أحمس: ["ahmose", "amasis"],
  أمنحتب: ["amenhotep", "amenophis"],
  أمنمحات: ["amenemhat", "amenemhet"],
  تحتمس: ["thutmose", "tuthmosis"],
  رمسيس: ["ramesses", "ramses"],
  حتشبسوت: ["hatshepsut"],
  نفرتيتي: ["nefertiti"],
  أخناتون: ["akhenaten", "akhenaton"],
  توت: ["tut", "tutankh"],
  سنوسرت: ["senusret", "sesostris"],
  حور: ["hor", "horus"],
  إيست: ["isis", "iset"],
  أوزيريس: ["osiris"],
  بتاح: ["ptah"],
  آمون: ["amun", "amon"],
  رع: ["ra", "re"],
  ماعت: ["maat"],
  سوبك: ["sobek"],
  خنوم: ["khnum"],
  مين: ["min"],
  نخت: ["nakht", "nacht"],
  مري: ["meri", "merit"],
  كاموس: ["kamose"],
  سخم: ["sekhm", "sekhem"],
  وني: ["weni", "uni"],
  إنني: ["ineni"],
  رخمي: ["rekhmire"],
  حور محب: ["horemheb"],
  سننموت: ["senenmut"],
  خيتي: ["khety", "kheti"],
  كا جمني: ["kagemni"],
  مرنبتاح: ["merneptah", "merenptah"],
  بسوسنس: ["psusennes"],
  أوسركون: ["osorkon"],
  شيشنق: ["shoshenq", "sheshonq"],
  نفرو: ["neferu", "neferure"],
  هميونو: ["hemiunu"],
  بيبي: ["pepi"],
  أوناس: ["unas", "wenis"],
  نختنبو: ["nectanebo", "nakhtaneb"],
  عحا: ["aha"],
  حتب: ["hotep"],
  سخموي: ["sekhemwy", "hotepsekhemwy"],
  منتو: ["montu", "mentu"],
  سات: ["sat", "sit"],
  نيت: ["neith", "neit"],
  هيتب: ["hetep"],
  حرس: ["heres", "hetep"],
};

function extractSlugFromUrl(url: string): string {
  const match = url.match(/\/wiki\/(.+?)(?:#.*)?$/);
  return match ? decodeURIComponent(match[1]).replace(/_/g, " ").toLowerCase() : "";
}

function normalizeArabicName(name: string): string {
  return name
    .replace(
      /^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة|الطبيبة|الأميرة|الفنانة|العازف|المغنية)\s+/,
      ""
    )
    .trim();
}

function getEnglishNameCandidates(arabicName: string): string[] {
  const candidates: string[] = [];
  const cleanName = normalizeArabicName(arabicName);

  for (const [arabic, english] of Object.entries(NAME_MAPPINGS)) {
    if (cleanName.includes(arabic)) {
      candidates.push(...english);
    }
  }
  return candidates;
}

// Categories of generic/contextual pages that are acceptable but not ideal
const GENERIC_PATTERNS = [
  /^(ancient egyptian|deir el|theban|valley of|tomb|tt\d|kv\d|qv\d|dynasty|period|kingdom|intermediate)/i,
  /^(papyrus|stela|temple|pyramid|mastaba|saqqara|giza|abydos|luxor|karnak|memphis)/i,
  /^(book of|instruction of|military of|vizier|nomarch|priests|women in)/i,
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

function checkRelevance(
  personaName: string,
  role: string,
  wikiTitle: string,
  wikiExtract: string,
  sourceUrl: string
): { relevance: "direct" | "related" | "contextual" | "mismatch"; confidence: number; notes: string } {
  const slug = extractSlugFromUrl(sourceUrl);
  const cleanName = normalizeArabicName(personaName).toLowerCase();
  const candidates = getEnglishNameCandidates(personaName);
  const titleLower = wikiTitle.toLowerCase();
  const extractLower = wikiExtract.toLowerCase();
  const combined = `${titleLower} ${extractLower}`;

  // 1. Direct match: persona name candidates appear in title
  for (const candidate of candidates) {
    if (titleLower.includes(candidate)) {
      return { relevance: "direct", confidence: 0.95, notes: `العنوان يتطابق مع "${candidate}"` };
    }
  }

  // 2. Direct match: slug matches a candidate
  for (const candidate of candidates) {
    if (slug.includes(candidate)) {
      return { relevance: "direct", confidence: 0.9, notes: `الرابط يتطابق مع "${candidate}"` };
    }
  }

  // 3. Related: candidates appear in extract
  for (const candidate of candidates) {
    if (extractLower.includes(candidate)) {
      return { relevance: "related", confidence: 0.7, notes: `الاسم "${candidate}" مذكور في الملخص` };
    }
  }

  // 4. Contextual: page is a generic archaeological/historical page
  for (const pattern of GENERIC_PATTERNS) {
    if (pattern.test(slug) || pattern.test(titleLower)) {
      return { relevance: "contextual", confidence: 0.5, notes: `صفحة سياقية عامة: "${wikiTitle}"` };
    }
  }

  // 5. Check if role is mentioned in extract
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
  };

  const roleTerms = roleMap[role.toLowerCase()] || [];
  const roleMatch = roleTerms.some((t) => combined.includes(t));

  if (roleMatch) {
    return { relevance: "contextual", confidence: 0.4, notes: `الدور "${role}" مرتبط بالصفحة` };
  }

  // 6. Mismatch
  return {
    relevance: "mismatch",
    confidence: 0.1,
    notes: `لا يوجد ارتباط واضح بين "${personaName}" والصفحة "${wikiTitle}"`,
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