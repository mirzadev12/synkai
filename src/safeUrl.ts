/**
 * Canvas items carry URLs that came out of the shared Liveblocks document, so
 * the value was written by whoever else is in the room — not by this client.
 * Anything the room can write eventually reaches an `href` or an `src`, and a
 * `javascript:` URL in an `href` runs on click, in this app's origin.
 *
 * Uploads always produce an https Supabase URL, so this rejects nothing a real
 * upload creates. Legacy `data:` images (written before uploads moved to
 * storage) are still allowed for images only, so old canvases keep rendering.
 */
function protocolOf(url: string): string | null {
  try {
    // A relative URL is fine — it resolves against this origin.
    return new URL(url, window.location.origin).protocol;
  } catch {
    return null;
  }
}

/** Safe to put in an `href`. */
export function safeLinkUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const protocol = protocolOf(url);
  return protocol === "https:" || protocol === "http:" ? url : null;
}

/** Safe to put in an `<img src>`; also permits the legacy data-URL images. */
export function safeImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  return safeLinkUrl(url);
}
