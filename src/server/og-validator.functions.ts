import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

interface OgValidationResult {
  url: string;
  status: "pass" | "warn" | "fail";
  tags: {
    "og:title"?: string;
    "og:description"?: string;
    "og:image"?: string;
    "og:image:width"?: string;
    "og:image:height"?: string;
    "og:url"?: string;
    "og:type"?: string;
    "og:site_name"?: string;
    "twitter:card"?: string;
    "twitter:title"?: string;
    "twitter:description"?: string;
    "twitter:image"?: string;
  };
  issues: string[];
  debugLinks: {
    facebook: string;
    twitter: string;
    linkedin: string;
  };
  imageCheck: {
    accessible: boolean;
    contentType?: string;
    size?: number;
    error?: string;
  };
}

export const validateOgTags = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ sharePageUrl: z.string().url() }).parse(data)
  )
  .handler(async ({ data }): Promise<OgValidationResult> => {
    const issues: string[] = [];
    const tags: OgValidationResult["tags"] = {};

    // Fetch the share page HTML
    let html = "";
    try {
      const resp = await fetch(data.sharePageUrl, {
        headers: { "User-Agent": "facebookexternalhit/1.1" },
        redirect: "manual",
      });
      html = await resp.text();
    } catch (e) {
      return {
        url: data.sharePageUrl,
        status: "fail",
        tags: {},
        issues: [`Failed to fetch page: ${(e as Error).message}`],
        debugLinks: buildDebugLinks(data.sharePageUrl),
        imageCheck: { accessible: false, error: "Page not accessible" },
      };
    }

    // Parse meta tags from HTML
    const metaRegex =
      /<meta\s+(?:[^>]*?\s)?(?:property|name)="([^"]+)"[^>]*?\scontent="([^"]*)"[^>]*?\/?>/gi;
    let match: RegExpExecArray | null;
    while ((match = metaRegex.exec(html)) !== null) {
      const key = match[1].toLowerCase();
      const val = match[2];
      if (key.startsWith("og:") || key.startsWith("twitter:")) {
        (tags as any)[key] = val;
      }
    }
    // Also check reversed attribute order
    const metaRegex2 =
      /<meta\s+(?:[^>]*?\s)?content="([^"]*)"[^>]*?\s(?:property|name)="([^"]+)"[^>]*?\/?>/gi;
    while ((match = metaRegex2.exec(html)) !== null) {
      const key = match[2].toLowerCase();
      const val = match[1];
      if ((key.startsWith("og:") || key.startsWith("twitter:")) && !(tags as any)[key]) {
        (tags as any)[key] = val;
      }
    }

    // Validate required OG tags
    const required: Array<[string, string]> = [
      ["og:title", "عنوان OG مطلوب لظهور الصورة على فيسبوك وواتساب"],
      ["og:description", "وصف OG مطلوب لظهور ملخص المحتوى"],
      ["og:image", "صورة OG مطلوبة — بدونها لن تظهر صورة عند المشاركة"],
      ["og:url", "رابط OG مطلوب لتحديد الرابط الأصلي"],
      ["twitter:card", "نوع بطاقة تويتر مطلوب (summary_large_image)"],
      ["twitter:image", "صورة تويتر مطلوبة لظهور الصورة على تويتر/X"],
    ];

    for (const [key, msg] of required) {
      if (!(tags as any)[key]) {
        issues.push(`❌ مفقود: ${key} — ${msg}`);
      }
    }

    // Validate recommended tags
    const recommended: Array<[string, string]> = [
      ["og:type", "نوع المحتوى (website) — موصى به"],
      ["og:site_name", "اسم الموقع — يظهر على فيسبوك"],
      ["og:image:width", "عرض الصورة — يساعد المنصات في العرض الصحيح"],
      ["og:image:height", "ارتفاع الصورة — يساعد المنصات في العرض الصحيح"],
      ["twitter:title", "عنوان تويتر — يظهر على X/Twitter"],
      ["twitter:description", "وصف تويتر — يظهر على X/Twitter"],
    ];

    for (const [key, msg] of recommended) {
      if (!(tags as any)[key]) {
        issues.push(`⚠️ موصى: ${key} — ${msg}`);
      }
    }

    // Validate og:image dimensions
    if (tags["og:image:width"] && tags["og:image:height"]) {
      const w = parseInt(tags["og:image:width"]);
      const h = parseInt(tags["og:image:height"]);
      if (w < 600) issues.push("⚠️ عرض og:image أقل من 600px — قد لا يظهر على فيسبوك");
      if (w > 8192) issues.push("⚠️ عرض og:image أكبر من 8192px — سيتم تجاهله");
      const ratio = w / h;
      if (ratio < 1.5 || ratio > 2.2) {
        issues.push(`⚠️ نسبة أبعاد الصورة (${ratio.toFixed(2)}) — الأفضل 1.91:1 (1200x630)`);
      }
    }

    // Validate twitter:card value
    if (tags["twitter:card"] && tags["twitter:card"] !== "summary_large_image") {
      issues.push(
        `⚠️ twitter:card = "${tags["twitter:card"]}" — استخدم "summary_large_image" لصورة كبيرة`
      );
    }

    // Check og:title length
    if (tags["og:title"] && tags["og:title"].length > 95) {
      issues.push("⚠️ og:title أطول من 95 حرف — قد يتم اقتطاعه على فيسبوك");
    }

    // Check og:description length
    if (tags["og:description"] && tags["og:description"].length > 300) {
      issues.push("⚠️ og:description أطول من 300 حرف — قد يتم اقتطاعه");
    }

    // Check image accessibility
    let imageCheck: OgValidationResult["imageCheck"] = {
      accessible: false,
    };
    if (tags["og:image"]) {
      try {
        const imgResp = await fetch(tags["og:image"], {
          method: "HEAD",
          signal: AbortSignal.timeout(10000),
        });
        if (imgResp.ok) {
          const ct = imgResp.headers.get("content-type") || "";
          const cl = parseInt(imgResp.headers.get("content-length") || "0");
          imageCheck = {
            accessible: true,
            contentType: ct,
            size: cl,
          };
          if (!ct.startsWith("image/")) {
            issues.push(
              `❌ og:image يرجع content-type: ${ct} — يجب أن يكون image/png أو image/jpeg`
            );
          }
          if (cl > 8 * 1024 * 1024) {
            issues.push("⚠️ حجم og:image أكبر من 8MB — قد لا يُحمل على بعض المنصات");
          }
        } else {
          imageCheck = {
            accessible: false,
            error: `HTTP ${imgResp.status}`,
          };
          issues.push(`❌ og:image غير قابل للوصول (HTTP ${imgResp.status})`);
        }
      } catch (e) {
        imageCheck = {
          accessible: false,
          error: (e as Error).message,
        };
        issues.push(`❌ og:image غير قابل للوصول: ${(e as Error).message}`);
      }
    }

    const failCount = issues.filter((i) => i.startsWith("❌")).length;
    const warnCount = issues.filter((i) => i.startsWith("⚠️")).length;
    const status: "pass" | "warn" | "fail" =
      failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

    return {
      url: data.sharePageUrl,
      status,
      tags,
      issues,
      debugLinks: buildDebugLinks(data.sharePageUrl),
      imageCheck,
    };
  });

function buildDebugLinks(pageUrl: string) {
  const encoded = encodeURIComponent(pageUrl);
  return {
    facebook: `https://developers.facebook.com/tools/debug/?q=${encoded}`,
    twitter: `https://cards-dev.twitter.com/validator`,
    linkedin: `https://www.linkedin.com/post-inspector/inspect/${encoded}`,
  };
}