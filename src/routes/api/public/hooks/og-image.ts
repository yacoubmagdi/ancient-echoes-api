import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/og-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) {
          return new Response("Missing id", { status: 400 });
        }

        const supabaseUrl = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, serviceKey);

        const { data, error } = await supabase
          .from("shared_results")
          .select("*")
          .eq("id", id)
          .single();

        if (error || !data) {
          return new Response("Not found", { status: 404 });
        }

        // Generate an SVG-based OG image (1200x630 for social media)
        const W = 1200;
        const H = 630;
        const similarity = Math.round(Number(data.similarity));
        const barWidth = Math.round((similarity / 100) * 500);

        // Escape XML entities
        const esc = (s: string) =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        const matchName = esc(data.match_name);
        const category = esc(data.category);
        const description = esc(
          data.description.length > 120
            ? data.description.slice(0, 117) + "..."
            : data.description
        );

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0a1f"/>
      <stop offset="100%" stop-color="#1a1430"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#c9a84c"/>
      <stop offset="100%" stop-color="#f5e9b8"/>
    </linearGradient>
    <clipPath id="userClip">
      <circle cx="180" cy="260" r="130"/>
    </clipPath>
    <clipPath id="matchClip">
      <circle cx="460" cy="260" r="130"/>
    </clipPath>
  </defs>
  
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  
  <!-- Gold border -->
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#c9a84c" stroke-width="3" rx="12"/>
  
  <!-- Title -->
  <text x="${W / 2}" y="60" text-anchor="middle" fill="#e8d27a" font-size="36" font-weight="bold" font-family="serif">أصداء القدماء</text>
  
  <!-- User image circle -->
  ${data.user_image_data ? `<image href="${esc(data.user_image_data)}" x="50" y="130" width="260" height="260" clip-path="url(#userClip)" preserveAspectRatio="xMidYMid slice"/>` : `<circle cx="180" cy="260" r="130" fill="#2a2440"/>`}
  <circle cx="180" cy="260" r="130" fill="none" stroke="#c9a84c" stroke-width="4"/>
  <text x="180" y="420" text-anchor="middle" fill="#cfcfe0" font-size="18" font-family="sans-serif">أنت</text>

  <!-- Equals symbol -->
  <text x="320" y="275" text-anchor="middle" fill="#c9a84c" font-size="60" font-weight="bold" font-family="serif">≈</text>

  <!-- Match image circle -->
  <image href="${esc(data.match_image_url)}" x="330" y="130" width="260" height="260" clip-path="url(#matchClip)" preserveAspectRatio="xMidYMid slice"/>
  <circle cx="460" cy="260" r="130" fill="none" stroke="#c9a84c" stroke-width="4"/>
  <text x="460" y="420" text-anchor="middle" fill="#cfcfe0" font-size="18" font-family="sans-serif">الشخصية</text>
  
  <!-- Right side info -->
  <text x="750" y="170" text-anchor="start" fill="#f5e9b8" font-size="40" font-weight="bold" font-family="serif">${matchName}</text>
  <text x="750" y="210" text-anchor="start" fill="#a89cc6" font-size="22" font-style="italic" font-family="serif">${category}</text>
  
  <!-- Similarity bar -->
  <rect x="750" y="240" width="380" height="16" rx="8" fill="#2a2440"/>
  <rect x="750" y="240" width="${Math.round((similarity / 100) * 380)}" height="16" rx="8" fill="url(#gold)"/>
  <text x="750" y="285" text-anchor="start" fill="#e8d27a" font-size="28" font-weight="bold" font-family="sans-serif">${similarity}% تطابق</text>
  
  <!-- Description -->
  <text x="750" y="330" text-anchor="start" fill="#d8d4e8" font-size="16" font-family="sans-serif">
    <tspan x="750" dy="0">${esc(data.description.slice(0, 60))}</tspan>
    <tspan x="750" dy="22">${esc(data.description.slice(60, 120))}</tspan>
  </text>
  
  <!-- Footer CTA -->
  <rect x="750" y="520" width="380" height="50" rx="25" fill="#c9a84c" fill-opacity="0.2" stroke="#c9a84c" stroke-width="2"/>
  <text x="940" y="552" text-anchor="middle" fill="#e8d27a" font-size="20" font-weight="bold" font-family="sans-serif">اكتشف شبيهك التاريخي!</text>
  
  <!-- Bottom brand -->
  <text x="${W / 2}" y="${H - 20}" text-anchor="middle" fill="#8a82a8" font-size="16" font-family="sans-serif">echoes-of-the-ancients.lovable.app</text>
</svg>`;

        return new Response(svg, {
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});