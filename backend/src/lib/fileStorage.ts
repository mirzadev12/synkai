import { getSupabase } from "./supabase.js";
import { isWorkspaceId } from "./roomIdentity.js";

export const FILES_BUCKET = "canvas-files";

/** Supabase free tier is 1GB of storage; keep any single file well under it. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

let bucketChecked = false;

/**
 * Create the storage bucket on first use so there is no manual dashboard step.
 *
 * The bucket is PUBLIC: paths embed a uuid, so URLs are unguessable, and it
 * means a file's URL can live in the Liveblocks document and keep working for
 * everyone. The trade-off is that anyone who obtains a URL can read it forever.
 * To tighten this, make the bucket private and mint short-lived signed download
 * URLs per view instead of storing publicUrl on the canvas item.
 */
async function ensureBucket(): Promise<void> {
  if (bucketChecked) return;
  const supabase = getSupabase();
  const { data } = await supabase.storage.getBucket(FILES_BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(FILES_BUCKET, {
      public: true,
      fileSizeLimit: MAX_FILE_BYTES,
    });
    // A parallel request may have created it first; that is not a failure.
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`createBucket failed: ${error.message}`);
    }
  }
  bucketChecked = true;
}

/** Keep the stored name filesystem-safe without losing the extension. */
function safeName(name: string): string {
  const cleaned = name
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(-80);
  return cleaned || "file";
}

/**
 * Extensions refused because the bucket is public: anything the browser will
 * execute or render as a document gets a live, shareable URL on the Supabase
 * origin, which turns the uploader into a free host for phishing pages and
 * stored scripts. Blocking them at ticket time is cheaper than making the
 * bucket private, which would break every file URL already on a canvas.
 */
const BLOCKED_EXTENSIONS = new Set([
  "html", "htm", "xhtml", "shtml", "svg", "xml", "xsl",
  "js", "mjs", "cjs", "jsx", "wasm",
  "exe", "dll", "msi", "bat", "cmd", "com", "scr", "ps1",
  "sh", "jar", "app", "apk", "deb", "dmg", "pkg",
  "php", "phtml", "asp", "aspx", "jsp", "cgi", "py", "rb",
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function uploadRejectionReason(fileName: string): string | null {
  const trimmed = fileName.trim();
  if (!trimmed) return "File name is required";
  if (trimmed.length > 200) return "File name is too long";
  if (BLOCKED_EXTENSIONS.has(extensionOf(trimmed))) {
    return "That file type can't be uploaded here";
  }
  return null;
}

export type UploadTicket = {
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
};

/**
 * A one-time URL the browser uploads straight to Supabase with.
 *
 * Deliberately not proxying bytes through the API: Vercel Hobby caps a request
 * body at 4.5MB, so routing uploads through the function would cap files far
 * below the bucket's own limit.
 */
export async function createUploadTicket(args: {
  workspaceId: string;
  fileName: string;
}): Promise<UploadTicket> {
  if (!isWorkspaceId(args.workspaceId)) {
    // The workspace id is the storage path prefix, so an unchecked one lets a
    // caller scatter objects anywhere in the bucket.
    throw new Error("Invalid workspaceId");
  }
  const rejection = uploadRejectionReason(args.fileName);
  if (rejection) throw new Error(rejection);

  await ensureBucket();
  const supabase = getSupabase();

  const path = `${args.workspaceId}/${crypto.randomUUID()}-${safeName(args.fileName)}`;

  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(
      `createSignedUploadUrl failed: ${error?.message ?? "no data"}`,
    );
  }

  const { data: pub } = supabase.storage
    .from(FILES_BUCKET)
    .getPublicUrl(path);

  return {
    path,
    signedUrl: data.signedUrl,
    token: data.token,
    publicUrl: pub.publicUrl,
  };
}
