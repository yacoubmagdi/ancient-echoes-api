import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Upload, Sparkles, RotateCcw, AlertCircle, Languages, CalendarIcon, Check, ChevronsUpDown, Facebook, Download, BookOpen, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { translations, type Lang } from "@/lib/i18n";
import { NATIONALITIES } from "@/lib/nationalities";
import { normalizeForFaceApi } from "@/lib/image-compress";
import { loadFaceModels, extractDescriptor } from "@/lib/face-api";
import { analyzeFace } from "@/server/analyze-face.functions";
import { saveSharedResult } from "@/server/share.functions";
import { supabase } from "@/integrations/supabase/client";
import { translateName, translateCategory, translateDescription } from "@/lib/persona-i18n";
import heroBg from "@/assets/egypteca-hero-bg.png";

// Client-side analysis result cache — avoids redundant API calls for the
// same face + filter combo. Keyed by a hash of the descriptor + filters.
const analysisCache = new Map<string, { result: MatchResult; at: number }>();
const ANALYSIS_CACHE_TTL = 10 * 60 * 1000; // 10 min

function descriptorCacheKey(descriptor: number[], filters: Record<string, string>): string {
  // Quantize to 3 decimals (same as server) for consistency
  const d = descriptor.map((v) => v.toFixed(3)).join(",");
  const f = Object.entries(filters).sort().map(([k, v]) => `${k}=${v}`).join("&");
  return `${d}|${f}`;
}

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
  source_image_url?: string | null;
}
interface MatchResult extends RunnerUp {
  runners_up: RunnerUp[];
  requires_ad: boolean;
  rate_limit_remaining: number;
}

function Index() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [matchIndex, setMatchIndex] = useState(0);
  const [dobDay, setDobDay] = useState<string>("");
  const [dobMonth, setDobMonth] = useState<string>("");
  const [nationality, setNationality] = useState<string>("");
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [role, setRole] = useState<string>("any");
  const [civilization, setCivilization] = useState<string>("any");
  const skinToneEnabled = true;
  // Always start with "en" on the server AND first client render to avoid
  // hydration mismatch; load saved language in an effect after mount.
  const [lang, setLang] = useState<Lang>("en");
  const t = useMemo(() => translations[lang], [lang]);
  const isRtl = lang === "ar";

  const sortedNationalities = useMemo(
    () =>
      NATIONALITIES.slice().sort((a, b) =>
        (isRtl ? a.ar : a.en).localeCompare(isRtl ? b.ar : b.en, isRtl ? "ar" : "en"),
      ),
    [isRtl],
  );
  const selectedNationality = useMemo(
    () => NATIONALITIES.find((n) => n.code === nationality),
    [nationality],
  );

  // After mount: read saved language preference (client-only).
  useEffect(() => {
    const saved = window.localStorage.getItem("lang") as Lang | null;
    if (saved === "ar" || saved === "en") {
      setLang(saved);
    } else if (navigator.language?.toLowerCase().startsWith("ar")) {
      setLang("ar");
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    window.localStorage.setItem("lang", lang);
  }, [lang, isRtl]);

  const toggleLang = () => setLang((l) => (l === "ar" ? "en" : "ar"));

  function reset() {
    setPreviewUrl(null);
    setPendingFile(null);
    setResult(null);
    setError(null);
    setMatchIndex(0);
    analysisCache.clear();
    if (inputRef.current) inputRef.current.value = "";
  }

  function selectFile(file: File) {
    setError(null);
    setResult(null);
    setMatchIndex(0);
    setPendingFile(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setMatchIndex(0);
    setLoading(true);
    try {
      // Timeout helper — guarantees the UI never gets stuck on a slow device
      // or a wedged face-api call.
      const withTimeout = <T,>(p: Promise<T>, ms: number, label: string) =>
        Promise.race<T>([
          p,
          new Promise<T>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    lang === "ar"
                      ? `استغرقت العملية وقتًا أطول من المتوقع (${label}). جرّب صورة أصغر أو اتصال أفضل.`
                      : `Operation timed out (${label}). Try a smaller photo or a better connection.`,
                  ),
                ),
              ms,
            ),
          ),
        ]);

      const { file: uploadFile, image } = await withTimeout(
        normalizeForFaceApi(file, 1 * 1024 * 1024, 1200),
        20_000,
        lang === "ar" ? "تحضير الصورة" : "image prep",
      );
      setPreviewUrl(URL.createObjectURL(uploadFile));
      await withTimeout(
        loadFaceModels(),
        30_000,
        lang === "ar" ? "تحميل النموذج" : "model load",
      );
      const faceResult = await withTimeout(
        extractDescriptor(image),
        45_000,
        lang === "ar" ? "تحليل الوجه" : "face analysis",
      );
      if (faceResult === "multiple_faces") {
        throw new Error(
          lang === "ar"
            ? "تم اكتشاف أكثر من وجه في الصورة. يرجى رفع صورة تحتوي على وجه واحد فقط."
            : "Multiple faces detected. Please upload a photo with only one face.",
        );
      }
      if (!faceResult) {
        throw new Error(
          lang === "ar"
            ? "تعذّر اكتشاف وجه في الصورة. حاول صورة أوضح للوجه."
            : "No face detected in the image. Please try a clearer face photo.",
        );
      }
      const { descriptor, skinTone } = faceResult;
      // Use AI-detected gender when user hasn't manually selected one
      const effectiveGender = gender || faceResult.detectedGender || "";
      // Check client-side cache first
      const filters: Record<string, string> = {
        lang,
        gender: effectiveGender,
        role: role && role !== "any" ? role : "",
        civ: civilization && civilization !== "any" ? civilization : "",
        nat: nationality || "",
        skin: skinToneEnabled ? "1" : "0",
      };
      const cKey = descriptorCacheKey(descriptor, filters);
      const cached = analysisCache.get(cKey);
      if (cached && Date.now() - cached.at < ANALYSIS_CACHE_TTL) {
        setResult(cached.result);
        setLoading(false);
        return;
      }

      const data = await withTimeout(
        analyzeFace({
        data: {
          descriptor,
          ...(skinToneEnabled ? { skin_tone: skinTone } : {}),
          lang,
          ...(dobDay && dobMonth
            ? { date_of_birth: `${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}` }
            : {}),
          ...(nationality ? { nationality } : {}),
          ...(effectiveGender ? { gender: effectiveGender } : {}),
          ...(role && role !== "any" ? { role } : {}),
          ...(civilization && civilization !== "any" ? { civilization } : {}),
        },
        }),
        30_000,
        lang === "ar" ? "الاتصال بالخادم" : "server call",
      );
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error?: string }).error);
      }
      const matchData = data as MatchResult;
      setResult(matchData);
      // Store in client cache
      analysisCache.set(cKey, { result: matchData, at: Date.now() });
    } catch (e) {
      console.error("[upload] face analysis failed:", e);
      const msg = e instanceof Error ? e.message : (lang === "ar" ? "حدث خطأ غير متوقع" : "Something went wrong");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-screen text-foreground"
      style={{ background: "var(--gradient-hero)" }}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="mx-auto max-w-4xl px-6 py-16 md:py-24">
        <div className="mb-6 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleLang}
            className="gap-2"
            aria-label="Toggle language"
          >
            <Languages className="h-4 w-4" />
            {t.langLabel}
          </Button>
        </div>
        <header className="text-center mb-12">
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/30">
            <img
              src={heroBg}
              alt="Egypteca"
              className="w-full h-auto block object-contain"
            />
          </div>
          <h1
            className="mt-8 text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-gold)" }}
          >
            {t.title}
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
            {t.subtitle}
            <a
              href="/admin"
              aria-label="."
              title=""
              className="ms-2 inline-block w-[0.45em] h-[0.45em] rounded-full bg-[#3e2a1a] hover:bg-[#2a1c10] transition-colors align-middle relative -translate-y-[0.1em]"
            />
          </p>
        </header>

        {!result && (
          <Card className="border-border/60 bg-card/60 backdrop-blur p-8 md:p-12">
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">{t.dobLabel}</label>
              <div className="grid grid-cols-2 gap-3">
                <Select value={dobDay} onValueChange={setDobDay} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder={isRtl ? "اليوم" : "Day"} />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dobMonth} onValueChange={setDobMonth} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder={isRtl ? "الشهر" : "Month"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(isRtl
                      ? ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]
                      : ["January","February","March","April","May","June","July","August","September","October","November","December"]
                    ).map((name, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mb-6 hidden">
              <label className="block text-sm font-medium mb-2">{t.nationalityLabel}</label>
              <Popover open={nationalityOpen} onOpenChange={setNationalityOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={nationalityOpen}
                    disabled={loading}
                    className={cn(
                      "w-full justify-between font-normal",
                      !selectedNationality && "text-muted-foreground",
                    )}
                  >
                    {selectedNationality
                      ? isRtl
                        ? selectedNationality.ar
                        : selectedNationality.en
                      : t.nationalityPlaceholder}
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command
                    filter={(value, search) => {
                      // value is the option's `value` (lowercased by cmdk).
                      // We stored a composite `${ar}|${en}|${code}` string so
                      // searching in either Arabic or English works.
                      if (!search) return 1;
                      return value.includes(search.toLowerCase()) ? 1 : 0;
                    }}
                  >
                    <CommandInput
                      placeholder={t.nationalitySearchPlaceholder}
                      dir={isRtl ? "rtl" : "ltr"}
                    />
                    <CommandList>
                      <CommandEmpty>{t.nationalityNoResults}</CommandEmpty>
                      <CommandGroup>
                        {sortedNationalities.map((n) => {
                          const label = isRtl ? n.ar : n.en;
                          return (
                            <CommandItem
                              key={n.code}
                              value={`${n.ar}|${n.en}|${n.code}`}
                              onSelect={() => {
                                setNationality(n.code);
                                setNationalityOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "h-4 w-4",
                                  nationality === n.code ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span>{label}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">{t.genderLabel}</label>
              <RadioGroup
                value={gender}
                onValueChange={(v) => setGender(v as "male" | "female")}
                disabled={loading}
                className="flex gap-6"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="male" id="gender-male" />
                  <span className="text-sm">{t.genderMale}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="female" id="gender-female" />
                  <span className="text-sm">{t.genderFemale}</span>
                </label>
              </RadioGroup>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">{t.roleLabel}</label>
              <Select value={role} onValueChange={setRole} disabled={loading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.rolePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t.roleAny}</SelectItem>
                  <SelectItem value="royalty">{t.roleRoyalty}</SelectItem>
                  <SelectItem value="warrior">{t.roleWarrior}</SelectItem>
                  <SelectItem value="priest">{t.rolePriest}</SelectItem>
                  <SelectItem value="scholar">{t.roleScholar}</SelectItem>
                  <SelectItem value="artist">{t.roleArtist}</SelectItem>
                  <SelectItem value="craftsman">{t.roleCraftsman}</SelectItem>
                  <SelectItem value="explorer">{t.roleExplorer}</SelectItem>
                  <SelectItem value="noble">{t.roleNoble}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mb-6 hidden">
              <label className="block text-sm font-medium mb-2">{t.civilizationLabel}</label>
              <Select value={civilization} onValueChange={setCivilization} disabled={loading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.civilizationPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t.civilizationAny}</SelectItem>
                  <SelectItem value="Pharaoh">{t.civPharaoh}</SelectItem>
                  <SelectItem value="Greek">{t.civGreek}</SelectItem>
                  <SelectItem value="Persian">{t.civPersian}</SelectItem>
                  <SelectItem value="Samurai">{t.civSamurai}</SelectItem>
                  <SelectItem value="Viking">{t.civViking}</SelectItem>
                  <SelectItem value="Chinese">{t.civChinese}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label
              htmlFor="photo-input"
              className={`flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border/70 bg-background/30 p-12 transition ${loading ? "cursor-not-allowed opacity-70 pointer-events-none" : "cursor-pointer hover:border-primary/60 hover:bg-background/50"}`}
              aria-disabled={loading}
            >
              {previewUrl ? (
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={previewUrl}
                    alt="Your upload preview"
                    className="h-48 w-48 rounded-full object-cover ring-4 ring-primary/30"
                  />
                  {loading && (
                    <div
                      className="w-48 h-1.5 rounded-full overflow-hidden bg-border/40"
                      role="progressbar"
                      aria-label={t.consulting}
                    >
                      <div
                        className="h-full w-1/3 rounded-full animate-[loading-bar_1.2s_ease-in-out_infinite]"
                        style={{ background: "var(--gradient-gold)" }}
                      />
                    </div>
                  )}
                </div>
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
                  {loading ? t.consulting : t.uploadCta}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.uploadHint}
                </p>
              </div>
              <input
                ref={inputRef}
                id="photo-input"
                type="file"
                accept="image/*,.heic,.heif"
                className="sr-only"
                disabled={loading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) selectFile(f);
                }}
              />
            </label>

            {previewUrl && pendingFile && !loading && !result && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => pendingFile && handleFile(pendingFile)}
                  className="flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                  style={{ background: "var(--gradient-gold)" }}
                >
                  <Sparkles className="h-4 w-4" />
                  {t.confirmAnalyze}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border/70 bg-background/40 px-4 py-3 text-sm font-medium transition hover:border-primary/60 hover:bg-background/60"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t.changePhoto}
                </button>
              </div>
            )}

            {error && (
              <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-destructive-foreground">{error}</p>
                  <button
                    onClick={reset}
                    className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    {t.tryAnother}
                  </button>
                </div>
              </div>
            )}
          </Card>
        )}

        {result && (
          <div className="space-y-8 animate-in fade-in duration-700">
            {/* Top Matches heading */}
            <h2
              className="text-2xl md:text-3xl font-bold text-center bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-gold)" }}
            >
              {t.topMatches}
            </h2>

            {/* Build array of all matches (up to 5) */}
            {(() => {
              const allMatches: (RunnerUp & { rank: number })[] = [
                { ...result, rank: 1 },
                ...(result.runners_up ?? []).map((r, i) => ({ ...r, rank: i + 2 })),
              ].slice(0, 5);
              const safeIndex = Math.min(matchIndex, allMatches.length - 1);
              const match = allMatches[safeIndex];
              const idx = safeIndex;
              const hasMore = allMatches.length > 1;
              return (
                <>
                <Card key={match.rank} className="overflow-hidden border-border/60 bg-card/60 backdrop-blur">
                  <div className="grid md:grid-cols-2 gap-0">
                    <div className="relative aspect-square">
                      <img
                        src={match.image_url}
                        alt={match.match_name}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <div className="absolute top-4 left-4 rounded-full bg-background/70 backdrop-blur px-3 py-1 text-xs uppercase tracking-wider">
                        {translateCategory(match.category, lang)}
                      </div>
                      <div
                        className="absolute top-4 right-4 flex items-center justify-center h-10 w-10 rounded-full font-bold text-lg text-primary-foreground"
                        style={{ background: "var(--gradient-gold)" }}
                      >
                        {match.rank}
                      </div>
                    </div>
                    <div className="p-8 md:p-10 flex flex-col justify-center">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {t.matchRank.replace("{rank}", String(match.rank))}
                      </p>
                      <h2
                        className="mt-2 text-3xl md:text-4xl font-bold bg-clip-text text-transparent"
                        style={{ backgroundImage: "var(--gradient-gold)" }}
                      >
                        {translateName(match.match_name, lang)}
                      </h2>
                      <div className="mt-6">
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm text-muted-foreground">{t.resemblance}</span>
                          <span
                            className="text-2xl font-bold"
                            style={{ color: "var(--color-gold)" }}
                          >
                            {match.similarity}%
                          </span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full transition-all duration-1000"
                            style={{
                              width: `${match.similarity}%`,
                              background: "var(--gradient-gold)",
                            }}
                          />
                        </div>
                      </div>
                      <p className="mt-6 text-base text-muted-foreground leading-relaxed">
                        {translateDescription(match.description, lang)}
                      </p>
                      {match.source_image_url && (
                        <SourceImageToggle sourceImageUrl={match.source_image_url} name={translateName(match.match_name, lang)} />
                      )}
                      {idx === 0 && result.requires_ad && (
                        <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                          {t.adNote}
                        </div>
                      )}
                      <ShareButtons
                        key={`share-${match.rank}`}
                        name={translateName(match.match_name, lang)}
                        category={translateCategory(match.category, lang)}
                        similarity={match.similarity}
                        t={t}
                        matchImageUrl={match.image_url}
                        description={translateDescription(match.description, lang)}
                        userImage={previewUrl}
                      />
                      <DownloadCardButton
                        key={`dl-${match.rank}`}
                        userImage={previewUrl}
                        matchImage={match.image_url}
                        name={translateName(match.match_name, lang)}
                        category={translateCategory(match.category, lang)}
                        similarity={match.similarity}
                        description={translateDescription(match.description, lang)}
                        t={t}
                        isRtl={isRtl}
                      />
                    </div>
                  </div>
                </Card>
                {hasMore && (
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      onClick={() => setMatchIndex((i) => (i + 1) % allMatches.length)}
                      variant="outline"
                      size="lg"
                      className="gap-2"
                    >
                      {t.tryAnotherPersona}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {safeIndex + 1} / {allMatches.length}
                    </span>
                  </div>
                )}
                </>
              );
            })()}

            <div className="flex justify-center">
              <Button onClick={reset} variant="secondary" size="lg" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                {t.tryAnother}
              </Button>
            </div>
          </div>
        )}

        <footer className="mt-20 text-center text-xs text-muted-foreground">
          <div className="mx-auto max-w-2xl rounded-lg border border-border/50 bg-card/30 p-6">
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              {t.privacyTitle}
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t.privacyText}
            </p>
          </div>
          <div className="mt-4">
            <Link
              to="/facebook-setup"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t.fbSetupNav}
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function ShareButtons({
  name,
  category,
  similarity,
  t,
  matchImageUrl,
  description,
  userImage,
}: {
  name: string;
  category: string;
  similarity: number;
  t: (typeof translations)[Lang];
  matchImageUrl: string;
  description: string;
  userImage: string | null;
}) {
  const shareText = t.shareText
    .replace("{name}", name)
    .replace("{category}", category)
    .replace("{similarity}", String(similarity));

  const [saving, setSaving] = useState(false);
  const savedIdRef = useRef<string | null>(null);

  async function ensureShareUrl(): Promise<string> {
    if (savedIdRef.current) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      return `${origin}/api/public/hooks/share-page?id=${savedIdRef.current}`;
    }
    setSaving(true);
    try {
      let userThumb: string | undefined;
      if (userImage) {
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = rej;
            img.src = userImage;
          });
          const canvas = document.createElement("canvas");
          canvas.width = 200;
          canvas.height = 200;
          const ctx = canvas.getContext("2d")!;
          const ir = img.width / img.height;
          let sx = 0, sy = 0, sw = img.width, sh = img.height;
          if (ir > 1) { sw = img.height; sx = (img.width - sw) / 2; }
          else { sh = img.width; sy = (img.height - sh) / 2; }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 200, 200);
          userThumb = canvas.toDataURL("image/jpeg", 0.6);
        } catch {
          // skip thumbnail
        }
      }

      const resp = await saveSharedResult({
        data: {
          match_name: name,
          category,
          similarity,
          description,
          match_image_url: matchImageUrl,
          user_image_data: userThumb,
        },
      });
      savedIdRef.current = resp.id;
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      return `${origin}/api/public/hooks/share-page?id=${resp.id}`;
    } catch (e) {
      return typeof window !== "undefined" ? window.location.href : "";
    } finally {
      setSaving(false);
    }
  }

  async function handleShareFacebook() {
    const url = await ensureShareUrl();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const redirectUrl = `${origin}/api/public/hooks/share-facebook?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(shareText)}`;
    window.open(
      redirectUrl,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="mt-6 border-t border-border/40 pt-5">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t.shareTitle}
      </p>
      <Button
        size="sm"
        disabled={saving}
        onClick={handleShareFacebook}
        className="gap-2 bg-[#1877F2] text-white hover:bg-[#166FE5]"
      >
        <Facebook className="h-4 w-4" />
        {t.shareOnFacebook}
      </Button>
    </div>
  );
}

function DownloadCardButton({
  userImage,
  matchImage,
  name,
  category,
  similarity,
  description,
  t,
  isRtl,
}: {
  userImage: string | null;
  matchImage: string;
  name: string;
  category: string;
  similarity: number;
  description: string;
  t: (typeof translations)[Lang];
  isRtl: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function drawCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const ir = img.width / img.height;
    const tr = w / h;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (ir > tr) {
      sw = img.height * tr;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / tr;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  async function generate() {
    if (!userImage) {
      toast.error(t.uploadCta);
      return;
    }
    setBusy(true);
    try {
      const W = 1080;
      const H = 1350;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;

      // Background gradient (dark navy → deep purple)
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#0b0a1f");
      bg.addColorStop(1, "#1a1430");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Subtle gold border
      ctx.strokeStyle = "#c9a84c";
      ctx.lineWidth = 4;
      ctx.strokeRect(20, 20, W - 40, H - 40);

      // Title
      ctx.fillStyle = "#e8d27a";
      ctx.textAlign = "center";
      ctx.font = "bold 56px serif";
      ctx.fillText(isRtl ? "أصداء القدماء" : "Echoes of the Ancients", W / 2, 100);

      // Load images in parallel
      const [uImg, mImg] = await Promise.all([loadImg(userImage), loadImg(matchImage)]);

      // Two side-by-side circular portraits
      const portraitSize = 380;
      const portraitY = 170;
      const leftX = 110;
      const rightX = W - 110 - portraitSize;

      function drawCircle(img: HTMLImageElement, x: number, y: number, label: string) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + portraitSize / 2, y + portraitSize / 2, portraitSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        drawCover(ctx, img, x, y, portraitSize, portraitSize);
        ctx.restore();
        // Gold ring
        ctx.beginPath();
        ctx.arc(x + portraitSize / 2, y + portraitSize / 2, portraitSize / 2, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#c9a84c";
        ctx.stroke();
        // Label
        ctx.fillStyle = "#cfcfe0";
        ctx.font = "28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, x + portraitSize / 2, y + portraitSize + 50);
      }

      drawCircle(uImg, leftX, portraitY, t.cardYou);
      drawCircle(mImg, rightX, portraitY, t.cardMatch);

      // Equals/echo symbol between
      ctx.fillStyle = "#c9a84c";
      ctx.font = "bold 70px serif";
      ctx.textAlign = "center";
      ctx.fillText("≈", W / 2, portraitY + portraitSize / 2 + 25);

      // Match name
      ctx.fillStyle = "#f5e9b8";
      ctx.font = "bold 48px serif";
      ctx.textAlign = "center";
      ctx.fillText(name, W / 2, 705);

      // Category
      ctx.fillStyle = "#a89cc6";
      ctx.font = "italic 32px serif";
      ctx.fillText(category, W / 2, 748);

      // Similarity bar
      const barX = 180;
      const barY = 820;
      const barW = W - 360;
      const barH = 22;
      ctx.fillStyle = "#2a2440";
      ctx.fillRect(barX, barY, barW, barH);
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, "#c9a84c");
      grad.addColorStop(1, "#f5e9b8");
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, (barW * similarity) / 100, barH);

      ctx.fillStyle = "#e8d27a";
      ctx.font = "bold 44px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${similarity}% ${t.resemblance}`, W / 2, barY + 80);

      // Description (wrapped)
      ctx.fillStyle = "#d8d4e8";
      ctx.font = "28px sans-serif";
      ctx.textAlign = "center";
      const lines = wrapText(ctx, description, W - 200);
      const maxLines = 6;
      const shown = lines.slice(0, maxLines);
      shown.forEach((ln, i) => {
        ctx.fillText(ln, W / 2, 970 + i * 38);
      });

      // Footer brand
      ctx.fillStyle = "#8a82a8";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        isRtl ? "اكتشف صداك التاريخي" : "Discover your historical echo",
        W / 2,
        H - 60,
      );

      // Show in dialog
      const dataUrl = canvas.toDataURL("image/png");
      setPreviewSrc(dataUrl);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadImage() {
    if (!previewSrc) return;
    const a = document.createElement("a");
    a.href = previewSrc;
    a.download = `echoes-${name.replace(/\s+/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success(t.downloadCardSaved);
  }

  function openShareFacebook() {
    const shareText = t.shareText
      .replace("{name}", name)
      .replace("{category}", category)
      .replace("{similarity}", String(Math.round(similarity)));
    const url = window.location.href;
    const redirectUrl = `${window.location.origin}/api/public/hooks/share-facebook?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(shareText)}`;
    window.open(
      redirectUrl,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="mt-4">
      <Button
        onClick={generate}
        disabled={busy || !userImage}
        variant="default"
        className="w-full gap-2"
      >
        <Eye className="h-4 w-4" />
        {busy ? t.downloadingCard : t.downloadCard}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.shareImageTitle}</DialogTitle>
          </DialogHeader>
          {previewSrc && (
            <div className="space-y-4">
              <img
                src={previewSrc}
                alt={name}
                className="w-full rounded-lg border border-border/40"
              />
              <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border/40 pt-3">
                <Button variant="default" size="sm" onClick={downloadImage} className="gap-2">
                  <Download className="h-4 w-4" />
                  {t.downloadImage}
                </Button>
                <Button
                  size="sm"
                  onClick={openShareFacebook}
                  className="gap-2 bg-[#1877F2] text-white hover:bg-[#166FE5]"
                >
                  <Facebook className="h-4 w-4" />
                  {t.shareOnFacebook}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SourceImageToggle({ sourceImageUrl, name }: { sourceImageUrl: string; name: string }) {
  const isValidUrl = /^https?:\/\//i.test(sourceImageUrl);
  if (!isValidUrl) return null;

  // Extract readable title from Wikipedia URL
  const getWikiTitle = (url: string) => {
    const m = url.match(/\/wiki\/(.+?)(?:#.*)?$/);
    if (m) return decodeURIComponent(m[1]).replace(/_/g, " ");
    return null;
  };

  const wikiTitle = getWikiTitle(sourceImageUrl);
  const isWikipedia = sourceImageUrl.includes("wikipedia.org");

  return (
    <a
      href={sourceImageUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary hover:bg-primary/10 transition-colors"
    >
      <BookOpen className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-start">
        {isWikipedia ? (
          <>📜 المصدر التاريخي: <span className="font-medium">{wikiTitle || name}</span></>
        ) : (
          <>📜 المصدر التاريخي ↗</>
        )}
      </span>
      <span className="text-xs text-muted-foreground">↗</span>
    </a>
  );
}
