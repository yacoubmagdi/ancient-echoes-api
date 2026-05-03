import { createStart, createMiddleware } from "@tanstack/react-start";

const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next();
  // Attach security headers to every response
  // Note: result is returned as-is; headers are set via the framework
  return result;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
  defaultHeaders: {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.gpteng.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co https://ai.gateway.lovable.dev; connect-src 'self' https://*.supabase.co https://ai.gateway.lovable.dev wss://*.supabase.co; font-src 'self' data:; frame-ancestors 'none';",
  },
}));