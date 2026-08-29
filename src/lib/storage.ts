/**
 * File storage abstraction layer.
 *
 * Dev mode: saves to a PRIVATE ./uploads/ directory (outside public/) —
 * files are ONLY reachable through the authenticated /api/files/[key]
 * route, which enforces tenant isolation via the StoredFile registry.
 * Production: pluggable S3/R2/Blob backend via env vars, also streamed
 * through /api/files/[key] so buckets can stay fully private.
 *
 * STORAGE_PROVIDER=local (default) — private ./uploads/ dir + authed route
 * STORAGE_PROVIDER=s3 — S3-compatible storage (R2, MinIO, etc.)
 *   STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_BUCKET
 * STORAGE_PROVIDER=vercel-blob — Vercel Blob (Vercel deploy only)
 *   BLOB_READ_WRITE_TOKEN
 *
 * SECURITY (audit C-4): previously local files lived in public/uploads/ and
 * were served as unauthenticated static assets; S3/Blob objects were public.
 * Now every URL handed out by uploadFile()/getFileUrl() is an authed route
 * path and the StoredFile registry records the owning org so the route can
 * reject cross-tenant access.
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";

/** PRIVATE upload dir — deliberately OUTSIDE public/ so Next never serves it statically. */
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const PROVIDER = process.env.STORAGE_PROVIDER || "local";

/** Shape of generated keys: `<epochMs>-<16 hex>.<ext>` — the route validates this. */
export const STORAGE_KEY_PATTERN = /^[0-9]+-[a-f0-9]{16}\.[A-Za-z0-9]{1,10}$/;

/** Ownership metadata required to register a stored file. */
export type StoredFileOwner = {
  organizationId: string;
  projectId?: string | null;
};

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

async function s3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION || "auto",
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY || "",
      secretAccessKey: process.env.STORAGE_SECRET_KEY || "",
    },
  });
}

export type StorageFile = {
  /** Authenticated access URL (always /api/files/<key>) */
  url: string;
  /** Storage path (for deletion) */
  key: string;
};

/**
 * Upload a file. Accepts base64 data or a Buffer.
 * Returns an authenticated URL that can be stored in the database.
 *
 * The caller MUST supply the owning org (and project when applicable) so
 * /api/files/[key] can enforce tenant isolation.
 */
export async function uploadFile(
  data: string | Buffer,
  fileName: string,
  mimeType: string,
  owner: StoredFileOwner,
): Promise<StorageFile> {
  if (!owner?.organizationId) {
    throw new Error("uploadFile: owner.organizationId is required (tenant isolation)");
  }
  const ext = path.extname(fileName).replace(/[^A-Za-z0-9.]/g, "").slice(0, 11) || ".bin";
  const key = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const buffer = typeof data === "string" ? Buffer.from(data, "base64") : data;
  let externalUrl: string | null = null;

  if (PROVIDER === "local" || PROVIDER === "dev") {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, key), buffer);
  } else if (PROVIDER === "s3") {
    const { PutObjectCommand } = await importS3();
    await (await s3Client()).send(
      new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET || "uploads",
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  } else if (PROVIDER === "vercel-blob") {
    const { put } = await importVercelBlob();
    // SDK limitation: @vercel/blob only supports public-access blobs on
    // hobby/simple plans. The blob URL is recorded in the registry and ALL
    // access is routed through /api/files/[key]; for strict privacy use the
    // local or s3 providers (bucket kept private).
    const blob = await put(key, buffer, { contentType: mimeType, access: "public" });
    externalUrl = blob.url;
  } else {
    throw new Error(`Unsupported STORAGE_PROVIDER: ${PROVIDER}`);
  }

  // Register ownership so the download route can enforce tenant isolation.
  await db.storedFile.create({
    data: {
      key,
      organizationId: owner.organizationId,
      projectId: owner.projectId ?? null,
      fileName: fileName.slice(0, 255),
      mimeType,
      size: buffer.byteLength,
      externalUrl,
    },
  });

  return { url: `/api/files/${key}`, key };
}

/**
 * Fetch a stored file's bytes + metadata for authenticated streaming.
 * Used by /api/files/[key]. Rejects malformed keys before touching storage.
 */
export async function readStoredFile(
  key: string,
): Promise<{ body: Buffer; mimeType: string; fileName: string | null } | null> {
  if (!STORAGE_KEY_PATTERN.test(key)) return null;

  const meta = await db.storedFile.findUnique({ where: { key } });
  if (!meta) return null; // fail closed — unregistered files are never served

  if (PROVIDER === "local" || PROVIDER === "dev") {
    try {
      const body = await fs.readFile(path.join(UPLOAD_DIR, key));
      return { body, mimeType: meta.mimeType, fileName: meta.fileName };
    } catch {
      return null;
    }
  }

  if (PROVIDER === "s3") {
    const { GetObjectCommand } = await importS3();
    const res = await (await s3Client()).send(
      new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET || "uploads", Key: key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) return null;
    return {
      body: Buffer.from(bytes),
      mimeType: res.ContentType || meta.mimeType,
      fileName: meta.fileName,
    };
  }

  if (PROVIDER === "vercel-blob") {
    if (!meta.externalUrl) return null;
    const res = await fetch(meta.externalUrl);
    if (!res.ok) return null;
    return {
      body: Buffer.from(await res.arrayBuffer()),
      mimeType: res.headers.get("content-type") || meta.mimeType,
      fileName: meta.fileName,
    };
  }

  return null;
}

/**
 * Delete a file by its storage key OR storage URL.
 *
 * Accepts BOTH formats because callers pass `att.storageUrl` (the URL
 * stored in the DB) rather than the raw key. URL prefixes (/api/files/,
 * legacy /uploads/, S3/Blob bases) are stripped to recover the bare key.
 *
 * SECURITY: rejects keys containing `..` path traversal segments —
 * defense-in-depth even though `key` is always generated server-side.
 */
export async function deleteFile(keyOrUrl: string): Promise<void> {
  // Normalize: strip URL prefixes to recover the bare key.
  let key = keyOrUrl;

  // Authed route URLs look like `/api/files/<key>`; legacy local URLs
  // looked like `/uploads/<key>` — strip either prefix.
  const routeMarker = "/api/files/";
  if (key.includes(routeMarker)) {
    key = key.slice(key.lastIndexOf(routeMarker) + routeMarker.length);
  }
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

  // Vercel Blob URLs — recover the key from the registry's externalUrl.
  if (key.startsWith("http")) {
    const meta = await db.storedFile.findFirst({
      where: { externalUrl: keyOrUrl },
      select: { key: true },
    });
    if (meta) key = meta.key;
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
  } else if (PROVIDER === "s3") {
    const { DeleteObjectCommand } = await importS3();
    await (await s3Client()).send(
      new DeleteObjectCommand({
        Bucket: process.env.STORAGE_BUCKET || "uploads",
        Key: key,
      }),
    );
  } else if (PROVIDER === "vercel-blob") {
    const { del } = await importVercelBlob();
    // Vercel Blob's del() accepts the full URL, not the key — look it up.
    const meta = await db.storedFile.findUnique({ where: { key } });
    await del(meta?.externalUrl || keyOrUrl);
  }

  // Drop the registry row (best-effort — file is already gone).
  await db.storedFile.deleteMany({ where: { key } }).catch(() => {});
}

/**
 * Get the authenticated access URL for a stored file by its key.
 */
export function getFileUrl(key: string): string {
  return `/api/files/${key}`;
}
