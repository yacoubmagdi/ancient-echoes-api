import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Pencil, Trash2, Plus, RefreshCw, Sparkles, LogOut } from "lucide-react";

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
  const [editing, setEditing] = useState<FormState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewing, setPreviewing] = useState<Persona | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
    const { data, error } = await supabase.functions.invoke("persona-admin", {
      body: { action: "reenroll", personaId: p.id },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      flash(error?.message || (data as any).error || "Re-enroll failed");
      return;
    }
    flash(`Re-enrolled. UUID: ${(data as any).luxand_uuid?.slice(0, 8)}…`);
    loadPersonas();
  }

  const filtered = useMemo(() => {
    return personas
      .filter((p) => p.category === activeCiv)
      .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()));
  }, [personas, activeCiv, search]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of CIVILIZATIONS) out[c] = 0;
    for (const p of personas) out[p.category] = (out[p.category] ?? 0) + 1;
    return out;
  }, [personas]);

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
            <div className="flex gap-2">
              <Input
                placeholder="Search by name…"
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
        flash={flash}
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
  persona, onClose, flash,
}: { persona: Persona | null; onClose: () => void; flash: (m: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ scoped: number | null; matches: Array<{ uuid: string; name: string; probability: number }> } | null>(null);

  useEffect(() => { setFile(null); setResult(null); }, [persona?.id]);
  if (!persona) return null;

  async function runSimilarity() {
    if (!file || !persona) return;
    setRunning(true); setResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = (reader.result as string) ?? "";
      const { data, error } = await supabase.functions.invoke("persona-admin", {
        body: { action: "similarity", imageBase64: b64, personaId: persona!.id },
      });
      setRunning(false);
      if (error || (data as any)?.error) { flash(error?.message || (data as any).error); return; }
      setResult({
        scoped: (data as any).scopedMatch?.probability ?? null,
        matches: (data as any).matches ?? [],
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <Dialog open={!!persona} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{persona.name}</DialogTitle>
          <DialogDescription>{persona.category} · {persona.role} · {persona.gender}</DialogDescription>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <img src={persona.image_url} alt={persona.name} className="w-full rounded-md border border-border" />
            <p className="text-xs text-muted-foreground mt-2 break-all">
              <strong>Luxand UUID:</strong> {persona.luxand_uuid ?? "— not enrolled —"}
            </p>
            {persona.description && <p className="text-sm mt-2">{persona.description}</p>}
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> Similarity test</Label>
              <p className="text-xs text-muted-foreground">Upload a face photo to see how it scores against this persona's embedding.</p>
              <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Button onClick={runSimilarity} disabled={!file || running} className="w-full">
                {running ? "Comparing…" : "Run similarity test"}
              </Button>
            </div>
            {result && (
              <div className="space-y-2 text-sm">
                <div className="rounded-md border border-border p-3">
                  <p className="font-medium">Match against this persona</p>
                  <p className="text-2xl font-bold">
                    {result.scoped !== null ? `${(result.scoped * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-medium mb-1">Top matches in collection</p>
                  {result.matches.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No matches.</p>
                  ) : (
                    <ul className="space-y-1">
                      {result.matches.map((m) => (
                        <li key={m.uuid} className="flex justify-between text-xs">
                          <span className="truncate">{m.name || m.uuid.slice(0, 8)}</span>
                          <span className="font-mono">{(m.probability * 100).toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}