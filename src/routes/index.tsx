import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Sparkles, RotateCcw, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Echoes of the Ancients — Find Your Historical Twin" },
      {
        name: "description",
        content:
          "Upload your photo and discover which legendary historical persona — pharaoh, viking, samurai, philosopher, emperor — your face most resembles.",
      },
      { property: "og:title", content: "Echoes of the Ancients" },
      {
        property: "og:description",
        content:
          "AI face matching against 20 legendary historical personas across five civilizations.",
      },
    ],
  }),
  component: Index,
});

interface RunnerUp {
  match_name: string;
  category: string;
  similarity: number;
  image_url: string;
  description: string;
}
interface MatchResult extends RunnerUp {
  runners_up: RunnerUp[];
  requires_ad: boolean;
  rate_limit_remaining: number;
}

function Index() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  function reset() {
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setPreviewUrl(URL.createObjectURL(file));
    setLoading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      // Call the edge function directly with fetch — supabase.functions.invoke
      // doesn't handle multipart/form-data bodies reliably (it forces JSON content-type).
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-face`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: form,
      });
      const data = await resp.json().catch(() => ({ error: "Invalid server response" }));
      if (!resp.ok || (data as { error?: string })?.error) {
        throw new Error((data as { error?: string })?.error ?? `Request failed (${resp.status})`);
      }
      setResult(data as MatchResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-screen text-foreground"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="mx-auto max-w-4xl px-6 py-16 md:py-24">
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3" style={{ color: "var(--color-gold)" }} />
            AI Face Matching
          </div>
          <h1
            className="mt-6 text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-gold)" }}
          >
            Echoes of the Ancients
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
            Upload your portrait. Discover which legendary persona — pharaoh, viking,
            samurai, philosopher, or emperor — your face echoes through history.
          </p>
        </header>

        {!result && (
          <Card className="border-border/60 bg-card/60 backdrop-blur p-8 md:p-12">
            <label
              htmlFor="photo-input"
              className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border/70 bg-background/30 p-12 cursor-pointer transition hover:border-primary/60 hover:bg-background/50"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Your upload preview"
                  className="h-48 w-48 rounded-full object-cover ring-4 ring-primary/30"
                />
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full"
                  style={{ background: "var(--gradient-gold)" }}
                >
                  <Upload className="h-8 w-8 text-primary-foreground" />
                </div>
              )}
              <div className="text-center">
                <p className="text-lg font-medium">
                  {loading ? "Consulting the ancients…" : "Upload a clear face photo"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  JPG, PNG or WEBP · max 8 MB · one face, well-lit
                </p>
              </div>
              <input
                ref={inputRef}
                id="photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={loading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>

            {error && (
              <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-destructive-foreground">{error}</p>
                  <button
                    onClick={reset}
                    className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Try another photo
                  </button>
                </div>
              </div>
            )}
          </Card>
        )}

        {result && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <Card className="overflow-hidden border-border/60 bg-card/60 backdrop-blur">
              <div className="grid md:grid-cols-2 gap-0">
                <div className="relative aspect-square">
                  <img
                    src={result.image_url}
                    alt={result.match_name}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute top-4 left-4 rounded-full bg-background/70 backdrop-blur px-3 py-1 text-xs uppercase tracking-wider">
                    {result.category}
                  </div>
                </div>
                <div className="p-8 md:p-10 flex flex-col justify-center">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    You echo
                  </p>
                  <h2
                    className="mt-2 text-3xl md:text-4xl font-bold bg-clip-text text-transparent"
                    style={{ backgroundImage: "var(--gradient-gold)" }}
                  >
                    {result.match_name}
                  </h2>
                  <div className="mt-6">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">Resemblance</span>
                      <span
                        className="text-2xl font-bold"
                        style={{ color: "var(--color-gold)" }}
                      >
                        {result.similarity}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full transition-all duration-1000"
                        style={{
                          width: `${result.similarity}%`,
                          background: "var(--gradient-gold)",
                        }}
                      />
                    </div>
                  </div>
                  <p className="mt-6 text-base text-muted-foreground leading-relaxed">
                    {result.description}
                  </p>
                  {result.requires_ad && (
                    <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                      ✨ Ad would play here on additional reads (free first reading per
                      day).
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {result.runners_up.length > 0 && (
              <div>
                <h3 className="text-sm uppercase tracking-[0.2em] text-muted-foreground mb-4">
                  You also resemble
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {result.runners_up.map((r) => (
                    <Card
                      key={r.match_name}
                      className="flex items-center gap-4 border-border/60 bg-card/40 backdrop-blur p-4"
                    >
                      <img
                        src={r.image_url}
                        alt={r.match_name}
                        className="h-16 w-16 rounded-full object-cover ring-2 ring-border"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{r.match_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.category} · {r.similarity}%
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <Button onClick={reset} variant="secondary" size="lg" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Try another photo
              </Button>
            </div>
          </div>
        )}

        <footer className="mt-20 text-center text-xs text-muted-foreground">
          Powered by Luxand Cloud face recognition · 20 historical personas across 5
          civilizations
        </footer>
      </div>
    </main>
  );
}
