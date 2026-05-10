import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, ExternalLink, RefreshCw, Trash2, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  reviewSourceMatch,
  deleteSelectedPersonas,
} from "@/lib/review-source-match.functions";

export const Route = createFileRoute("/admin/source-review")({
  head: () => ({
    meta: [
      { title: "مراجعة مطابقة المصادر — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SourceReviewPage,
});

type Result = {
  persona_id: string;
  persona_name: string;
  category: string;
  source_url: string | null;
  wiki_title: string;
  wiki_extract: string;
  description: string;
  verdict: "match" | "partial" | "mismatch" | "no_source" | "fetch_error";
  confidence: number;
  reason: string;
};

const CATEGORIES = ["Pharaoh", "Greek", "Persian", "Samurai", "Viking", "Chinese"];
const BATCH_SIZE = 10;

function verdictBadge(v: Result["verdict"]) {
  switch (v) {
    case "match":
      return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">مطابق</Badge>;
    case "partial":
      return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">جزئي</Badge>;
    case "mismatch":
      return <Badge variant="destructive">غير مطابق</Badge>;
    case "no_source":
      return <Badge variant="outline">لا يوجد مصدر</Badge>;
    case "fetch_error":
      return <Badge variant="secondary">خطأ في الجلب</Badge>;
  }
}

function SourceReviewPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState<string>("Pharaoh");
  const [filter, setFilter] = useState<"mismatch" | "all" | "issues">("mismatch");
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate({ to: "/auth" });
  }, [authLoading, user, isAdmin, navigate]);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  }

  async function runReview() {
    setRunning(true);
    setResults([]);
    setSelected(new Set());
    try {
      // fetch all persona ids in category first
      const { data, error } = await supabase
        .from("personas")
        .select("id")
        .eq("category", category)
        .order("name");
      if (error) throw error;
      const allIds = (data || []).map((r) => r.id as string);
      if (allIds.length === 0) {
        flash("لا توجد شخصيات في هذا التصنيف");
        return;
      }

      const acc: Result[] = [];
      for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const slice = allIds.slice(i, i + BATCH_SIZE);
        setProgress(`جاري المراجعة ${i + 1}–${Math.min(i + BATCH_SIZE, allIds.length)} من ${allIds.length}...`);
        const batch = await reviewSourceMatch({ data: { ids: slice } });
        acc.push(...(batch as Result[]));
        setResults([...acc]);
      }
      flash(`اكتملت المراجعة: ${acc.length} شخصية`);
    } catch (e) {
      flash("فشل المراجعة: " + (e as Error).message);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return results;
    if (filter === "issues") return results.filter((r) => r.verdict !== "match");
    return results.filter((r) => r.verdict === "mismatch");
  }, [results, filter]);

  const counts = useMemo(() => {
    const c = { match: 0, partial: 0, mismatch: 0, no_source: 0, fetch_error: 0 };
    for (const r of results) c[r.verdict]++;
    return c;
  }, [results]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(filtered.map((r) => r.persona_id)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      const { deleted } = (await deleteSelectedPersonas({ data: { ids } })) as { deleted: number };
      setResults((prev) => prev.filter((r) => !selected.has(r.persona_id)));
      setSelected(new Set());
      flash(`تم حذف ${deleted} شخصية`);
    } catch (e) {
      flash("فشل الحذف: " + (e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  if (authLoading || !user || !isAdmin) {
    return <div className="p-8 text-center text-muted-foreground">جاري التحقق...</div>;
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b border-border/50 bg-background/95 sticky top-0 z-40 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 ml-1" /> الإدارة
            </Link>
            <h1 className="text-base md:text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              مراجعة مطابقة الوصف بالمصدر التاريخي
            </h1>
          </div>
        </div>
      </header>

      {toast && (
        <div className="fixed top-4 left-4 z-50 bg-card border border-border shadow-lg rounded-md px-4 py-2 text-sm">
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">إعدادات المراجعة</CardTitle>
            <CardDescription>
              يقوم النظام بجلب صفحة المصدر (ويكيبيديا) ومقارنة محتواها بالوصف المحفوظ باستخدام الذكاء الاصطناعي.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={runReview} disabled={running}>
                {running ? <RefreshCw className="h-4 w-4 ml-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 ml-2" />}
                {running ? progress || "جاري المراجعة..." : "بدء المراجعة"}
              </Button>

              {results.length > 0 && (
                <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                  <SelectTrigger className="w-44 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mismatch">غير المطابقة فقط</SelectItem>
                    <SelectItem value="issues">جميع المشاكل</SelectItem>
                    <SelectItem value="all">الكل</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {results.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">مطابق: {counts.match}</Badge>
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">جزئي: {counts.partial}</Badge>
                <Badge variant="destructive">غير مطابق: {counts.mismatch}</Badge>
                <Badge variant="outline">بدون مصدر: {counts.no_source}</Badge>
                <Badge variant="secondary">خطأ: {counts.fetch_error}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {filtered.length > 0 && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  النتائج ({filtered.length})
                </CardTitle>
                <CardDescription>
                  حدد الشخصيات التي تريد حذفها. الشخصيات غير المحددة سيتم الإبقاء عليها.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllVisible}>
                  تحديد الكل
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection} disabled={selected.size === 0}>
                  إلغاء التحديد
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={selected.size === 0 || deleting}>
                      <Trash2 className="h-4 w-4 ml-1" />
                      حذف المحدد ({selected.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent dir="rtl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                      <AlertDialogDescription>
                        سيتم حذف {selected.size} شخصية بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                      <AlertDialogAction onClick={deleteSelected}>تأكيد الحذف</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filtered.map((r) => (
                  <div
                    key={r.persona_id}
                    className={`border rounded-lg p-3 transition-colors ${
                      selected.has(r.persona_id) ? "border-destructive bg-destructive/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selected.has(r.persona_id)}
                        onCheckedChange={() => toggle(r.persona_id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{r.persona_name}</span>
                          {verdictBadge(r.verdict)}
                          {r.confidence > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ثقة {Math.round(r.confidence * 100)}%
                            </span>
                          )}
                          {r.source_url && (
                            <a
                              href={r.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary inline-flex items-center hover:underline"
                            >
                              المصدر <ExternalLink className="h-3 w-3 mr-1" />
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">سبب الحكم: </span>
                          {r.reason}
                        </p>
                        {r.wiki_title && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">صفحة المصدر: </span>
                            {r.wiki_title}
                          </p>
                        )}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            عرض الوصف وملخص المصدر
                          </summary>
                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-muted/40 rounded p-2">
                              <div className="font-semibold mb-1">الوصف المحفوظ</div>
                              <div className="whitespace-pre-wrap leading-relaxed">{r.description || "—"}</div>
                            </div>
                            <div className="bg-muted/40 rounded p-2">
                              <div className="font-semibold mb-1">ملخص ويكيبيديا</div>
                              <div className="whitespace-pre-wrap leading-relaxed">{r.wiki_extract || "—"}</div>
                            </div>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {results.length > 0 && filtered.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              لا توجد نتائج تطابق الفلتر الحالي.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
