import { getSupabase } from "./supabase.js";

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
