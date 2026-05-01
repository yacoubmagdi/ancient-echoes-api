import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { getSharedResult } from "@/server/share.functions";

export const Route = createFileRoute("/result/$id")({
  head: ({ params, loaderData }) => {
    const baseUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://id-preview--3ba98fd0-2790-4f3a-b6a4-70b788197bd3.lovable.app";
    const ogImageUrl = `${baseUrl}/api/public/hooks/og-image?id=${params.id}`;
    const pageUrl = `${baseUrl}/result/${params.id}`;

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
    const ogSquareUrl = `${baseUrl}/api/public/hooks/og-image?id=${params.id}&size=square`;

    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: ogImageUrl },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:type", content: "image/png" },
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