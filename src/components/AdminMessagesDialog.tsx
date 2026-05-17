import { useState, useEffect, useCallback } from "react";
import { Inbox, Mail, MailOpen, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type UserMessage = {
  id: string;
  name: string | null;
  email: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
};

export function AdminMessagesDialog() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");

  const loadCount = useCallback(async () => {
    const { count } = await supabase
      .from("user_messages")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false);
    setUnread(count ?? 0);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_messages")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("تعذّر تحميل الرسائل");
      return;
    }
    setMessages(data ?? []);
  }, []);

  useEffect(() => { loadCount(); }, [loadCount]);
  useEffect(() => { if (open) load(); }, [open, load]);

  async function toggleRead(m: UserMessage) {
    const { error } = await supabase
      .from("user_messages")
      .update({ is_read: !m.is_read })
      .eq("id", m.id);
    if (error) return toast.error("تعذّر التحديث");
    setMessages((xs) => xs.map((x) => x.id === m.id ? { ...x, is_read: !m.is_read } : x));
    loadCount();
  }

  async function remove(id: string) {
    if (!confirm("حذف هذه الرسالة؟")) return;
    const { error } = await supabase.from("user_messages").delete().eq("id", id);
    if (error) return toast.error("تعذّر الحذف");
    setMessages((xs) => xs.filter((x) => x.id !== id));
    loadCount();
  }

  const filtered = messages.filter((m) =>
    filter === "all" ? true : filter === "unread" ? !m.is_read : m.is_read
  );
  const readCount = messages.length - unread;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 relative">
          <Inbox className="h-4 w-4" />
          مشاهدة الرسائل
          {unread > 0 && (
            <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">{unread}</Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>صندوق الرسائل والمقترحات</DialogTitle>
            <Button variant="ghost" size="icon" onClick={load} disabled={loading} aria-label="تحديث">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex items-center gap-2 flex-wrap pb-2 border-b">
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
            className="h-7 text-xs gap-1.5"
          >
            الكل
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{messages.length}</Badge>
          </Button>
          <Button
            size="sm"
            variant={filter === "unread" ? "default" : "outline"}
            onClick={() => setFilter("unread")}
            className="h-7 text-xs gap-1.5"
          >
            غير المقروءة
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{unread}</Badge>
          </Button>
          <Button
            size="sm"
            variant={filter === "read" ? "default" : "outline"}
            onClick={() => setFilter("read")}
            className="h-7 text-xs gap-1.5"
          >
            المقروءة
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{readCount}</Badge>
          </Button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
          {!loading && filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">لا توجد رسائل بعد.</p>
          )}
          {filtered.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-3 space-y-2 ${m.is_read ? "bg-muted/30" : "bg-card border-primary/40"}`}
            >
              <div className="flex items-start justify-between gap-2 text-sm">
                <div className="space-y-0.5">
                  <div className="font-medium">{m.name || "مجهول"}</div>
                  {m.email && <div className="text-xs text-muted-foreground">{m.email}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleString("ar-EG")}
                  </span>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.message}</p>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => toggleRead(m)} className="gap-1.5 h-7 text-xs">
                  {m.is_read ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                  {m.is_read ? "تعليم كغير مقروءة" : "تعليم كمقروءة"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(m.id)} className="gap-1.5 h-7 text-xs text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}