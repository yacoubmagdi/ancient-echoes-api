import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, ExternalLink, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { zipSync, strToU8 } from "fflate";

export const Route = createFileRoute("/facebook-setup")({
  head: () => ({
    meta: [
      { title: "Publish on Facebook — Ancient Echoes" },
      {
        name: "description",
        content:
          "Step-by-step guide to publish Ancient Echoes as a Facebook Instant Game, including a ready-to-upload ZIP package.",
      },
      { property: "og:title", content: "Publish on Facebook — Ancient Echoes" },
      {
        property: "og:description",
        content:
          "Download the game package and follow the steps to publish on Facebook Instant Games.",
      },
    ],
  }),
  component: FacebookSetupPage,
});

function FacebookSetupPage() {
  const { t, lang } = useI18n();
  const isRtl = lang === "ar";
  const [building, setBuilding] = useState(false);

  const handleDownload = async () => {
    try {
      setBuilding(true);
      const files = [
        "index.html",
        "game.js",
        "style.css",
        "fbapp-config.json",
        "models/tiny_face_detector_model-weights_manifest.json",
        "models/tiny_face_detector_model.bin",
        "models/face_landmark_68_model-weights_manifest.json",
        "models/face_landmark_68_model.bin",
        "models/face_recognition_model-weights_manifest.json",
        "models/face_recognition_model.bin",
      ];
      const entries = await Promise.all(
        files.map(async (f) => {
          const source = f.startsWith("models/") ? `/${f}` : `/game/${f}`;
          const res = await fetch(source, { cache: "no-store" });
          if (!res.ok) throw new Error(`Failed to fetch ${f}`);
          if (f.endsWith(".bin")) {
            return [f, new Uint8Array(await res.arrayBuffer())] as const;
          }
          return [f, strToU8(await res.text())] as const;
        }),
      );
      const zipped = zipSync(Object.fromEntries(entries));
      const blob = new Blob([zipped], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ancient-echoes-fb-instant-game.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Download failed. Please try again.");
    } finally {
      setBuilding(false);
    }
  };

  const steps = [
    { title: t.fbSetupStep1Title, body: t.fbSetupStep1 },
    { title: t.fbSetupStep2Title, body: t.fbSetupStep2 },
    { title: t.fbSetupStep3Title, body: t.fbSetupStep3 },
    { title: t.fbSetupStep4Title, body: t.fbSetupStep4 },
    { title: t.fbSetupStep5Title, body: t.fbSetupStep5 },
  ];

  const requirements = [
    t.fbSetupReq1,
    t.fbSetupReq2,
    t.fbSetupReq3,
    t.fbSetupReq4,
  ];

  return (
    <div
      className="min-h-screen bg-background px-4 py-10"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="mx-auto max-w-3xl space-y-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className={`h-4 w-4 ${isRtl ? "rotate-180" : ""}`} />
          {t.fbSetupBack}
        </Link>

        <header className="space-y-3">
          <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
            {t.fbSetupTitle}
          </h1>
          <p className="text-muted-foreground">{t.fbSetupIntro}</p>
        </header>

        <Card className="space-y-4 border-primary/30 bg-primary/5 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {t.fbSetupDownload}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t.fbSetupDownloadHint}
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleDownload}
              disabled={building}
              className="bg-[#1877F2] hover:bg-[#1666d4] text-white"
            >
              <Download className="h-4 w-4" />
              {building ? "..." : t.fbSetupDownload}
            </Button>
          </div>
        </Card>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">
            {t.fbSetupStepsTitle}
          </h2>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i}>
                <Card className="p-4">
                  <div className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-foreground">
                        {s.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">{s.body}</p>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">
            {t.fbSetupRequirementsTitle}
          </h2>
          <Card className="p-4">
            <ul className="space-y-2">
              {requirements.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <div>
          <Button asChild variant="outline">
            <a
              href="https://developers.facebook.com/docs/games/build/instant-games"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              {t.fbSetupDocsLink}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}