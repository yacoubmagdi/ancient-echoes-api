import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
    append("Loading face-api models...");
    await loadFaceModels();
    append("Models ready.");

    const targets = onlyMissing
      ? personas.filter((p) => !p.face_descriptor)
      : personas;
    setProgress({ done: 0, total: targets.length, ok: 0, failed: 0 });
    append(`Processing ${targets.length} personas...`);

    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (!accessToken) {
      append("ERROR: not authenticated");
      setRunning(false);
      return;
    }

    let ok = 0, failed = 0;
    const batchItems: { id: string; descriptor: number[] | null }[] = [];

    async function flushBatch() {
      if (batchItems.length === 0) return;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-face-descriptor`;
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
        if (!resp.ok) append(`Save batch failed: ${(data as { error?: string }).error ?? resp.status}`);
      } catch (e) {
        append(`Save error: ${(e as Error).message}`);
      }
      batchItems.length = 0;
    }

    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      try {
        const img = await imageFromUrl(p.image_url);
        const desc = await extractDescriptor(img);
        if (desc) {
          batchItems.push({ id: p.id, descriptor: desc.descriptor });
          ok++;
        } else {
          batchItems.push({ id: p.id, descriptor: null });
          failed++;
          append(`No face: ${p.name}`);
        }
      } catch (e) {
        failed++;
        append(`Error ${p.name}: ${(e as Error).message}`);
      }
      setProgress({ done: i + 1, total: targets.length, ok, failed });
      // Flush every 10 items
      if (batchItems.length >= 10) await flushBatch();
    }
    await flushBatch();
    append(`Done. ${ok} succeeded, ${failed} failed.`);
    setRunning(false);

    // Refresh persona list to reflect new descriptors
    const { data } = await supabase
      .from("personas")
      .select("id, name, image_url, face_descriptor")
      .order("category")
      .order("name")
      .limit(2000);
    setPersonas((data as Persona[]) ?? []);
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
              <span className="font-medium">{running ? "Processing…" : "Run complete"}</span>
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