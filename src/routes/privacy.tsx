import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — Egypteca" },
      {
        name: "description",
        content:
          "سياسة الخصوصية لتطبيق Egypteca: كيف نتعامل مع صورك وبياناتك عند استخدام ميزة مطابقة الشخصيات التاريخية.",
      },
      { property: "og:title", content: "سياسة الخصوصية — Egypteca" },
      {
        property: "og:description",
        content:
          "تعرّف على كيفية تعاملنا مع صورك وبياناتك في Egypteca.",
      },
      {
        property: "og:url",
        content: "https://ancient-echoes-api.lovable.app/privacy",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://ancient-echoes-api.lovable.app/privacy",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-background px-6 py-12 text-foreground"
    >
      <article className="mx-auto max-w-3xl space-y-6 leading-relaxed">
        <header className="space-y-2 border-b border-border pb-6">
          <h1 className="text-3xl font-bold">سياسة الخصوصية</h1>
          <p className="text-sm text-muted-foreground">
            آخر تحديث: 28 مايو 2026
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">من نحن</h2>
          <p>
            Egypteca تطبيق يستخدم الذكاء الاصطناعي لمطابقة صورتك مع شخصيات
            تاريخية. خصوصيتك أولوية لدينا، وهذه الصفحة توضّح كيف نتعامل مع
            بياناتك.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">البيانات التي نجمعها</h2>
          <ul className="list-disc space-y-2 pr-6">
            <li>
              <strong>الصورة المرفوعة:</strong> تُستخدم فقط لتحليل ملامح الوجه
              واستخراج المتجه الرقمي اللازم للمطابقة.
            </li>
            <li>
              <strong>اختياراتك في الفلاتر:</strong> مثل الجنسية والعصر والفئة،
              لتحسين دقة النتيجة.
            </li>
            <li>
              <strong>نتيجة المطابقة:</strong> تُحفظ مؤقتاً لإتاحة رابط
              المشاركة.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">كيف نستخدم بياناتك</h2>
          <ul className="list-disc space-y-2 pr-6">
            <li>تقديم نتيجة المطابقة وعرضها لك.</li>
            <li>توليد صفحة مشاركة عامة للنتيجة عند طلبك ذلك.</li>
            <li>تحسين جودة الخدمة وأدائها.</li>
          </ul>
          <p>
            لا نبيع بياناتك ولا نشاركها مع أطراف ثالثة لأغراض إعلانية.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">المشاركة على فيسبوك</h2>
          <p>
            عند الضغط على "مشاركة على فيسبوك" يتم فتح نافذة المشاركة الرسمية
            من فيسبوك. لا نمرّر صورتك إلى فيسبوك مباشرة — فقط رابط صفحة
            النتيجة العامة. النص المرافق يُنسخ تلقائياً إلى الحافظة ليمكنك
            لصقه في المنشور.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">حقوقك</h2>
          <ul className="list-disc space-y-2 pr-6">
            <li>طلب حذف نتيجتك المحفوظة في أي وقت.</li>
            <li>طلب نسخة من بياناتك المخزّنة.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">التواصل معنا</h2>
          <p>
            لأي استفسار حول الخصوصية أو طلب حذف بيانات، يُرجى التواصل عبر
            صفحة الاتصال داخل التطبيق.
          </p>
        </section>

        <footer className="border-t border-border pt-6">
          <Link to="/" className="text-sm text-primary hover:underline">
            ← العودة إلى الصفحة الرئيسية
          </Link>
        </footer>
      </article>
    </main>
  );
}
