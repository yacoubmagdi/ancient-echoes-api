import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/share-page")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) {
          return new Response("Missing id", { status: 400 });
        }

        const supabase = createClient(
          process.env.VITE_SUPABASE_URL!,
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
        );

        const { data, error } = await supabase
          .from("shared_results")
          .select("*")
          .eq("id", id)
          .single();

        if (error || !data) {
          return new Response("Not found", { status: 404 });
        }

        const similarity = Math.round(Number(data.similarity));
        const baseUrl = url.origin;
        const ogImageUrl = `${baseUrl}/api/public/hooks/og-image?id=${id}`;
        const resultUrl = `${baseUrl}/result/${id}`;

        const title = `أنا أشبه ${data.match_name} — أصداء القدماء`;
        const desc = `تطابق ${similarity}% مع ${data.match_name} من ${data.category}. اكتشف شبيهك التاريخي أنت أيضًا!`;

        // Return full HTML with proper OG tags + redirect for humans
        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}"/>
  
  <!-- Open Graph -->
  <meta property="og:title" content="${esc(title)}"/>
  <meta property="og:description" content="${esc(desc)}"/>
  <meta property="og:image" content="${esc(ogImageUrl)}"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:image:type" content="image/png"/>
  <meta property="og:url" content="${esc(resultUrl)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:site_name" content="أصداء القدماء"/>
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${esc(title)}"/>
  <meta name="twitter:description" content="${esc(desc)}"/>
  <meta name="twitter:image" content="${esc(ogImageUrl)}"/>
  
  <!-- WhatsApp / Telegram -->
  <meta property="og:image:alt" content="${esc(`${data.match_name} - ${similarity}% تطابق`)}"/>
  
  <!-- Redirect humans to the full result page -->
  <meta http-equiv="refresh" content="0;url=${esc(resultUrl)}"/>
  <link rel="canonical" href="${esc(resultUrl)}"/>
  
  <style>
    body { background: #0b0a1f; color: #e8d27a; font-family: serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; direction: rtl; }
    .card { max-width: 600px; padding: 40px; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    p { color: #cfcfe0; font-size: 1rem; }
    .similarity { font-size: 3rem; font-weight: bold; color: #c9a84c; }
    img { width: 200px; height: 200px; border-radius: 50%; object-fit: cover; border: 4px solid #c9a84c; margin: 20px auto; display: block; }
    a { color: #c9a84c; text-decoration: none; display: inline-block; margin-top: 20px; padding: 12px 32px; border: 2px solid #c9a84c; border-radius: 30px; }
  </style>
</head>
<body>
  <div class="card">
    <img src="${esc(data.match_image_url)}" alt="${esc(data.match_name)}"/>
    <h1>${esc(data.match_name)}</h1>
    <p>${esc(data.category)}</p>
    <div class="similarity">${similarity}%</div>
    <p>${esc(data.description)}</p>
    <a href="${esc(resultUrl)}">اكتشف شبيهك التاريخي!</a>
  </div>
</body>
</html>`;

        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}