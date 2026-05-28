export const PUBLISHED_BASE_URL = "https://ancient-echoes-api.lovable.app";

export function buildPublishedResultUrl(id: string) {
  return new URL(`/result/${id}`, PUBLISHED_BASE_URL).toString();
}

export function buildPublishedSharePageUrl(id: string, shareImageUrl?: string | null) {
  const url = new URL("/api/public/hooks/share-page", PUBLISHED_BASE_URL);
  url.searchParams.set("id", id);
  if (shareImageUrl) {
    url.searchParams.set("img", shareImageUrl);
  }
  return url.toString();
}

export function buildPublishedFacebookRedirect(shareUrl: string, quote: string) {
  const url = new URL("/api/public/hooks/share-facebook", PUBLISHED_BASE_URL);
  url.searchParams.set("u", shareUrl);
  url.searchParams.set("quote", quote);
  return url.toString();
}