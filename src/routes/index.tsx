import { createFileRoute } from "@tanstack/react-router";
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
import { Upload, Sparkles, RotateCcw, AlertCircle, Languages, CalendarIcon, Check, ChevronsUpDown, Facebook, Twitter, Linkedin, Send, MessageCircle, Link2, Music2, Instagram, Download } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { translations, type Lang } from "@/lib/i18n";
import { NATIONALITIES } from "@/lib/nationalities";
import { compressImage } from "@/lib/image-compress";
import { loadFaceModels, imageFromFile, extractDescriptor } from "@/lib/face-api";

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
  const [dob, setDob] = useState<Date | undefined>(undefined);
  const [nationality, setNationality] = useState<string>("");
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [role, setRole] = useState<string>("any");
  const [civilization, setCivilization] = useState<string>("any");
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
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      // Compress/resize for preview, then extract a 128-float face descriptor
      // in the browser using face-api.js. Only the descriptor is sent to the
      // server — the user's photo never leaves their device.
      const uploadFile = await compressImage(file, 4 * 1024 * 1024);
      setPreviewUrl(URL.createObjectURL(uploadFile));
      await loadFaceModels();
      const img = await imageFromFile(uploadFile);
      const descriptor = await extractDescriptor(img);
      if (!descriptor) {
        throw new Error(
          lang === "ar"
            ? "تعذّر اكتشاف وجه في الصورة. حاول صورة أوضح للوجه."
            : "No face detected in the image. Please try a clearer face photo.",
        );
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-face`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          descriptor,
          lang,
          ...(dob ? { date_of_birth: dob.toISOString().slice(0, 10) } : {}),
          ...(nationality ? { nationality } : {}),
          ...(gender ? { gender } : {}),
          ...(role && role !== "any" ? { role } : {}),
          ...(civilization && civilization !== "any" ? { civilization } : {}),
        }),
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
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3" style={{ color: "var(--color-gold)" }} />
            {t.badge}
          </div>
          <h1
            className="mt-6 text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-gold)" }}
          >
            {t.title}
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
            {t.subtitle}
          </p>
        </header>

        {!result && (
          <Card className="border-border/60 bg-card/60 backdrop-blur p-8 md:p-12">
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">{t.dobLabel}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-start font-normal",
                      !dob && "text-muted-foreground",
                    )}
                    disabled={loading}
                  >
                    <CalendarIcon className="h-4 w-4 opacity-70" />
                    {dob
                      ? format(dob, "PPP", { locale: isRtl ? arLocale : undefined })
                      : t.dobPlaceholder}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dob}
                    onSelect={setDob}
                    captionLayout="dropdown"
                    startMonth={new Date(1920, 0)}
                    endMonth={new Date(new Date().getFullYear(), 11)}
                    defaultMonth={dob ?? new Date(1995, 0, 1)}
                    disabled={(date) =>
                      date > new Date() || date < new Date("1920-01-01")
                    }
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="mb-6">
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
            <div className="mb-6">
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
                    {t.tryAnother}
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
                    {t.youEcho}
                  </p>
                  <h2
                    className="mt-2 text-3xl md:text-4xl font-bold bg-clip-text text-transparent"
                    style={{ backgroundImage: "var(--gradient-gold)" }}
                  >
                    {result.match_name}
                  </h2>
                  <div className="mt-6">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">{t.resemblance}</span>
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
                      {t.adNote}
                    </div>
                  )}
                  <ShareButtons
                    name={result.match_name}
                    category={result.category}
                    similarity={result.similarity}
                    t={t}
                  />
                  <DownloadCardButton
                    userImage={previewUrl}
                    matchImage={result.image_url}
                    name={result.match_name}
                    category={result.category}
                    similarity={result.similarity}
                    description={result.description}
                    t={t}
                    isRtl={isRtl}
                  />
                </div>
              </div>
            </Card>

            <div className="flex justify-center">
              <Button onClick={reset} variant="secondary" size="lg" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                {t.tryAnother}
              </Button>
            </div>
          </div>
        )}

        <footer className="mt-20 text-center text-xs text-muted-foreground">
          {t.footer}
          <div className="mt-2">
            <a href="/admin" className="hover:text-foreground transition-colors">Admin</a>
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
}: {
  name: string;
  category: string;
  similarity: number;
  t: (typeof translations)[Lang];
}) {
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = t.shareText
    .replace("{name}", name)
    .replace("{category}", category)
    .replace("{similarity}", String(similarity));
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(shareText);

  const [campaign, setCampaign] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("tiktok_campaign") ?? "";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tiktok_campaign", campaign);
  }, [campaign]);

  const [includeLink, setIncludeLink] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("tiktok_include_link") !== "0";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tiktok_include_link", includeLink ? "1" : "0");
  }, [includeLink]);

  // Build hashtags from name + category, plus a few brand staples.
  function toHashtag(s: string) {
    // Keep letters/digits across scripts (incl. Arabic), strip everything else.
    const cleaned = s.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
    return cleaned ? `#${cleaned}` : "";
  }
  const baseTags = [
    "#EchoesOfTheAncients",
    "#AncientTwin",
    "#FaceMatch",
    "#History",
    toHashtag(category),
    toHashtag(name),
  ];
  const campaignTag = campaign.trim() ? toHashtag(campaign.trim()) : "";
  const hashtags = Array.from(
    new Set([...baseTags, campaignTag].filter(Boolean)),
  ).join(" ");
  const tiktokCaption = includeLink
    ? `${shareText}\n${shareUrl}\n\n${hashtags}`
    : `${shareText}\n\n${hashtags}`;

  const links = [
    {
      key: "twitter",
      label: "X / Twitter",
      Icon: Twitter,
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    },
    {
      key: "facebook",
      label: "Facebook",
      Icon: Facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      Icon: MessageCircle,
      href: `https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`,
    },
    {
      key: "telegram",
      label: "Telegram",
      Icon: Send,
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      Icon: Linkedin,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
  ];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      toast.success(t.shareCopied);
    } catch {
      toast.error("Copy failed");
    }
  }

  async function copyForTiktok() {
    try {
      await navigator.clipboard.writeText(tiktokCaption);
      toast.success(t.shareTiktokCopied);
      window.open("https://www.tiktok.com/upload", "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Copy failed");
    }
  }

  /**
   * Instagram has no public web share intent. Best we can do:
   *  - Always copy the caption to the clipboard so the user can paste it.
   *  - On mobile (where the IG app is likely installed), try the deep-link
   *    URL schemes for Story/Post composer. These are app-only and silently
   *    no-op if IG isn't installed, so we fall back to the web composer
   *    after a short delay.
   *  - On desktop, open the web Create/Home page directly.
   */
  async function shareToInstagram(target: "story" | "post") {
    try {
      await navigator.clipboard.writeText(tiktokCaption);
    } catch {
      toast.error("Copy failed");
      return;
    }
    toast.success(t.shareInstagramCopied);

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    const webFallback =
      target === "post"
        ? "https://www.instagram.com/create/select/"
        : "https://www.instagram.com/";

    if (isMobile) {
      const deepLink =
        target === "story"
          ? "instagram://story-camera"
          : "instagram://library?AssetPath=";
      // Try the app first; if nothing handles it, swap to the web URL.
      const start = Date.now();
      window.location.href = deepLink;
      window.setTimeout(() => {
        // If the page is still focused after ~1.2s, the app didn't open.
        if (Date.now() - start < 1500 && !document.hidden) {
          window.open(webFallback, "_blank", "noopener,noreferrer");
        }
      }, 1200);
      toast.message(t.shareInstagramOpening);
    } else {
      window.open(webFallback, "_blank", "noopener,noreferrer");
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: name, text: shareText, url: shareUrl });
      } catch {
        /* user cancelled */
      }
    }
  }

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="mt-6 border-t border-border/40 pt-5">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t.shareTitle}
      </p>
      <div className="mb-4">
        <label
          htmlFor="campaign-tag"
          className="block text-xs font-medium text-muted-foreground mb-1"
        >
          {t.campaignLabel}
        </label>
        <Input
          id="campaign-tag"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          placeholder={t.campaignPlaceholder}
          maxLength={40}
          className="h-9"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t.campaignHint}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <label htmlFor="tiktok-include-link" className="text-xs text-muted-foreground">
            {t.includeLinkLabel}
          </label>
          <Switch
            id="tiktok-include-link"
            checked={includeLink}
            onCheckedChange={setIncludeLink}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map(({ key, label, Icon, href }) => (
          <Button
            key={key}
            asChild
            variant="outline"
            size="icon"
            aria-label={label}
            title={label}
          >
            <a href={href} target="_blank" rel="noopener noreferrer">
              <Icon className="h-4 w-4" />
            </a>
          </Button>
        ))}
        <Button
          variant="outline"
          size="icon"
          onClick={copyLink}
          aria-label={t.shareCopy}
          title={t.shareCopy}
        >
          <Link2 className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={copyForTiktok}
          aria-label={t.shareTiktok}
          title={t.shareTiktok}
        >
          <Music2 className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={t.shareInstagram}
              title={t.shareInstagram}
            >
              <Instagram className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => shareToInstagram("story")}>
              {t.shareInstagramStory}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => shareToInstagram("post")}>
              {t.shareInstagramPost}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {canNativeShare && (
          <Button variant="secondary" size="sm" onClick={nativeShare} className="gap-2">
            <Send className="h-4 w-4" />
            {t.shareTitle}
          </Button>
        )}
      </div>
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
      ctx.font = "bold 64px serif";
      ctx.textAlign = "center";
      ctx.fillText(name, W / 2, 720);

      // Category
      ctx.fillStyle = "#a89cc6";
      ctx.font = "italic 32px serif";
      ctx.fillText(category, W / 2, 770);

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

      // Trigger download
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/png"),
      );
      if (!blob) throw new Error("Failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `echoes-${name.replace(/\s+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t.downloadCardSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <Button
        onClick={generate}
        disabled={busy || !userImage}
        variant="default"
        className="w-full gap-2"
      >
        <Download className="h-4 w-4" />
        {busy ? t.downloadingCard : t.downloadCard}
      </Button>
    </div>
  );
}
