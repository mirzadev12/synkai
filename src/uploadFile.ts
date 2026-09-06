/**
 * Upload a file to Supabase Storage from the browser.
 *
 * The API only mints a one-time signed URL; the bytes go browser → Supabase
 * directly. Routing them through the serverless function would cap uploads at
 * Vercel Hobby's 4.5MB request-body limit.
 */
export type UploadedFile = {
  url: string;
  path: string;
};

export async function uploadFile(
  workspaceId: string,
  file: File,
): Promise<UploadedFile> {
  const ticketRes = await fetch("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "upload-url",
      workspaceId,
      fileName: file.name,
      size: file.size,
    }),
  });
  const ticket = (await ticketRes.json()) as Record<string, unknown>;
  if (!ticketRes.ok) {
    throw new Error(
      typeof ticket.error === "string" ? ticket.error : "Could not start upload",
    );
  }

  const signedUrl = String(ticket.signedUrl ?? "");
  if (!signedUrl) throw new Error("Upload URL missing");

  const put = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status})`);
  }

  return { url: String(ticket.publicUrl ?? ""), path: String(ticket.path ?? "") };
}
