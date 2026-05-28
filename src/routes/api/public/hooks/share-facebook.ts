import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const QuerySchema = z.object({
  u: z.string().url().max(2000),
  quote: z.string().max(500).optional(),
});

export const Route = createFileRoute("/api/public/hooks/share-facebook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const currentUrl = new URL(request.url);
          const parsed = QuerySchema.parse(
            Object.fromEntries(currentUrl.searchParams.entries()),
          );

          const shareUrl = new URL(parsed.u);
          if (shareUrl.origin !== currentUrl.origin) {
            return new Response("Invalid share url", { status: 400 });
          }

          const facebookUrl = new URL("https://www.facebook.com/sharer/sharer.php");
          facebookUrl.searchParams.set("u", shareUrl.toString());
          if (parsed.quote) {
            facebookUrl.searchParams.set("quote", parsed.quote);
          }

          return Response.redirect(facebookUrl.toString(), 302);
        } catch {
          return new Response("Bad request", { status: 400 });
        }
      },
    },
  },
});