import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ContactButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 1) return;
    setSending(true);
    const { error } = await supabase.from("user_messages").insert({
      name: name.trim() || null,
      email: email.trim() || null,
      message: message.trim(),
    });
    setSending(false);
    if (error) {
      toast.error("تعذّر إرسال الرسالة");
      return;
    }
    toast.success("تم إرسال رسالتك، شكراً لك!");
    setName(""); setEmail(""); setMessage("");
    setOpen(false);
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="lg"
        className="fixed bottom-4 left-4 z-50 rounded-full shadow-lg gap-2"
        aria-label="إرسال رسالة"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="hidden sm:inline">رسالة / اقتراح</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>أرسل رسالة أو اقتراحاً</DialogTitle>
            <DialogDescription>سنطّلع على رسالتك ونردّ عند الحاجة.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cb-name">الاسم (اختياري)</Label>
              <Input id="cb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cb-email">البريد (اختياري)</Label>
              <Input id="cb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cb-msg">الرسالة</Label>
              <Textarea
                id="cb-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                minLength={1}
                maxLength={5000}
                rows={5}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={sending || message.trim().length < 1} className="gap-2">
                <Send className="h-4 w-4" />
                {sending ? "جارٍ الإرسال..." : "إرسال"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}