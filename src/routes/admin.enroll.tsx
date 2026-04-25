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
          batchItems.push({ id: p.id, descriptor: desc });
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

  return (
    <main className="min-h-screen p-8 mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Face Enrollment</h1>
        <Link to="/admin" className="text-sm underline">← Back to admin</Link>
      </div>

      <Card className="p-6 mb-6">
        <div className="space-y-2 mb-4">
          <p className="text-sm">Total personas: <strong>{personas.length}</strong></p>
          <p className="text-sm">Already enrolled: <strong>{enrolled}</strong></p>
          <p className="text-sm">Missing descriptor: <strong>{personas.length - enrolled}</strong></p>
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

        <Button onClick={run} disabled={running} className="w-full">
          {running ? "Processing..." : "Start enrollment"}
        </Button>

        {progress.total > 0 && (
          <div className="mt-4 space-y-2">
            <Progress value={pct} />
            <p className="text-xs text-muted-foreground text-center">
              {progress.done} / {progress.total} — ✅ {progress.ok} · ❌ {progress.failed}
            </p>
          </div>
        )}
      </Card>

      {log.length > 0 && (
        <Card className="p-4 max-h-96 overflow-auto font-mono text-xs">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </Card>
      )}
    </main>
  );
}