import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
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
import { Pencil, Trash2, Plus, RefreshCw, LogOut, Sparkles } from "lucide-react";
import { ShieldCheck } from "lucide-react";
import { extractDescriptor, imageFromUrl } from "@/lib/face-api";
import { generatePersonaDescriptions } from "@/server/generate-descriptions.functions";
import { auditDescription } from "@/lib/description-audit";

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
  luxand_uuid: string | null;
  created_at: string;
};

type FormState = Omit<Persona, "id" | "created_at" | "luxand_uuid"> & { id?: string };

function emptyForm(): FormState {
  return { name: "", description: "", category: "Pharaoh", gender: "any", role: "noble", image_url: "" };
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
            (p) => p.category === form.category && (p as any).face_descriptor
          );
          for (const existing of sameCatPersonas) {
            const existingDesc = (existing as any).face_descriptor as number[] | null;
            if (!existingDesc || existingDesc.length !== newDescriptor.length) continue;
            const similarity = cosineSimilarity(newDescriptor, existingDesc);
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
          gender: form.gender, role: form.role, image_url: form.image_url,
        })
        .eq("id", form.id);
      if (error) { setBusy(false); flash(error.message); return; }
      flash("Persona updated.");
    } else {
      const { error } = await supabase.from("personas").insert({
        name: form.name, description: form.description, category: form.category,
        gender: form.gender, role: form.role, image_url: form.image_url,
      });
      if (error) { setBusy(false); flash(error.message); return; }
      flash("Persona created.");
    }
    setBusy(false);
    setDialogOpen(false);
    setEditing(null);
    loadPersonas();
  }

  async function deletePersona(p: Persona) {
    setBusy(true);
    if (p.luxand_uuid) {
      // Best-effort delete from Luxand via edge function
      try {
        await supabase.functions.invoke("persona-admin", {
          body: { action: "luxand_delete", luxand_uuid: p.luxand_uuid },
        });
      } catch (_) { /* ignore */ }
    }
    const { error } = await supabase.from("personas").delete().eq("id", p.id);
    setBusy(false);
    if (error) { flash(error.message); return; }
    flash("Persona deleted.");
    loadPersonas();
  }

  async function reenroll(p: Persona) {
    setBusy(true);
    try {
      const img = await imageFromUrl(p.image_url);
      const descriptor = await extractDescriptor(img);
      if (!descriptor) {
        setBusy(false);
        flash("No face detected in this portrait.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("save-face-descriptor", {
        body: { id: p.id, descriptor },
      });
      setBusy(false);
      if (error || (data as { error?: string })?.error) {
        flash(error?.message || (data as { error?: string }).error || "Save failed");
        return;
      }
      flash("Face descriptor saved.");
      loadPersonas();
    } catch (e) {
      setBusy(false);
      flash((e as Error).message || "Re-enroll failed");
    }
  }

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
        <Tabs value={activeCiv} onValueChange={setActiveCiv}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <TabsList className="flex-wrap h-auto">
              {CIVILIZATIONS.map((c) => (
                <TabsTrigger key={c} value={c} className="text-xs md:text-sm">
                  {c} <span className="ml-1.5 text-muted-foreground">({counts[c] ?? 0})</span>
                </TabsTrigger>
              ))}
            </TabsList>
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
                onClick={handleRunAudit}
                disabled={auditBusy || personas.length === 0}
                title="إعادة تدقيق جميع الأوصاف"
              >
                <ShieldCheck className="h-4 w-4 mr-1" />
                {auditBusy ? "جارٍ التدقيق…" : "تدقيق الأوصاف"}
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
              {loading ? (
                <p className="text-muted-foreground py-12 text-center">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground py-12 text-center">No personas in {c} yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filtered.map((p) => (
                    <Card key={p.id} className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setPreviewing(p)}
                        className="block w-full aspect-square overflow-hidden bg-muted"
                      >
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-full h-full object-cover hover:scale-105 transition"
                          loading="lazy"
                        />
                      </button>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{p.role} · {p.gender}</p>
                          </div>
                          <Badge variant={p.luxand_uuid ? "default" : "secondary"} className="text-[10px] shrink-0">
                            {p.luxand_uuid ? "enrolled" : "no face"}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="flex-1"
                            onClick={() => { setEditing({ id: p.id, name: p.name, description: p.description, category: p.category, gender: p.gender, role: p.role, image_url: p.image_url }); setDialogOpen(true); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => reenroll(p)} disabled={busy}>
                            <RefreshCw className="h-3 w-3" />
                          </Button>
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
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        form={editing}
        setForm={setEditing}
        onSave={savePersona}
        onUpload={uploadImageToBucket}
        busy={busy}
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
  open, onOpenChange, form, setForm, onSave, onUpload, busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: FormState | null;
  setForm: (f: FormState | null) => void;
  onSave: (f: FormState) => void;
  onUpload: (file: File) => Promise<string | null>;
  busy: boolean;
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
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
          <p className="text-xs text-muted-foreground mt-2 break-all">
            <strong>Luxand UUID:</strong> {persona.luxand_uuid ?? "— not enrolled —"}
          </p>
          {persona.description && <p className="text-sm mt-2">{persona.description}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}