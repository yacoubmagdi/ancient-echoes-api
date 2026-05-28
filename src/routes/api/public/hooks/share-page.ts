import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/share-page")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) {
            return new Response("Missing id", { status: 400 });
          }

          const supabaseUrl = process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (!supabaseUrl || !serviceKey) {
            return new Response("Server misconfigured", { status: 500 });
          }

          const restUrl = `${supabaseUrl}/rest/v1/shared_results?id=eq.${encodeURIComponent(id)}&select=match_name,category,similarity,description,match_image_url&limit=1`;
          const resp = await fetch(restUrl, {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Accept: "application/json",
            },
          });

          if (!resp.ok) {
            return new Response("Not found", { status: 404 });
          }

          const rows = await resp.json();
          const data = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          if (!data) {
            return new Response("Not found", { status: 404 });
          }

          const similarity = Math.round(Number(data.similarity));
          const baseUrl = url.origin;
          // Use the persona image directly as OG image — it's already on Supabase
          // CDN (fast, always available). The AI-generated card via /og-image is
          // too slow for Facebook's scraper (~10s timeout) and often returns a
          // redirect to the same persona image anyway. Direct image = reliable
          // unfurl every time.
          const cachedShareCardUrl = `${supabaseUrl}/storage/v1/object/public/personas/og-cache/${id}_share.png`;
          let ogImageUrl = data.match_image_url || "";
          try {
            const headResp = await fetch(cachedShareCardUrl, { method: "HEAD" });
            if (headResp.ok) {
              ogImageUrl = cachedShareCardUrl;
            }
          } catch {
            // fall back to match image
          }

          if (!ogImageUrl.startsWith("http")) {
            ogImageUrl = `${baseUrl}${ogImageUrl}`;
          }
          const resultUrl = `${baseUrl}/result/${id}`;

          const title = `أنا أشبه ${data.match_name} بنسبة ${similarity}% — أصداء القدماء`;
          const desc = `تطابق ${similarity}% مع ${data.match_name} من ${data.category}. اكتشف شبيهك التاريخي أنت أيضًا!`;

          // Detect social media crawlers — don't redirect them, let them read OG tags.
          const ua = (request.headers.get("user-agent") || "").toLowerCase();
          const isBot = /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|slackbot|linkedinbot|discordbot|pinterest|skypeuripreview|googlebot|bingbot|embedly|redditbot|vkshare/.test(
            ua
          );

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
  <meta property="og:image:secure_url" content="${esc(ogImageUrl)}"/>
  <meta property="og:image:type" content="image/png"/>
  <meta property="og:image:width" content="1080"/>
  <meta property="og:image:height" content="1350"/>
  <meta property="og:url" content="${esc(baseUrl)}/api/public/hooks/share-page?id=${esc(id)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:site_name" content="أصداء القدماء"/>
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${esc(title)}"/>
  <meta name="twitter:description" content="${esc(desc)}"/>
  <meta name="twitter:image" content="${esc(ogImageUrl)}"/>
  <meta name="twitter:image:src" content="${esc(ogImageUrl)}"/>
  
  <!-- WhatsApp / Telegram -->
  <meta property="og:image:alt" content="${esc(`${data.match_name} - ${similarity}% تطابق`)}"/>

  <link rel="canonical" href="${esc(resultUrl)}"/>
  ${isBot ? "" : `<meta http-equiv="refresh" content="2;url=${esc(resultUrl)}"/>`}
  
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
              "Cache-Control": "private, max-age=3600",
            },
          });
        } catch (e) {
          console.error("share-page error:", e);
          return new Response("Internal Server Error", { status: 500 });
        }
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