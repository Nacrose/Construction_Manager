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
 * Delete a file by its storage key.
 */
export async function deleteFile(key: string): Promise<void> {
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
    await del(key);
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
