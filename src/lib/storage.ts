/**
 * File storage abstraction layer.
 *
 * Dev mode: saves to public/uploads/ via filesystem.
 * Production: pluggable S3/R2/Blob backend via env vars.
 *
 * STORAGE_PROVIDER=local (default) — saves to public/uploads/
 * STORAGE_PROVIDER=s3 — uses S3-compatible storage (R2, MinIO, etc.)
 *   STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_BUCKET
 * STORAGE_PROVIDER=vercel-blob — uses Vercel Blob (Vercel deploy only)
 *   BLOB_READ_WRITE_TOKEN
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const PROVIDER = process.env.STORAGE_PROVIDER || "local";

async function importS3() {
  try {
    return await import("@aws-sdk/client-s3");
  } catch {
    throw new Error("@aws-sdk/client-s3 is not installed.");
  }
}

async function importVercelBlob() {
  try {
    return await import("@vercel/blob");
  } catch {
    throw new Error("@vercel/blob is not installed.");
  }
}

export type StorageFile = {
  /** Public URL to access the file */
  url: string;
  /** Storage path (for deletion) */
  key: string;
};

/**
 * Upload a file. Accepts base64 data or a Buffer.
 * Returns a URL that can be stored in the database.
 */
export async function uploadFile(
  data: string | Buffer,
  fileName: string,
  mimeType: string,
): Promise<StorageFile> {
  const ext = path.extname(fileName) || ".bin";
  const key = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;

  if (PROVIDER === "local" || PROVIDER === "dev") {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const filePath = path.join(UPLOAD_DIR, key);
    const buffer = typeof data === "string" ? Buffer.from(data, "base64") : data;
    await fs.writeFile(filePath, buffer);
    return { url: `/uploads/${key}`, key };
  }

  if (PROVIDER === "s3") {
    const { S3Client, PutObjectCommand } = await importS3();
    const client = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION || "auto",
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY || "",
        secretAccessKey: process.env.STORAGE_SECRET_KEY || "",
      },
    });
    const buffer = typeof data === "string" ? Buffer.from(data, "base64") : data;
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET || "uploads",
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    const endpoint = process.env.STORAGE_ENDPOINT?.replace(/\/+$/, "");
    return { url: `${endpoint}/${process.env.STORAGE_BUCKET || "uploads"}/${key}`, key };
  }

  if (PROVIDER === "vercel-blob") {
    const { put } = await importVercelBlob();
    const buffer = typeof data === "string" ? Buffer.from(data, "base64") : data;
    const blob = await put(key, buffer, { contentType: mimeType, access: "public" });
    return { url: blob.url, key };
  }

  throw new Error(`Unsupported STORAGE_PROVIDER: ${PROVIDER}`);
}

/**
 * Delete a file by its storage key OR storage URL.
 *
 * Accepts BOTH formats because callers pass `att.storageUrl` (the URL
 * stored in the DB) rather than the raw key. Previously this function
 * expected a bare key (e.g. `1234567890-abcdef.bin`) but received a
 * URL (e.g. `/uploads/1234567890-abcdef.bin`), causing `path.join` to
 * produce a nested non-existent path — the `try/catch` silently
 * swallowed the error, so orphaned files were NEVER deleted.
 *
 * This function normalizes the input: if it starts with `/uploads/`
 * (local) or matches the S3/Vercel URL prefix, the prefix is stripped
 * to recover the bare key.
 *
 * SECURITY: rejects keys containing `..` path traversal segments —
 * defense-in-depth even though `key` is always generated server-side.
 */
export async function deleteFile(keyOrUrl: string): Promise<void> {
  // Normalize: strip URL prefixes to recover the bare key.
  let key = keyOrUrl;

  // Local storage URLs look like `/uploads/<key>` — strip the prefix.
  if (key.startsWith("/uploads/")) {
    key = key.slice("/uploads/".length);
  }

  // S3 URLs look like `<endpoint>/<bucket>/<key>` — strip everything
  // up to and including the bucket name. We use the configured bucket
  // name to find the split point.
  const bucket = process.env.STORAGE_BUCKET || "uploads";
  const bucketMarker = `/${bucket}/`;
  if (key.includes(bucketMarker)) {
    key = key.slice(key.indexOf(bucketMarker) + bucketMarker.length);
  }

  // Defense-in-depth: reject path traversal attempts. Even though
  // `key` is generated server-side by `uploadFile` (and should always
  // be safe), this guard prevents a future code change from
  // accidentally introducing a path-traversal vulnerability.
  if (key.includes("..")) {
    console.error("[storage] deleteFile: rejecting key with path traversal:", key);
    return;
  }

  if (PROVIDER === "local" || PROVIDER === "dev") {
    const filePath = path.join(UPLOAD_DIR, key);
    try { await fs.unlink(filePath); } catch { /* file may not exist */ }
    return;
  }

  if (PROVIDER === "s3") {
    const { S3Client, DeleteObjectCommand } = await importS3();
    const client = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION || "auto",
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY || "",
        secretAccessKey: process.env.STORAGE_SECRET_KEY || "",
      },
    });
    await client.send(
      new DeleteObjectCommand({
        Bucket: process.env.STORAGE_BUCKET || "uploads",
        Key: key,
      }),
    );
    return;
  }

  if (PROVIDER === "vercel-blob") {
    const { del } = await importVercelBlob();
    // Vercel Blob's del() accepts the full URL, not the key — pass
    // the original input (which should be the URL for blob storage).
    await del(keyOrUrl);
    return;
  }
}

/**
 * Get the public URL for a stored file by its key.
 */
export function getFileUrl(key: string): string {
  if (PROVIDER === "local" || PROVIDER === "dev") {
    return `/uploads/${key}`;
  }
  if (PROVIDER === "s3") {
    const endpoint = process.env.STORAGE_ENDPOINT?.replace(/\/+$/, "");
    return `${endpoint}/${process.env.STORAGE_BUCKET || "uploads"}/${key}`;
  }
  return `/uploads/${key}`;
}
