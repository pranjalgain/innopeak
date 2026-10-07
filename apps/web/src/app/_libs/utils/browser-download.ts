/** Saves a `Blob` via a throwaway `<a download>`; the file is generated per request so there is no URL to open. */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Deferred, not revoked inline: a browser that defers the fetch to a later task (Safari has) would
  // find the blob URL dead and drop the download silently.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Reads the server-chosen filename; the same-origin rewrite (see `apiConfig`) keeps the header readable without CORS `exposedHeaders`. */
export function filenameFromContentDisposition(contentDisposition: unknown, fallback: string): string {
  const match =
    typeof contentDisposition === "string" ? /filename="([^"]+)"/.exec(contentDisposition) : null;
  return match?.[1] ?? fallback;
}
