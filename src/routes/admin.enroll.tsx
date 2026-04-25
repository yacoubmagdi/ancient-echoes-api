import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { loadFaceModels, imageFromUrl, extractDescriptor } from "@/lib/face-api";

export const Route = createFileRoute("/admin/enroll")({
  head: () => ({
    meta: [
      { title: "Enroll Faces — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EnrollPage,
});

type Persona = { id: string; name: string; image_url: string; face_descriptor: number[] | null };

// Try to load an image with retries — handles transient network/CORS hiccups.
async function imageFromUrlWithRetry(url: string, attempts = 3): Promise<HTMLImageElement> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await imageFromUrl(url);
    } catch (e) {
      lastErr = e;
      // Backoff: 400ms, 800ms, 1600ms
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Image load failed");
}

function EnrollPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, ok: 0, failed: 0 });
  const [log, setLog] = useState<string[]>([]);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [autoStart, setAutoStart] = useState(true);
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // Cumulative totals across auto-resume passes
  const [totalProcessed, setTotalProcessed] = useState({ ok: 0, failed: 0, passes: 0 });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("personas")
        .select("id, name, image_url, face_descriptor")
        .order("category")
        .order("name")
        .limit(2000);
      setPersonas((data as Persona[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  function append(line: string) {
    setLog((l) => [...l.slice(-200), line]);
  }

  async function acquireWakeLock() {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
      };
      if (nav.wakeLock?.request) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
        append("Screen wake lock acquired (tab will stay awake).");
      }
    } catch {
      // Wake lock not critical — continue without it.
    }
  }

  function releaseWakeLock() {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }

  // Auto-start enrollment when the page loads if there are missing descriptors.
  useEffect(() => {
    if (loading || running || hasAutoRun || !autoStart || !isAdmin) return;
    const missing = personas.filter((p) => !p.face_descriptor).length;
    if (missing === 0) return;
    setHasAutoRun(true);
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, personas, autoStart, isAdmin]);

  async function run() {
    setRunning(true);
    setLog([]);
    setTotalProcessed({ ok: 0, failed: 0, passes: 0 });
    await acquireWakeLock();
    append("Loading face-api models...");
    await loadFaceModels();
    append("Models ready.");

    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (!accessToken) {
      append("ERROR: not authenticated");
      setRunning(false);
      releaseWakeLock();
      return;
    }

    // Auto-resume loop: keep processing missing personas until none remain
    // (or until a pass yields no new successes — meaning the rest are unfixable).
    let cumOk = 0;
    let cumFailed = 0;
    let pass = 0;
    const maxPasses = 5;

    while (pass < maxPasses) {
      pass++;
      // Re-fetch latest personas list each pass so already-saved ones are skipped
      const { data: latest } = await supabase
        .from("personas")
        .select("id, name, image_url, face_descriptor")
        .order("category")
        .order("name")
        .limit(2000);
      const fresh = (latest as Persona[]) ?? [];
      setPersonas(fresh);

      const targets = onlyMissing ? fresh.filter((p) => !p.face_descriptor) : fresh;
      if (targets.length === 0) {
        append(`Pass ${pass}: nothing to do — all personas enrolled. ✓`);
        break;
      }

      setProgress({ done: 0, total: targets.length, ok: 0, failed: 0 });
      append(`Pass ${pass}: processing ${targets.length} personas...`);

      let ok = 0;
      let failed = 0;
      const batchItems: { id: string; descriptor: number[] | null }[] = [];

      async function flushBatch() {
        if (batchItems.length === 0) return;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-face-descriptor`;
        // Retry the save call up to 3 times for transient errors
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const resp = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ items: batchItems }),
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.ok) break;
            const errMsg = (data as { error?: string }).error ?? `HTTP ${resp.status}`;
            if (attempt === 2) append(`Save batch failed after retries: ${errMsg}`);
            else await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          } catch (e) {
            if (attempt === 2) append(`Save error: ${(e as Error).message}`);
            else await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
        }
        batchItems.length = 0;
      }

      for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        try {
          const img = await imageFromUrlWithRetry(p.image_url, 3);
          const desc = await extractDescriptor(img);
          if (desc) {
            batchItems.push({ id: p.id, descriptor: desc });
            ok++;
          } else {
            // Don't write null on first pass — leave it so we can retry next pass
            failed++;
            append(`No face: ${p.name}`);
          }
        } catch (e) {
          failed++;
          append(`Error ${p.name}: ${(e as Error).message}`);
        }
        setProgress({ done: i + 1, total: targets.length, ok, failed });
        if (batchItems.length >= 10) await flushBatch();
      }
      await flushBatch();

      cumOk += ok;
      cumFailed = failed; // last pass's unrecoverable count
      setTotalProcessed({ ok: cumOk, failed: cumFailed, passes: pass });
      append(`Pass ${pass} complete: ${ok} succeeded, ${failed} failed.`);

      // If this pass produced no successes, the remaining items are stuck — stop.
      if (ok === 0) {
        append(`No new successes on pass ${pass}. Remaining ${failed} personas have no detectable face. Stopping.`);
        break;
      }
    }

    // Final refresh + summary
    const { data: final } = await supabase
      .from("personas")
      .select("id, name, image_url, face_descriptor")
      .order("category")
      .order("name")
      .limit(2000);
    const finalList = (final as Persona[]) ?? [];
    setPersonas(finalList);
    const finalEnrolled = finalList.filter((p) => p.face_descriptor).length;
    append(`✅ DONE. ${finalEnrolled}/${finalList.length} enrolled (${cumOk} added in ${pass} pass${pass > 1 ? "es" : ""}, ${finalList.length - finalEnrolled} unrecoverable).`);
    setRunning(false);
    releaseWakeLock();
  }

  if (authLoading || loading) {
    return <main className="min-h-screen p-8">Loading...</main>;
  }
  if (!isAdmin) {
    return (
      <main className="min-h-screen p-8">
        <p>Admin access required. <Link to="/admin" className="underline">Go to admin</Link></p>
      </main>
    );
  }

  const enrolled = personas.filter((p) => p.face_descriptor).length;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const enrolledPct = personas.length > 0 ? Math.round((enrolled / personas.length) * 100) : 0;

  return (
    <main className="min-h-screen p-8 mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Face Enrollment</h1>
        <Link to="/admin" className="text-sm underline">← Back to admin</Link>
      </div>

      <Card className="p-6 mb-6">
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-lg font-semibold">{personas.length}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">Enrolled</div>
              <div className="text-lg font-semibold text-green-600">{enrolled}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">Missing</div>
              <div className="text-lg font-semibold text-orange-600">{personas.length - enrolled}</div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Overall enrollment</span>
              <span>{enrolledPct}%</span>
            </div>
            <Progress value={enrolledPct} />
          </div>
        </div>

        <label className="flex items-center gap-2 mb-4 text-sm">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            disabled={running}
          />
          Only process personas without a descriptor
        </label>

        <label className="flex items-center gap-2 mb-4 text-sm">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => setAutoStart(e.target.checked)}
            disabled={running}
          />
          Auto-start enrollment when this page opens
        </label>

        <Button onClick={run} disabled={running} className="w-full">
          {running ? "Processing..." : "Start enrollment"}
        </Button>

        {progress.total > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium">
                {running ? `Processing… (pass ${totalProcessed.passes || 1})` : "Run complete"}
              </span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.done} / {progress.total}</span>
              <span>
                <span className="text-green-600">✓ {progress.ok}</span>
                {"  "}
                <span className="text-red-600">✗ {progress.failed}</span>
              </span>
            </div>
            {totalProcessed.passes > 0 && (
              <div className="text-xs text-muted-foreground pt-1 border-t">
                Cumulative: <span className="text-green-600">+{totalProcessed.ok} enrolled</span> across {totalProcessed.passes} pass{totalProcessed.passes > 1 ? "es" : ""}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="text-sm font-semibold">Status log</h2>
          {log.length > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline disabled:opacity-50"
              onClick={() => setLog([])}
              disabled={running}
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-auto p-4 font-mono text-xs bg-muted/30">
          {log.length === 0 ? (
            <p className="text-muted-foreground">No activity yet. Click "Start enrollment" to begin.</p>
          ) : (
            log.map((line, i) => {
              const isError = /error|failed|no face/i.test(line);
              const isDone = /^done\./i.test(line);
              return (
                <div
                  key={i}
                  className={
                    isError
                      ? "text-red-600"
                      : isDone
                        ? "text-green-600 font-semibold"
                        : ""
                  }
                >
                  {line}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </main>
  );
}