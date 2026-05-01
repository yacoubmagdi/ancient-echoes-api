import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

interface Persona {
  id: string;
  name: string;
  category: string;
  face_descriptor: number[] | null;
}

interface DuplicateFlag {
  type: "name" | "face";
  similar_to_id: string;
  similar_to_name: string;
  similarity: number;
  scanned_at: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

function normalise(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u0640]/g, "") // remove tatweel
    .replace(/\s+/g, " ");
}

function nameSimilarity(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 1;
  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  // Levenshtein-based ratio for short strings
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

const NAME_THRESHOLD = 0.85;
const FACE_THRESHOLD = 0.85;

export const Route = createFileRoute("/api/public/hooks/scan-duplicates")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const apikey = request.headers.get("apikey");
        const token = authHeader?.replace("Bearer ", "") || apikey;

        if (!token) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
        const supabase = createClient(supabaseUrl!, token, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // Fetch all personas
        const { data: personas, error } = await supabase
          .from("personas")
          .select("id, name, category, face_descriptor")
          .order("category")
          .order("name")
          .limit(2000);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const allPersonas = (personas ?? []) as Persona[];
        const now = new Date().toISOString();
        const flaggedIds = new Set<string>();
        const flags: Record<string, DuplicateFlag[]> = {};

        // Group by category for comparison
        const byCategory: Record<string, Persona[]> = {};
        for (const p of allPersonas) {
          (byCategory[p.category] ??= []).push(p);
        }

        for (const group of Object.values(byCategory)) {
          for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
              const a = group[i];
              const b = group[j];

              // Name similarity check
              const nSim = nameSimilarity(a.name, b.name);
              if (nSim >= NAME_THRESHOLD) {
                (flags[a.id] ??= []).push({
                  type: "name",
                  similar_to_id: b.id,
                  similar_to_name: b.name,
                  similarity: Math.round(nSim * 100) / 100,
                  scanned_at: now,
                });
                (flags[b.id] ??= []).push({
                  type: "name",
                  similar_to_id: a.id,
                  similar_to_name: a.name,
                  similarity: Math.round(nSim * 100) / 100,
                  scanned_at: now,
                });
                flaggedIds.add(a.id);
                flaggedIds.add(b.id);
              }

              // Face similarity check
              if (a.face_descriptor && b.face_descriptor && a.face_descriptor.length === b.face_descriptor.length) {
                const fSim = cosineSimilarity(a.face_descriptor, b.face_descriptor);
                if (fSim >= FACE_THRESHOLD) {
                  (flags[a.id] ??= []).push({
                    type: "face",
                    similar_to_id: b.id,
                    similar_to_name: b.name,
                    similarity: Math.round(fSim * 100) / 100,
                    scanned_at: now,
                  });
                  (flags[b.id] ??= []).push({
                    type: "face",
                    similar_to_id: a.id,
                    similar_to_name: a.name,
                    similarity: Math.round(fSim * 100) / 100,
                    scanned_at: now,
                  });
                  flaggedIds.add(a.id);
                  flaggedIds.add(b.id);
                }
              }
            }
          }
        }

        // Update flagged personas
        let updated = 0;
        for (const [id, dupFlags] of Object.entries(flags)) {
          const { error: uErr } = await supabase
            .from("personas")
            .update({ duplicate_flag: dupFlags })
            .eq("id", id);
          if (!uErr) updated++;
        }

        // Clear flags from non-flagged personas using service role via admin
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (serviceKey) {
          const adminClient = createClient(supabaseUrl!, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const unflaggedIds = allPersonas
            .filter((p) => !flaggedIds.has(p.id))
            .map((p) => p.id);

          // Batch clear in chunks of 100
          for (let i = 0; i < unflaggedIds.length; i += 100) {
            const chunk = unflaggedIds.slice(i, i + 100);
            await adminClient
              .from("personas")
              .update({ duplicate_flag: null })
              .in("id", chunk);
          }
        }

        console.log(`Duplicate scan complete: ${updated} flagged out of ${allPersonas.length} personas`);

        return new Response(
          JSON.stringify({
            success: true,
            total: allPersonas.length,
            flagged: updated,
            timestamp: now,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});