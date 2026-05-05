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
import { Pencil, Trash2, Plus, RefreshCw, LogOut, Sparkles, ImageIcon, BookOpen, ChevronRight, ExternalLink } from "lucide-react";
import { ShieldCheck, AlertTriangle, Link2, Wand2 } from "lucide-react";
import { extractDescriptor, imageFromUrl } from "@/lib/face-api";
import { generatePersonaDescriptions } from "@/server/generate-descriptions.functions";
import { auditDescription } from "@/lib/description-audit";
import { verifyPersona } from "@/server/verify-persona.functions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  description: string;
  category: string;
  gender: string;
  role: string;
  image_url: string;
  source_image_url: string | null;
  created_at: string;
  face_descriptor: number[] | null;
  duplicate_flag: Array<{ type: string; similar_to_id: string; similar_to_name: string; similarity: number; scanned_at: string }> | null;
};

type FormState = Omit<Persona, "id" | "created_at" | "face_descriptor" | "duplicate_flag"> & { id?: string; source_image_url: string | null };

function emptyForm(): FormState {
  return { name: "", description: "", category: "Pharaoh", gender: "any", role: "noble", image_url: "", source_image_url: null };
}

function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
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
  const [urlCheckBusy, setUrlCheckBusy] = useState(false);
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

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    loadPersonas();
  }, [user]);

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
      flash(`فحص الروابط: ${data.ok}/${data.total} صالحة، ${data.failed} معطلة`);
    } catch (err: any) {
      flash("فشل فحص الروابط: " + (err?.message || "خطأ"));
    } finally {
      setUrlCheckBusy(false);
    }
  }

  async function loadPersonas() {
    setLoading(true);
    const { data, error } = await supabase
      .from("personas")
      .select("*")
      .order("category")
      .order("name")
      .limit(2000);
    if (error) flash(`Load error: ${error.message}`);
    setPersonas((data as Persona[]) ?? []);
    setLoading(false);
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
        flash("🔍 جارٍ التحقق التاريخي…");
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
          flash(`❌ مرفوضة: ${vResult.reason}`);
          return;
        }

        if (vResult.verdict === "uncertain") {
          setVerifyResult(vResult);
          flash(`⚠️ غير مؤكدة: ${vResult.reason}`);
        } else {
          setVerifyResult(vResult);
          flash(`✅ مقبولة تاريخياً (ثقة ${Math.round(vResult.confidence * 100)}%)`);
        }
      } catch (e) {
        flash(`⚠️ تعذر التحقق التاريخي: ${(e as Error).message}`);
      }

      // 1) Exact name match within same category
      const nameMatch = personas.find(
        (p) => p.name.trim().toLowerCase() === form.name.trim().toLowerCase() && p.category === form.category
      );
      if (nameMatch) {
        setBusy(false);
        flash(`⚠️ شخصية بنفس الاسم "${nameMatch.name}" موجودة بالفعل في ${form.category}`);
        return;
      }

      // 2) Face descriptor similarity check
      try {
        const img = await imageFromUrl(form.image_url);
        const newDescriptor = await extractDescriptor(img);
        if (newDescriptor) {
          const sameCatPersonas = personas.filter(
            (p) => p.category === form.category && p.face_descriptor
          );
          for (const existing of sameCatPersonas) {
            const existingDesc = existing.face_descriptor;
            if (!existingDesc || existingDesc.length !== newDescriptor.descriptor.length) continue;
            const similarity = cosineSimilarity(newDescriptor.descriptor, existingDesc);
            if (similarity > 0.85) {
              setBusy(false);
              flash(`⚠️ وجه مشابه جداً (${(similarity * 100).toFixed(0)}%) للشخصية "${existing.name}" — يُحتمل تكرار`);
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
          name: form.name, description: form.description, category: form.category,
          gender: form.gender, role: form.role, image_url: form.image_url, source_image_url: form.source_image_url,
        })
        .eq("id", form.id);
      if (error) { setBusy(false); flash(error.message); return; }
      flash("Persona updated.");
    } else {
      const { error } = await supabase.from("personas").insert({
        name: form.name, description: form.description, category: form.category,
        gender: form.gender, role: form.role, image_url: form.image_url, source_image_url: form.source_image_url,
        verification_status: verifyResult?.verdict === "accepted" ? "verified" : verifyResult?.verdict || "unverified",
      });
      if (error) { setBusy(false); flash(error.message); return; }
      flash("Persona created.");
    }
    setBusy(false);
    setDialogOpen(false);
    setEditing(null);
    setVerifyResult(null);
    loadPersonas();
  }

  async function deletePersona(p: Persona) {
    setBusy(true);
    const { error } = await supabase.from("personas").delete().eq("id", p.id);
    setBusy(false);
    if (error) { flash(error.message); return; }
    flash("Persona deleted.");
    loadPersonas();
  }

  async function regenerateImage(p: Persona) {
    setRegenBusy(p.id);
    try {
      flash(`🎨 جارٍ إعادة توليد صورة "${p.name}" بشكل واقعي…`);
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch("/api/public/hooks/regenerate-persona-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ personaId: p.id }),
      });
      const result = await resp.json();
      if (!resp.ok || result.error) {
        flash(`❌ فشل التوليد: ${result.error}`);
      } else {
        flash(`✅ تم إعادة توليد صورة "${result.persona_name}" بنجاح`);
        loadPersonas();
      }
    } catch (e) {
      flash(`❌ خطأ: ${(e as Error).message}`);
    } finally {
      setRegenBusy(null);
    }
  }

  const handleGenerateImages = useCallback(async () => {
    setImgGenBusy(true);
    setImgGenProgress("جارٍ توليد الصور… (دفعة 5)");
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
        setToast(`❌ خطأ: ${result.error}`);
      } else {
        setToast(`✅ تم توليد ${result.success} صورة (متبقي: ${result.remaining})`);
        const { data } = await supabase.from("personas").select("*").order("created_at", { ascending: false });
        if (data) setPersonas(data as unknown as Persona[]);
      }
    } catch (e) {
      setToast(`❌ خطأ: ${(e as Error).message}`);
    } finally {
      setImgGenBusy(false);
      setImgGenProgress(null);
    }
  }, []);

  const handleGenerateDescriptions = useCallback(async () => {
    setGenBusy(true);
    setGenProgress("جارٍ توليد الأوصاف التاريخية…");
    try {
      const result = await generatePersonaDescriptions();
      setGenProgress(null);
      flash(result.message + (result.errors?.length ? ` (${result.errors.length} errors)` : ""));
      if (result.updated > 0) loadPersonas();
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
      flash(`تم تدقيق ${audited} شخصية — ${issues} بها مشاكل`);
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
    return <main className="min-h-screen flex items-center justify-center">Loading…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              Your account doesn't have the admin role yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={claimAdmin} className="w-full">Claim admin role (first user only)</Button>
            <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/auth" }))}>
              Sign out
            </Button>
            <Link to="/" className="block text-center text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
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
            <h1 className="text-xl font-bold">Persona Admin</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Home</Link>
            <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/auth" }))}>
              <LogOut className="h-4 w-4 mr-1" /> Sign out
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
                نتائج فحص الروابط
              </CardTitle>
              <CardDescription>
                {urlCheckResult.ok}/{urlCheckResult.total} رابط صالح — {urlCheckResult.failed} معطل
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
              إجمالي: {personas.length} شخصية
            </Badge>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateDescriptions}
                disabled={genBusy}
                title="توليد أوصاف تاريخية غنية بالذكاء الاصطناعي"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                {genBusy ? (genProgress ?? "جارٍ…") : "توليد الأوصاف"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateImages}
                disabled={imgGenBusy}
                title="توليد صور بالذكاء الاصطناعي للشخصيات بدون صور"
              >
                <ImageIcon className="h-4 w-4 mr-1" />
                {imgGenBusy ? (imgGenProgress ?? "جارٍ…") : "توليد الصور"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunAudit}
                disabled={auditBusy || personas.length === 0}
                title="إعادة تدقيق جميع الأوصاف"
              >
                <ShieldCheck className="h-4 w-4 mr-1" />
                {auditBusy ? "جارٍ التدقيق…" : "تدقيق الأوصاف"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckUrls}
                disabled={urlCheckBusy}
                title="فحص صلاحية روابط المصدر التاريخي"
              >
                <Link2 className="h-4 w-4 mr-1" />
                {urlCheckBusy ? "جارٍ الفحص…" : "فحص الروابط"}
              </Button>

              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-28 h-9 text-xs">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger className="w-28 h-9 text-xs">
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All genders</SelectItem>
                  {GENDERS.map((g) => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder="Search name / description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full md:w-56"
              />
              <Button onClick={() => { setEditing({ ...emptyForm(), category: activeCiv }); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> New
              </Button>
            </div>
          </div>

          {CIVILIZATIONS.map((c) => (
            <TabsContent key={c} value={c} className="mt-0">
              {!loading && (
                <p className="text-xs text-muted-foreground mb-2">
                  عرض {filtered.length} من {counts[activeCiv] ?? 0} شخصية
                </p>
              )}
              {loading ? (
                <p className="text-muted-foreground py-12 text-center">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground py-12 text-center">No personas in {c} yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filtered.map((p, idx) => (
                    <Card key={p.id} className="overflow-hidden">
                      <PersonaCardImage persona={p} index={idx + 1} onPreview={() => setPreviewing(p)} />
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{p.role} · {p.gender}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant={p.face_descriptor ? "default" : "secondary"} className="text-[10px] shrink-0">
                              {p.face_descriptor ? "has face" : "no face"}
                            </Badge>
                            {p.duplicate_flag && p.duplicate_flag.length > 0 && (
                              <Badge variant="destructive" className="text-[10px] shrink-0 gap-0.5">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                تكرار ({p.duplicate_flag.length})
                              </Badge>
                            )}
                          </div>
                        </div>
                        {p.duplicate_flag && p.duplicate_flag.length > 0 && (
                          <div className="text-[10px] text-destructive space-y-0.5 bg-destructive/10 rounded p-1.5">
                            {p.duplicate_flag.map((f, i) => (
                              <p key={i}>
                                {f.type === "name" ? "📝" : "👤"} مشابه لـ <strong>{f.similar_to_name}</strong> ({Math.round(f.similarity * 100)}%)
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="flex-1"
                            onClick={() => { setEditing({ id: p.id, name: p.name, description: p.description, category: p.category, gender: p.gender, role: p.role, image_url: p.image_url, source_image_url: p.source_image_url }); setDialogOpen(true); }}>
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
                                  <p>فتح المصدر التاريخي (ويكيبيديا) في تبويب جديد</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" className="flex-1" onClick={() => regenerateImage(p)} disabled={regenBusy === p.id}>
                                  {regenBusy === p.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>إعادة توليد الصورة بشكل واقعي من المصادر التاريخية</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline" className="flex-1"><Trash2 className="h-3 w-3" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {p.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the persona from the database and from Luxand if enrolled. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deletePersona(p)}>Delete</AlertDialogAction>
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
            flash(`خطأ في التحقق: ${(e as Error).message}`);
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
      />
    </main>
  );
}

function PersonaDialog({
  open, onOpenChange, form, setForm, onSave, onUpload, busy, onVerify, verifyBusy, verifyResult,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: FormState | null;
  setForm: (f: FormState | null) => void;
  onSave: (f: FormState) => void;
  onUpload: (file: File) => Promise<string | null>;
  busy: boolean;
  onVerify: (f: FormState) => void;
  verifyBusy: boolean;
  verifyResult: { verdict: string; reason: string; sources: string[]; confidence: number; correctedName?: string; correctedDescription?: string } | null;
}) {
  if (!form) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit persona" : "New persona"}</DialogTitle>
          <DialogDescription>Fill in the details and provide an image (upload or URL).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Civilization</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CIVILIZATIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>Image</Label>
            <Tabs defaultValue="url">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="upload">Upload</TabsTrigger>
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
            <Label>المصدر التاريخي (نقش / تمثال / صورة أثرية)</Label>
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
              {verifyBusy ? "جارٍ التحقق…" : "تحقق تاريخياً"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
        {verifyResult && (
          <div className={`mt-3 p-3 rounded-md text-sm border ${
            verifyResult.verdict === "accepted" ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" :
            verifyResult.verdict === "rejected" ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800" :
            "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800"
          }`}>
            <div className="flex items-center gap-2 font-semibold mb-1">
              {verifyResult.verdict === "accepted" ? "✅ مقبولة" :
               verifyResult.verdict === "rejected" ? "❌ مرفوضة" : "⚠️ غير مؤكدة"}
              <span className="text-xs font-normal text-muted-foreground">
                (ثقة {Math.round(verifyResult.confidence * 100)}%)
              </span>
            </div>
            <p className="text-xs leading-relaxed">{verifyResult.reason}</p>
            {verifyResult.sources.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold">المصادر:</p>
                <ul className="text-xs list-disc list-inside">
                  {verifyResult.sources.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {verifyResult.correctedName && (
              <p className="text-xs mt-1">📝 الاسم المقترح: <strong>{verifyResult.correctedName}</strong></p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({
  persona, onClose,
}: { persona: Persona | null; onClose: () => void }) {
  if (!persona) return null;

  return (
    <Dialog open={!!persona} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{persona.name}</DialogTitle>
          <DialogDescription>{persona.category} · {persona.role} · {persona.gender}</DialogDescription>
        </DialogHeader>
        <div>
          <img src={persona.image_url} alt={persona.name} className="w-full rounded-md border border-border" />
          {persona.source_image_url && (
            <div className="mt-3">
              <p className="text-xs font-semibold mb-1 flex items-center gap-1"><BookOpen className="h-3 w-3" /> المصدر التاريخي:</p>
              <img src={persona.source_image_url} alt={`مصدر ${persona.name}`} className="w-full rounded-md border border-border" />
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2 break-all">
            <strong>Face Descriptor:</strong> {persona.face_descriptor ? "✅ stored" : "— not computed —"}
          </p>
          {persona.description && <p className="text-sm mt-2">{persona.description}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PersonaCardImage({ persona, index, onPreview }: { persona: Persona; index: number; onPreview: () => void }) {
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
        <img
          src={persona.source_image_url}
          alt={`مصدر ${persona.name}`}
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
          المصدر التاريخي — اضغط للعودة
        </div>
      </button>
    );
  }

  return (
    <div className="relative block w-full aspect-square overflow-hidden bg-muted">
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