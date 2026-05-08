import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Pencil, Trash2, Plus, RefreshCw, LogOut, Sparkles, ImageIcon, BookOpen, ChevronRight, ExternalLink, Settings } from "lucide-react";
import { ShieldCheck, AlertTriangle, Link2, Wand2, Eye } from "lucide-react";
import { PaintbrushVertical } from "lucide-react";
import { Languages } from "lucide-react";
import { extractDescriptor, imageFromUrl } from "@/lib/face-api";
import { generatePersonaDescriptions } from "@/server/generate-descriptions.functions";
import { auditDescription } from "@/lib/description-audit";
import { verifyPersona } from "@/server/verify-persona.functions";
import { verifyPersonaImageFn } from "@/server/verify-persona-image.functions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { regenerateSourceUrl } from "@/server/regenerate-source-url.functions";
import { regeneratePersonaImage } from "@/server/regenerate-persona-image.functions";
import { adminTranslations, type AdminDict } from "@/lib/admin-i18n";
import type { Lang } from "@/lib/i18n";
import { translateName, translateCategory, translateDescription } from "@/lib/persona-i18n";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Personas" },
      { name: "description", content: "Manage personas across civilizations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const CIVILIZATIONS = ["Pharaoh", "Greek", "Persian", "Samurai", "Viking", "Chinese"] as const;
const ROLES = ["royalty", "warrior", "scholar", "priest", "artist", "craftsman", "explorer", "noble"] as const;
const GENDERS = ["male", "female", "any"] as const;

type Persona = {
  id: string;
  name: string;
  name_en?: string | null;
  description: string;
  category: string;
  gender: string;
  role: string;
  image_url: string;
  source_image_url: string | null;
  created_at: string;
  face_descriptor: number[] | null;
  duplicate_flag: Array<{ type: string; similar_to_id: string; similar_to_name: string; similarity: number; scanned_at: string }> | null;
  is_drawing: boolean;
};

type FormState = Omit<Persona, "id" | "created_at" | "face_descriptor" | "duplicate_flag" | "is_drawing"> & { id?: string; source_image_url: string | null };

function emptyForm(): FormState {
  return { name: "", name_en: "", description: "", category: "Pharaoh", gender: "any", role: "noble", image_url: "", source_image_url: null };
}

function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>("ar");
  const a = adminTranslations[lang];
  const toggleLang = () => {
    const next = lang === "ar" ? "en" : "ar";
    setLang(next);
    if (typeof window !== "undefined") window.localStorage.setItem("lang", next);
  };
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCiv, setActiveCiv] = useState<string>("Pharaoh");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [editing, setEditing] = useState<FormState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewing, setPreviewing] = useState<Persona | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genProgress, setGenProgress] = useState<string | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [imgGenBusy, setImgGenBusy] = useState(false);
  const [imgGenProgress, setImgGenProgress] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [regenBusy, setRegenBusy] = useState<string | null>(null);
  const [sourceRegenBusy, setSourceRegenBusy] = useState<string | null>(null);
  const [urlCheckBusy, setUrlCheckBusy] = useState(false);
  const [imgVerifyBusy, setImgVerifyBusy] = useState(false);
  const [imgVerifyResult, setImgVerifyResult] = useState<{
    verdict: string;
    score: number;
    issues: string[];
    details: Record<string, { ok: boolean; note: string }>;
    suggestion: string;
  } | null>(null);
  const [urlCheckResult, setUrlCheckResult] = useState<{
    total: number;
    ok: number;
    failed: number;
    failures: Array<{ name: string; url: string; status: number | null; error: string | null }>;
  } | null>(null);
  const [verifyResult, setVerifyResult] = useState<{
    verdict: string;
    reason: string;
    sources: string[];
    confidence: number;
    correctedName?: string;
    correctedDescription?: string;
  } | null>(null);
  const [minSimilarity, setMinSimilarity] = useState(30);
  const [similaritySaving, setSimilaritySaving] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("lang") as Lang | null : null;
    if (saved === "en" || saved === "ar") setLang(saved);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    loadPersonas();
    loadSettings();
  }, [user]);

  async function loadSettings() {
    const { data } = await supabase.from("site_settings").select("value").eq("key", "min_similarity").single();
    if (data) setMinSimilarity(Number(data.value));
  }

  async function saveMinSimilarity(val: number) {
    setSimilaritySaving(true);
    const { error } = await supabase.from("site_settings").upsert({ key: "min_similarity", value: String(val), updated_at: new Date().toISOString() });
    setSimilaritySaving(false);
    if (error) { flash(a.settingsErrorSave + error.message); return; }
    setMinSimilarity(val);
    flash(a.similarityUpdated(val));
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleCheckUrls() {
    setUrlCheckBusy(true);
    setUrlCheckResult(null);
    try {
      const res = await fetch("/api/public/hooks/check-source-urls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const data = await res.json();
      setUrlCheckResult(data);
      flash(a.urlCheckResult(data.ok, data.total, data.failed));
    } catch (err: any) {
      flash(a.urlCheckFailed + (err?.message || "Error"));
    } finally {
      setUrlCheckBusy(false);
    }
  }

  async function loadPersonas(silent = false) {
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from("personas")
      .select("id, name, name_en, description, category, gender, role, image_url, source_image_url, created_at, duplicate_flag, is_drawing")
      .order("category")
      .order("name")
      .limit(2000);
    if (error) flash(`Load error: ${error.message}`);
    setPersonas((data as any[])?.map(d => ({ ...d, face_descriptor: null, is_drawing: d.is_drawing ?? false })) as Persona[] ?? []);
    if (!silent) setLoading(false);
  }

  async function claimAdmin() {
    const { data, error } = await supabase.rpc("claim_first_admin");
    if (error) { flash(error.message); return; }
    if (data) { flash("Admin role granted. Reloading…"); setTimeout(() => location.reload(), 600); }
    else flash("An admin already exists. Ask them to grant you access.");
  }

  async function uploadImageToBucket(file: File): Promise<string | null> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `admin/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("personas").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
    if (error) { flash(`Upload error: ${error.message}`); return null; }
    const { data } = supabase.storage.from("personas").getPublicUrl(path);
    return data.publicUrl;
  }

  async function savePersona(form: FormState) {
    if (!form.name.trim() || !form.image_url.trim()) {
      flash("Name and image are required."); return;
    }
    setBusy(true);

    // --- Duplicate detection (skip for edits keeping same name/category) ---
    if (!form.id) {
      // --- Historical verification for new personas ---
      try {
        flash(a.verifying);
        const vResult = await verifyPersona({
          data: {
            name: form.name,
            category: form.category,
            role: form.role,
            gender: form.gender,
            description: form.description,
          },
        });

        // Log verification result to DB
        await supabase.from("persona_verification_log").insert({
          persona_name: form.name,
          category: form.category,
          role: form.role,
          gender: form.gender,
          verdict: vResult.verdict,
          reason: vResult.reason,
          sources: vResult.sources,
          confidence: vResult.confidence,
          verified_by: user?.id,
        });

        if (vResult.verdict === "rejected") {
          setBusy(false);
          setVerifyResult(vResult);
          flash(a.rejected(vResult.reason));
          return;
        }

        if (vResult.verdict === "uncertain") {
          setVerifyResult(vResult);
          flash(a.uncertain(vResult.reason));
        } else {
          setVerifyResult(vResult);
          flash(a.accepted(Math.round(vResult.confidence * 100)));
        }
      } catch (e) {
        flash(a.verifyFailed + (e as Error).message);
      }

      // 1) Exact name match within same category
      const nameMatch = personas.find(
        (p) => p.name.trim().toLowerCase() === form.name.trim().toLowerCase() && p.category === form.category
      );
      if (nameMatch) {
        setBusy(false);
        flash(a.duplicateName(nameMatch.name, form.category));
        return;
      }

      // 2) Face descriptor similarity check
      try {
        const img = await imageFromUrl(form.image_url);
        const newDescriptor = await extractDescriptor(img);
        if (newDescriptor && newDescriptor !== "multiple_faces") {
          // Fetch face descriptors on-demand for same category
          const { data: sameCatData } = await supabase
            .from("personas")
            .select("id, name, face_descriptor")
            .eq("category", form.category)
            .not("face_descriptor", "is", null);
          for (const existing of sameCatData ?? []) {
            const existingDesc = existing.face_descriptor as number[] | null;
            if (!existingDesc || existingDesc.length !== newDescriptor.descriptor.length) continue;
            const similarity = cosineSimilarity(newDescriptor.descriptor, existingDesc);
            if (similarity > 0.85) {
              setBusy(false);
              flash(a.similarFace((similarity * 100).toFixed(0), existing.name));
              return;
            }
          }
        }
      } catch (_) {
        // Face detection failed — skip face duplicate check, allow save
      }
    }

    if (form.id) {
      const { error } = await supabase
        .from("personas")
        .update({
          name: form.name, name_en: form.name_en || null, description: form.description, category: form.category,
          gender: form.gender, role: form.role, image_url: form.image_url, source_image_url: form.source_image_url,
        })
        .eq("id", form.id);
      if (error) { setBusy(false); flash(error.message); return; }
      flash(a.personaUpdated);
    } else {
      const { error } = await supabase.from("personas").insert({
        name: form.name, name_en: form.name_en || null, description: form.description, category: form.category,
        gender: form.gender, role: form.role, image_url: form.image_url, source_image_url: form.source_image_url,
        verification_status: verifyResult?.verdict === "accepted" ? "verified" : verifyResult?.verdict || "unverified",
      });
      if (error) { setBusy(false); flash(error.message); return; }
      flash(a.personaCreated);
    }
    setBusy(false);
    setDialogOpen(false);
    setEditing(null);
    setVerifyResult(null);
    loadPersonas(true);
  }

  async function deletePersona(p: Persona) {
    setBusy(true);
    const { error } = await supabase.from("personas").delete().eq("id", p.id);
    setBusy(false);
    if (error) { flash(error.message); return; }
    flash(a.personaDeleted);
    loadPersonas(true);
  }

  async function handleRegenerateImage(p: Persona) {
    setRegenBusy(p.id);
    try {
      flash(a.regenImageStart(p.name));
      const result = await regeneratePersonaImage({ data: { personaId: p.id } });
      flash(a.regenImageSuccess(result.persona_name));
      // Auto-extract face descriptor from the new image
      try {
        const img = await imageFromUrl(result.image_url + "?t=" + Date.now());
        const extraction = await extractDescriptor(img);
        if (extraction && extraction !== "multiple_faces") {
          const { data: { session } } = await supabase.auth.getSession();
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-face-descriptor`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              id: p.id,
              descriptor: extraction.descriptor,
            }),
          });
          flash(`✅ تم حساب وتخزين face_descriptor لـ "${result.persona_name}" تلقائياً`);
        } else {
          flash(`⚠️ لم يتم اكتشاف وجه في الصورة الجديدة لـ "${result.persona_name}"`);
        }
      } catch (fdErr) {
        console.error("Auto face descriptor extraction failed:", fdErr);
        flash(`⚠️ تم توليد الصورة لكن فشل استخراج face_descriptor: ${(fdErr as Error).message}`);
      }
      loadPersonas(true);
    } catch (e) {
      flash(a.regenImageFailed((e as Error).message));
    } finally {
      setRegenBusy(null);
    }
  }

  const handleGenerateImages = useCallback(async () => {
    setImgGenBusy(true);
    setImgGenProgress(a.generatingImages);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch("/api/public/hooks/generate-persona-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ batchSize: 5 }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        setToast(a.errorGeneric(result.error));
      } else {
        setToast(a.imagesGenerated(result.success, result.remaining));
        const { data } = await supabase.from("personas").select("*").order("created_at", { ascending: false });
        if (data) setPersonas(data as unknown as Persona[]);
      }
    } catch (e) {
      setToast(a.errorGeneric((e as Error).message));
    } finally {
      setImgGenBusy(false);
      setImgGenProgress(null);
    }
  }, []);

  const handleGenerateDescriptions = useCallback(async () => {
    setGenBusy(true);
    setGenProgress(a.generatingDescriptions);
    try {
      const result = await generatePersonaDescriptions();
      setGenProgress(null);
      flash(result.message + (result.errors?.length ? ` (${result.errors.length} errors)` : ""));
      if (result.updated > 0) loadPersonas(true);
    } catch (e) {
      setGenProgress(null);
      flash(`Error: ${(e as Error).message}`);
    } finally {
      setGenBusy(false);
    }
  }, []);

  const handleRunAudit = useCallback(async () => {
    setAuditBusy(true);
    let audited = 0;
    let issues = 0;
    try {
      for (const p of personas) {
        const result = auditDescription(p.description);
        const auditData = {
          score: result.score,
          valid: result.valid,
          issues: result.issues,
          audited_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from("personas")
          .update({ description_audit: auditData })
          .eq("id", p.id);
        if (!error) audited++;
        if (!result.valid) issues++;
      }
      flash(a.auditComplete(audited, issues));
      loadPersonas();
    } catch (e) {
      flash(`Audit error: ${(e as Error).message}`);
    } finally {
      setAuditBusy(false);
    }
  }, [personas]);



  const filtered = useMemo(() => {
    return personas
      .filter((p) => p.category === activeCiv)
      .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()))
      .filter((p) => roleFilter === "all" || p.role === roleFilter)
      .filter((p) => genderFilter === "all" || p.gender === genderFilter);
  }, [personas, activeCiv, search, roleFilter, genderFilter]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of CIVILIZATIONS) out[c] = 0;
    for (const p of personas) out[p.category] = (out[p.category] ?? 0) + 1;
    return out;
  }, [personas]);

  function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
  }

  if (authLoading) {
    return <main className="min-h-screen flex items-center justify-center">{a.loading}</main>;
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{a.adminAccessRequired}</CardTitle>
            <CardDescription>
              {a.noAdminRole}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={claimAdmin} className="w-full">{a.claimAdmin}</Button>
            <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/auth" }))}>
              Sign out
            </Button>
            <Link to="/" className="block text-center text-sm text-muted-foreground hover:text-foreground">{a.backToHome}</Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">{a.personaAdmin}</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">{a.home}</Link>
            <Button variant="ghost" size="sm" onClick={toggleLang} aria-label="Toggle language">
              <Languages className="h-4 w-4 mr-1" />
              {lang === "ar" ? "English" : "العربية"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/auth" }))}>
              <LogOut className="h-4 w-4 mr-1" /> {a.signOut}
            </Button>
          </div>
        </div>
      </header>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-card border border-border shadow-lg rounded-md px-4 py-2 text-sm">
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6">
        {urlCheckResult && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                {a.urlCheckResults}
              </CardTitle>
              <CardDescription>
                {a.urlCheckSummary(urlCheckResult.ok, urlCheckResult.total, urlCheckResult.failed)}
              </CardDescription>
            </CardHeader>
            {urlCheckResult.failures.length > 0 && (
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {urlCheckResult.failures.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs border-b border-border/50 pb-1">
                      <span className="font-medium">{f.name}</span>
                     <span className="text-destructive">{f.error || `HTTP ${f.status}`}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Settings Card */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              {a.matchSettings}
            </CardTitle>
            <CardDescription>{a.matchSettingsDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Label className="text-sm whitespace-nowrap">{a.matchThreshold}</Label>
              <Slider
                value={[minSimilarity]}
                onValueChange={([v]) => setMinSimilarity(v)}
                min={10}
                max={90}
                step={5}
                className="flex-1"
              />
              <span className="text-sm font-bold min-w-[3rem] text-center">{minSimilarity}%</span>
              <Button
                size="sm"
                variant="outline"
                disabled={similaritySaving}
                onClick={() => saveMinSimilarity(minSimilarity)}
              >
                {similaritySaving ? a.saving : a.save}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeCiv} onValueChange={setActiveCiv}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <TabsList className="flex-wrap h-auto">
              {CIVILIZATIONS.map((c) => (
                <TabsTrigger key={c} value={c} className="text-xs md:text-sm">
                  {c} <span className="ml-1.5 text-muted-foreground">({counts[c] ?? 0})</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <Badge variant="secondary" className="self-start md:self-center text-xs">
              {a.totalPersonas(personas.length)}
            </Badge>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateDescriptions}
                disabled={genBusy}
                title={lang === "ar" ? "توليد أوصاف تاريخية غنية بالذكاء الاصطناعي" : "Generate rich historical descriptions with AI"}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                {genBusy ? (genProgress ?? a.generating) : a.generateDescriptions}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateImages}
                disabled={imgGenBusy}
                title={lang === "ar" ? "توليد صور بالذكاء الاصطناعي للشخصيات بدون صور" : "Generate AI images for personas without images"}
              >
                <ImageIcon className="h-4 w-4 mr-1" />
                {imgGenBusy ? (imgGenProgress ?? a.generating) : a.generateImages}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunAudit}
                disabled={auditBusy || personas.length === 0}
                title={lang === "ar" ? "إعادة تدقيق جميع الأوصاف" : "Re-audit all descriptions"}
              >
                <ShieldCheck className="h-4 w-4 mr-1" />
                {auditBusy ? a.auditing : a.auditDescriptions}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckUrls}
                disabled={urlCheckBusy}
                title={lang === "ar" ? "فحص صلاحية روابط المصدر التاريخي" : "Check validity of historical source URLs"}
              >
                <Link2 className="h-4 w-4 mr-1" />
                {urlCheckBusy ? a.checking : a.checkUrls}
              </Button>

              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-28 h-9 text-xs">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{a.allRoles}</SelectItem>
                  {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger className="w-28 h-9 text-xs">
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{a.allGenders}</SelectItem>
                  {GENDERS.map((g) => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder={a.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full md:w-56"
              />
              <Button onClick={() => { setEditing({ ...emptyForm(), category: activeCiv }); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> {a.new}
              </Button>
            </div>
          </div>

          {CIVILIZATIONS.map((c) => (
            <TabsContent key={c} value={c} className="mt-0">
              {!loading && (
                <p className="text-xs text-muted-foreground mb-2">
                  {a.showing(filtered.length, counts[activeCiv] ?? 0)}
                </p>
              )}
              {loading ? (
                <p className="text-muted-foreground py-12 text-center">{a.loading}</p>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground py-12 text-center">{lang === "ar" ? `لا توجد شخصيات في ${c} بعد.` : `No personas in ${c} yet.`}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filtered.map((p, idx) => (
                    <Card key={p.id} className="overflow-hidden">
                      <PersonaCardImage persona={p} index={idx + 1} onPreview={() => setPreviewing(p)} a={a} />
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{p.name}</p>
                            <p className="font-medium truncate">{translateName(p.name, lang)}</p>
                            <p className="text-xs text-muted-foreground capitalize">{lang === "en" ? p.role : p.role} · {p.gender}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                              face
                            </Badge>
                            {p.is_drawing && (
                              <Badge variant="outline" className="text-[10px] shrink-0 gap-0.5 border-orange-500 text-orange-500">
                                <PaintbrushVertical className="h-2.5 w-2.5" />
                                {a.drawing}
                              </Badge>
                            )}
                            {p.duplicate_flag && p.duplicate_flag.length > 0 && (
                              <Badge variant="destructive" className="text-[10px] shrink-0 gap-0.5">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {a.duplicate(p.duplicate_flag.length)}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {p.duplicate_flag && p.duplicate_flag.length > 0 && (
                          <div className="text-[10px] text-destructive space-y-0.5 bg-destructive/10 rounded p-1.5">
                            {p.duplicate_flag.map((f, i) => (
                              <p key={i}>
                                {f.type === "name" ? "📝" : "👤"} {a.similarTo(f.similar_to_name, Math.round(f.similarity * 100))}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="flex-1"
                            onClick={() => { setEditing({ id: p.id, name: p.name, name_en: p.name_en || "", description: p.description, category: p.category, gender: p.gender, role: p.role, image_url: p.image_url, source_image_url: p.source_image_url }); setDialogOpen(true); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {p.source_image_url && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="outline" className="flex-1" asChild>
                                    <a href={p.source_image_url} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{a.openSource}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" className="flex-1"
                                  disabled={sourceRegenBusy === p.id}
                                  onClick={async () => {
                                    setSourceRegenBusy(p.id);
                                    try {
                                      flash(a.updatingSource(p.name));
                                      const result = await regenerateSourceUrl({
                                        data: {
                                          name: p.name_en || p.name,
                                          role: p.role,
                                          category: p.category,
                                          description: p.description,
                                          personaId: p.id,
                                        },
                                      });
                                      setPersonas(prev => prev.map(x => x.id === p.id ? { ...x, source_image_url: result.url } : x));
                                      flash(a.sourceUpdated(p.name));
                                    } catch (e) {
                                      flash(a.errorGeneric((e as Error).message));
                                    } finally {
                                      setSourceRegenBusy(null);
                                    }
                                  }}>
                                  {sourceRegenBusy === p.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{a.regenSourceTooltip}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" className="flex-1" onClick={() => handleRegenerateImage(p)} disabled={regenBusy === p.id}>
                                  {regenBusy === p.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{a.regenImageTooltip}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant={p.is_drawing ? "default" : "outline"} className={`flex-1 ${p.is_drawing ? "bg-orange-600 hover:bg-orange-700" : ""}`}
                                  onClick={async () => {
                                    const newVal = !p.is_drawing;
                                    const { error } = await supabase.from("personas").update({ is_drawing: newVal }).eq("id", p.id);
                                    if (error) { flash(error.message); return; }
                                    setPersonas(prev => prev.map(x => x.id === p.id ? { ...x, is_drawing: newVal } : x));
                                    flash(newVal ? a.markedDrawing(p.name) : a.unmarkedDrawing(p.name));
                                  }}>
                                  <PaintbrushVertical className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{p.is_drawing ? a.isNotDrawing : a.markAsDrawing}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" className="flex-1"><Trash2 className="h-3 w-3" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{a.deleteTitle(translateName(p.name, lang))}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {a.deleteDesc}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{a.cancel}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deletePersona(p)}>{a.delete}</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Edit / Create dialog */}
      <PersonaDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditing(null); setVerifyResult(null); } }}
        form={editing}
        setForm={setEditing}
        onSave={savePersona}
        onUpload={uploadImageToBucket}
        busy={busy}
        a={a}
        onVerify={async (f) => {
          setVerifyBusy(true);
          setVerifyResult(null);
          try {
            const result = await verifyPersona({
              data: { name: f.name, category: f.category, role: f.role, gender: f.gender, description: f.description },
            });
            setVerifyResult(result);
            await supabase.from("persona_verification_log").insert({
              persona_name: f.name, category: f.category, role: f.role, gender: f.gender,
              verdict: result.verdict, reason: result.reason, sources: result.sources,
              confidence: result.confidence, verified_by: user?.id,
            });
          } catch (e) {
            flash(a.verifyError((e as Error).message));
          } finally {
            setVerifyBusy(false);
          }
        }}
        verifyBusy={verifyBusy}
        verifyResult={verifyResult}
      />

      {/* Preview / similarity dialog */}
      <PreviewDialog
        persona={previewing}
        onClose={() => setPreviewing(null)}
        a={a}
        lang={lang}
        onVerifyImage={async (p: Persona) => {
          setImgVerifyBusy(true);
          setImgVerifyResult(null);
          try {
            const result = await verifyPersonaImageFn({
              data: {
                name: p.name,
                role: p.role,
                gender: p.gender,
                description: p.description,
                imageUrl: p.image_url,
              },
            });
            setImgVerifyResult(result);
            // Log to verification table
            await supabase.from("persona_verification_log").insert({
              persona_name: p.name,
              category: p.category,
              role: p.role,
              gender: p.gender,
              verdict: result.verdict,
              reason: a.imageAuditReason(result.score, result.issues.join(lang === "ar" ? "، " : ", ")),
              sources: Object.entries(result.details).map(([k, v]) => `${k}: ${v.note}`),
              confidence: result.score / 100,
              verified_by: user?.id,
            });
            // Update verification_status on persona
            if (result.verdict === "approved") {
              await supabase.from("personas").update({ verification_status: "image_verified" }).eq("id", p.id);
            } else if (result.verdict === "rejected") {
              await supabase.from("personas").update({ verification_status: "image_rejected" }).eq("id", p.id);
            }
          } catch (e) {
            flash(a.imageAuditError((e as Error).message));
          } finally {
            setImgVerifyBusy(false);
          }
        }}
        imgVerifyBusy={imgVerifyBusy}
        imgVerifyResult={imgVerifyResult}
      />
    </main>
  );
}

function PersonaDialog({
  open, onOpenChange, form, setForm, onSave, onUpload, busy, a, onVerify, verifyBusy, verifyResult,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: FormState | null;
  setForm: (f: FormState | null) => void;
  onSave: (f: FormState) => void;
  onUpload: (file: File) => Promise<string | null>;
  busy: boolean;
  a: AdminDict;
  onVerify: (f: FormState) => void;
  verifyBusy: boolean;
  verifyResult: { verdict: string; reason: string; sources: string[]; confidence: number; correctedName?: string; correctedDescription?: string } | null;
}) {
  if (!form) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? a.editPersona : a.newPersona}</DialogTitle>
          <DialogDescription>{a.dialogDesc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{a.name}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Name (EN)</Label>
              <Input value={form.name_en || ""} onChange={(e) => setForm({ ...form, name_en: e.target.value })} placeholder="English name for Wikipedia search" />
            </div>
            <div className="space-y-1">
              <Label>{a.civilization}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CIVILIZATIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{a.role}</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{a.gender}</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>{a.description}</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>{a.image}</Label>
            <Tabs defaultValue="url">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url">{a.url}</TabsTrigger>
                <TabsTrigger value="upload">{a.upload}</TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="space-y-2 pt-2">
                <Input
                  placeholder="https://…/image.jpg"
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                />
              </TabsContent>
              <TabsContent value="upload" className="space-y-2 pt-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const url = await onUpload(f);
                    if (url) setForm({ ...form, image_url: url });
                  }}
                />
              </TabsContent>
            </Tabs>
            {form.image_url && (
              <img src={form.image_url} alt="preview" className="mt-2 w-32 h-32 object-cover rounded-md border border-border" />
            )}
          </div>

          <div className="space-y-2">
            <Label>{a.historicalSource}</Label>
            <Input
              placeholder="https://…/source-image.jpg"
              value={form.source_image_url ?? ""}
              onChange={(e) => setForm({ ...form, source_image_url: e.target.value || null })}
            />
            {form.source_image_url && (
              <img src={form.source_image_url} alt="source preview" className="mt-2 w-32 h-32 object-cover rounded-md border border-border" />
            )}
          </div>
        </div>
        <DialogFooter>
          {!form.id && (
            <Button
              variant="outline"
              onClick={() => onVerify(form)}
              disabled={verifyBusy || busy || !form.name.trim()}
              className="mr-auto"
            >
              <ShieldCheck className="h-4 w-4 mr-1" />
              {verifyBusy ? a.verifyingShort : a.verifyHistorically}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{a.cancel}</Button>
          <Button onClick={() => onSave(form)} disabled={busy}>{busy ? a.savingShort : a.save}</Button>
        </DialogFooter>
        {verifyResult && (
          <div className={`mt-3 p-3 rounded-md text-sm border ${
            verifyResult.verdict === "accepted" ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" :
            verifyResult.verdict === "rejected" ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800" :
            "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800"
          }`}>
            <div className="flex items-center gap-2 font-semibold mb-1">
              {verifyResult.verdict === "accepted" ? a.acceptedShort :
               verifyResult.verdict === "rejected" ? a.rejectedShort : a.uncertainShort}
              <span className="text-xs font-normal text-muted-foreground">
                {a.confidence(Math.round(verifyResult.confidence * 100))}
              </span>
            </div>
            <p className="text-xs leading-relaxed">{verifyResult.reason}</p>
            {verifyResult.sources.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold">{a.sources}</p>
                <ul className="text-xs list-disc list-inside">
                  {verifyResult.sources.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {verifyResult.correctedName && (
              <p className="text-xs mt-1">{a.suggestedName(verifyResult.correctedName)}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({
  persona, onClose, a, lang, onVerifyImage, imgVerifyBusy, imgVerifyResult,
}: {
  persona: Persona | null;
  onClose: () => void;
  a: AdminDict;
  lang: Lang;
  onVerifyImage: (p: Persona) => void;
  imgVerifyBusy: boolean;
  imgVerifyResult: {
    verdict: string;
    score: number;
    issues: string[];
    details: Record<string, { ok: boolean; note: string }>;
    suggestion: string;
  } | null;
}) {
  if (!persona) return null;

  const detailLabels: Record<string, string> = {
    skinTone: a.skinTone,
    facialFeatures: a.facialFeatures,
    headdressAttire: a.headdressAttire,
    historicalAccuracy: a.historicalAccuracy,
    overallQuality: a.overallQuality,
  };

  return (
    <Dialog open={!!persona} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{translateName(persona.name, lang)}</DialogTitle>
          <DialogDescription>{translateCategory(persona.category, lang)} · {persona.role} · {persona.gender}</DialogDescription>
        </DialogHeader>
        <div>
          <img src={persona.image_url} alt={translateName(persona.name, lang)} className="w-full rounded-md border border-border" />
          {persona.source_image_url && (
            <div className="mt-3">
              <p className="text-xs font-semibold mb-1 flex items-center gap-1"><BookOpen className="h-3 w-3" /> {a.historicalSourceLabel}</p>
              <img src={persona.source_image_url} alt={a.sourceOf(translateName(persona.name, lang))} className="w-full rounded-md border border-border" />
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2 break-all">
            <strong>Face Descriptor:</strong> — check DB —
          </p>
          {persona.description && <p className="text-sm mt-2">{translateDescription(persona.description, lang, persona.role, persona.gender)}</p>}

          {/* Image Verification */}
          <div className="mt-4 border-t pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onVerifyImage(persona)}
              disabled={imgVerifyBusy}
              className="w-full gap-2"
            >
              <Eye className="h-4 w-4" />
              {imgVerifyBusy ? a.verifyingImage : a.verifyImageBtn}
            </Button>

            {imgVerifyResult && (
              <div className={`mt-3 rounded-lg border p-3 text-sm ${
                imgVerifyResult.verdict === "approved"
                  ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                  : imgVerifyResult.verdict === "rejected"
                  ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
                  : "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">
                    {imgVerifyResult.verdict === "approved" ? a.approved :
                     imgVerifyResult.verdict === "rejected" ? a.rejectedImg : a.needsReview}
                  </span>
                  <Badge variant="secondary">{imgVerifyResult.score}/100</Badge>
                </div>

                {/* Detail checks */}
                <div className="space-y-1 mb-2">
                  {Object.entries(imgVerifyResult.details).map(([key, val]) => (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      <span>{val.ok ? "✅" : "❌"}</span>
                      <span className="font-medium min-w-[80px]">{detailLabels[key] || key}:</span>
                      <span className="text-muted-foreground">{val.note}</span>
                    </div>
                  ))}
                </div>

                {imgVerifyResult.issues.length > 0 && (
                  <div className="text-xs mt-2">
                    <p className="font-semibold text-destructive">{a.issues}</p>
                    <ul className="list-disc list-inside">
                      {imgVerifyResult.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                    </ul>
                  </div>
                )}

                {imgVerifyResult.suggestion && (
                  <p className="text-xs mt-2 text-muted-foreground">💡 {imgVerifyResult.suggestion}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PersonaCardImage({ persona, index, onPreview, a }: { persona: Persona; index: number; onPreview: () => void; a: AdminDict }) {
  const [showSource, setShowSource] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);

  const hasSource = !!persona.source_image_url;

  function handlePointerDown(e: React.PointerEvent) {
    if (!hasSource) return;
    setDragging(true);
    startXRef.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - startXRef.current;
    // Only allow dragging to the right (positive direction)
    setDragX(Math.max(0, dx));
  }

  function handlePointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dragX > 80) {
      setShowSource(true);
    }
    setDragX(0);
  }

  if (showSource && persona.source_image_url) {
    return (
      <button
        type="button"
        onClick={() => setShowSource(false)}
        className="relative block w-full aspect-square overflow-hidden bg-muted"
      >
        <span className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow">{index}</span>
        <img
          src={persona.source_image_url}
           alt={persona.name}
          className="w-full h-full object-cover animate-fade-in"
          loading="lazy"
        onError={(e) => {
            const t = e.currentTarget;
            if (!t.dataset.fallback) {
              t.dataset.fallback = "1";
              t.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(persona.name)}&size=400&background=78350f&color=fbbf24&format=svg`;
            }
          }}
        />
        <div className="absolute bottom-2 left-2 right-2 bg-background/80 backdrop-blur rounded-md px-2 py-1 text-[10px] text-center flex items-center justify-center gap-1">
          <BookOpen className="h-3 w-3" />
          {a.historicalSourceNav}
        </div>
      </button>
    );
  }

  return (
    <div className="relative block w-full aspect-square overflow-hidden bg-muted">
      <span className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow">{index}</span>
      <button
        type="button"
        onClick={onPreview}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="block w-full h-full touch-pan-y"
      >
        <img
          src={persona.image_url}
          alt={persona.name}
          className="w-full h-full object-cover hover:scale-105 transition"
          loading="lazy"
          onError={(e) => {
            const t = e.currentTarget;
            if (!t.dataset.fallback) {
              t.dataset.fallback = "1";
              t.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(persona.name)}&size=400&background=78350f&color=fbbf24&format=svg`;
            }
          }}
          style={dragX > 0 ? { transform: `translateX(${dragX}px)`, opacity: 1 - dragX / 200 } : undefined}
        />
      </button>
      {hasSource && (
        <div className="absolute bottom-2 right-2 bg-background/70 backdrop-blur rounded-full p-1.5 pointer-events-none">
          <ChevronRight className="h-3 w-3 text-foreground animate-[pulse_2s_ease-in-out_infinite]" />
        </div>
      )}
    </div>
  );
}