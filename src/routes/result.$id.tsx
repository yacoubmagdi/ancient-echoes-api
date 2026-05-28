import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Share2, Copy, Check } from "lucide-react";
import { getSharedResult } from "@/server/share.functions";
import { useState } from "react";
import { toast } from "sonner";
import { buildPublishedFacebookRedirect, buildPublishedSharePageUrl, buildPublishedResultUrl, PUBLISHED_BASE_URL } from "@/lib/share-url";

export const Route = createFileRoute("/result/$id")({
  head: ({ params, loaderData }) => {
    const ogImageUrl = `${buildPublishedSharePageUrl(params.id)}&image=1`;
    const pageUrl = buildPublishedResultUrl(params.id);

    const result = loaderData as any;
    const title = result
      ? `أنا أشبه ${result.match_name} — أصداء القدماء`
      : "أصداء القدماء — اكتشف شبيهك التاريخي";
    const desc = result
      ? `تطابق ${Math.round(result.similarity)}% مع ${result.match_name} من ${result.category}. اكتشف شبيهك التاريخي أنت أيضًا!`
      : "اكتشف أي شخصية تاريخية تشبهك عبر الذكاء الاصطناعي.";

    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: ogImageUrl },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:url", content: pageUrl },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: ogImageUrl },
      ],
    };
  },
  loader: async ({ params }) => {
    const result = await getSharedResult({ data: { id: params.id } });
    return result;
  },
  component: ResultPage,
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">خطأ</h1>
        <p className="mt-2 text-muted-foreground">حدث خطأ أثناء تحميل النتيجة</p>
        <Link to="/" className="mt-4 inline-block text-primary underline">
          العودة للرئيسية
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">نتيجة غير موجودة</h1>
        <p className="mt-2 text-muted-foreground">قد تكون هذه النتيجة قد انتهت صلاحيتها</p>
        <Link to="/" className="mt-4 inline-block text-primary underline">
          جرّب بنفسك!
        </Link>
      </div>
    </div>
  ),
});

function ShareButtons({ id, matchName, similarity, category }: { id: string; matchName: string; similarity: number; category: string }) {
  const [copied, setCopied] = useState(false);
  const [supportsShare] = useState(() => typeof navigator !== "undefined" && !!navigator.share);
  const shareUrl = buildPublishedSharePageUrl(id);
  const text = `أنا أشبه ${matchName} بنسبة ${similarity}% من ${category}! اكتشف شبيهك التاريخي 🏛️`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
  const facebookUrl = buildPublishedFacebookRedirect(shareUrl, text);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text + "\n" + shareUrl)}`;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: `أنا أشبه ${matchName} — أصداء القدماء`,
        text,
        url: shareUrl,
      });
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast.error("تعذرت المشاركة");
      }
    }
  };
  const btn = "flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95";
  return (
    <div className="space-y-3">
      {supportsShare && (
        <div className="flex justify-center">
          <button
            onClick={handleNativeShare}
            className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 text-base`}
          >
            <Share2 className="h-5 w-5" />
            <span>شارك نتيجتك</span>
          </button>
        </div>
      )}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>{supportsShare ? "أو شارك عبر" : "شارك نتيجتك"}</span>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className={`${btn} bg-black text-white hover:bg-neutral-800`}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          <span>X</span>
        </a>
        <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#1877F2] text-white hover:bg-[#166FE5]`}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          <span>فيسبوك</span>
        </a>
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#25D366] text-white hover:bg-[#20BD5A]`}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          <span>واتساب</span>
        </a>
        <button onClick={handleCopy} className={`${btn} border border-border bg-card text-foreground hover:bg-accent`}>
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          <span>{copied ? "تم النسخ!" : "نسخ الرابط"}</span>
        </button>
      </div>
    </div>
  );
}

function ResultPage() {
  const result = Route.useLoaderData() as any;

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground">نتيجة غير موجودة</h1>
          <p className="mt-2 text-muted-foreground">قد تكون هذه النتيجة قد انتهت صلاحيتها</p>
          <Link to="/">
            <Button className="mt-6 gap-2">
              <Sparkles className="h-4 w-4" />
              اكتشف شبيهك التاريخي
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const similarity = Math.round(Number(result.similarity));

  return (
    <main className="min-h-screen bg-background" dir="rtl">
      <div className="mx-auto max-w-2xl px-4 py-12 space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
            أصداء القدماء
          </div>
        </div>

        <Card className="overflow-hidden border-border/60 bg-card/60 backdrop-blur">
          <div className="grid md:grid-cols-2 gap-0">
            <div className="relative aspect-square">
              <img
                src={result.match_image_url}
                alt={result.match_name}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute top-4 right-4 rounded-full bg-background/70 backdrop-blur px-3 py-1 text-xs uppercase tracking-wider">
                {result.category}
              </div>
            </div>
            <div className="p-8 md:p-10 flex flex-col justify-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                النتيجة
              </p>
              <h2
                className="mt-2 text-3xl md:text-4xl font-bold bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-gold)" }}
              >
                {result.match_name}
              </h2>
              <div className="mt-6">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">نسبة التشابه</span>
                  <span
                    className="text-2xl font-bold"
                    style={{ color: "var(--color-gold)" }}
                  >
                    {similarity}%
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full transition-all duration-1000"
                    style={{
                      width: `${similarity}%`,
                      background: "var(--gradient-gold)",
                    }}
                  />
                </div>
              </div>
              <p className="mt-6 text-base text-muted-foreground leading-relaxed">
                {result.description}
              </p>
            </div>
          </div>
        </Card>

        <ShareButtons
          id={result.id}
          matchName={result.match_name}
          similarity={similarity}
          category={result.category}
        />

        {result.user_image_data && (
          <div className="flex justify-center gap-8 items-center">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border mx-auto">
                <img
                  src={result.user_image_data}
                  alt="المستخدم"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">المستخدم</p>
            </div>
            <span
              className="text-3xl font-bold"
              style={{ color: "var(--color-gold)" }}
            >
              ≈
            </span>
            <div className="text-center">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border mx-auto">
                <img
                  src={result.match_image_url}
                  alt={result.match_name}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{result.match_name}</p>
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <Link to="/">
            <Button size="lg" className="gap-2">
              <Sparkles className="h-4 w-4" />
              اكتشف شبيهك التاريخي أنت أيضًا!
            </Button>
          </Link>
        </div>

        <footer className="text-center text-xs text-muted-foreground">
          أصداء القدماء — اكتشف أي شخصية تاريخية تشبهك
        </footer>
      </div>
    </main>
  );
}