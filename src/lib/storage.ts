/**
 * File storage abstraction layer.
 *
 * Dev mode: saves to a PRIVATE ./uploads/ directory (outside public/) —
 * files are ONLY reachable through the authenticated /api/files/[key]
 * route, which enforces tenant isolation via the StoredFile registry.
 * Production: S3-compatible object storage (Cloudflare R2), also streamed
 * through /api/files/[key] so buckets can stay fully private.
 *
 * STORAGE_PROVIDER=local (default) — private ./uploads/ dir + authed route
 * STORAGE_PROVIDER=s3 — S3-compatible storage (Cloudflare R2 in production)
 *   STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_BUCKET
 *
 * SECURITY (audit C-4 + follow-up): uploads are validated at the LIBRARY
 * level (every caller, not just routers that remember to check):
 *   - a hard size cap;
 *   - magic-byte sniffing so a file's declared MIME must match its bytes
 *     (blocks HTML/SVG/script disguised as an allowed type — the polyglot
 *     vector that a string-only whitelist cannot catch);
 *   - images are re-encoded via sharp (strip EXIF/ICC/metadata and any
 *     embedded payload), so no script survives in a rendered image;
 *   - the stored MIME is the SAFE normalized type, which is what the
 *     /api/files/[key] route serves.
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";

/** PRIVATE upload dir — deliberately OUTSIDE public/ so Next never serves it statically. */
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const PROVIDER = process.env.STORAGE_PROVIDER || "local";

/** Hard size cap for any single upload (25 MB) — prevents memory/object-store DoS. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Shape of generated keys: `<epochMs>-<16 hex>.<ext>` — the route validates this. */
export const STORAGE_KEY_PATTERN = /^[0-9]+-[a-f0-9]{16}\.[A-Za-z0-9]{1,10}$/;

/** Ownership metadata required to register a stored file. */
export type StoredFileOwner = {
  organizationId: string;
  projectId?: string | null;
};

/** Permitted upload content types (enforced at the library for every caller). */
const ALLOWED_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
  "text/plain",
  "text/csv",
]);

/** What a buffer actually IS, by magic bytes (never by the declared string). */
export type UploadKind =
  | "png" | "jpeg" | "gif" | "webp" | "pdf"
  | "zip" | "ole"        // zip also covers docx/xlsx (PK); ole covers legacy .doc/.xls
  | "text" | "html" | "svg" | "unknown";

/**
 * Identify an upload's real content type from its leading bytes.
 * `"html"` / `"svg"` are returned for the script-bearing payloads that must
 * be rejected regardless of what MIME the caller declared.
 */
export function sniffUploadKind(buf: Buffer): UploadKind {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  const p6 = buf.subarray(0, 6).toString("latin1");
  if (p6 === "GIF87a" || p6 === "GIF89a") return "gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) return "zip"; // PK# (zip/docx/xlsx)
  if (buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "ole"; // OLE2 (.doc/.xls)

  // Script-bearing markers — reject these outright even if declared an
  // allowed type (polyglot / stored-XSS vector).
  const head = buf.subarray(0, 512).toString("latin1").toLowerCase();
  if (head.includes("<svg") || head.includes("<?xml")) return "svg";
  if (head.includes("<script") || head.trimStart().startsWith("<!doctype") || head.trimStart().startsWith("<html")) return "html";
  if (buf.includes(0)) return "unknown"; // NUL byte → binary, unrecognized signature
  return "text";
}

/** Canonical allowed MIME → the sniffed kind we expect it to be. */
const MIME_EXPECTED: Record<string, UploadKind> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "zip",
  "application/vnd.ms-excel": "ole",
  "application/msword": "ole",
  "text/plain": "text",
  "text/csv": "text",
};

const IMAGE_KINDS = ["png", "jpeg", "gif", "webp"] as const;

function family(kind: UploadKind): string {
  return kind === "zip" || kind === "ole" ? "archive" : kind;
}

export type UploadValidation =
  | { ok: true; kind: UploadKind; image: boolean; safeMime: string }
  | { ok: false; reason: string };

/** Normalize the declared MIME (strip params, lowercase). */
export function normalizeMime(declared: string): string {
  return declared.toLowerCase().split(";")[0].trim();
}

/**
 * Validate an upload's declared MIME against its ACTUAL bytes.
 * @returns the real kind + the SAFE MIME to store/serve, or an error reason.
 */
export function validateUploadContent(buf: Buffer, declaredMime: string): UploadValidation {
  const mime = normalizeMime(declaredMime);
  if (!ALLOWED_UPLOAD_MIME.has(mime)) {
    return { ok: false, reason: `File type "${mime}" is not allowed.` };
  }
  const kind = sniffUploadKind(buf);
  if (kind === "html" || kind === "svg") {
    return { ok: false, reason: "File content is not a permitted type (script-bearing HTML/SVG detected)." };
  }
  if (kind === "unknown") {
    return { ok: false, reason: "File content is not a recognized/authorized type." };
  }
  const isImage = (IMAGE_KINDS as readonly string[]).includes(kind);
  if (isImage) {
    if (!mime.startsWith("image/")) {
      return { ok: false, reason: `Content is an image but declared as "${mime}".` };
    }
    const safeMime = kind === "jpeg" ? "image/jpeg" : `image/${kind}`;
    return { ok: true, kind, image: true, safeMime };
  }
  // Non-image: the declared type's expected family must match the bytes.
  const expected = MIME_EXPECTED[mime] ?? "unknown";
  if (family(kind) !== family(expected)) {
    return { ok: false, reason: `Declared "${mime}" but content looks like ${kind}.` };
  }
  return { ok: true, kind, image: false, safeMime: mime };
}

/**
 * Re-encode an image with sharp to strip EXIF/ICC/metadata and any embedded
 * payload — the re-encoded pixels are all that survives, so a polyglot or
 * script-bearing image is neutralized. A pixel cap blocks decompression
 * bombs (a tiny file that declares enormous dimensions).
 */
export async function reencodeImage(buf: Buffer, kind: UploadKind): Promise<{ buffer: Buffer; mime: string }> {
  const { default: sharp } = await import("sharp");
  // sharp strips metadata (EXIF/ICC/comments) by default when re-encoding; we
  // deliberately do NOT call keepMetadata/withMetadata, so any embedded
  // payload is dropped and only the re-encoded pixels survive.
  const pipeline = sharp(buf, { limitInputPixels: 50_000_000, failOn: "error" }).rotate();
  if (kind === "png") return { buffer: await pipeline.png().toBuffer(), mime: "image/png" };
  if (kind === "jpeg") return { buffer: await pipeline.jpeg({ quality: 88 }).toBuffer(), mime: "image/jpeg" };
  if (kind === "webp") return { buffer: await pipeline.webp({ quality: 88 }).toBuffer(), mime: "image/webp" };
  return { buffer: await pipeline.gif().toBuffer(), mime: "image/gif" };
}

/** MIME → extension used both for the storage key and downloaded filename. */
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/msword": "doc",
  "text/plain": "txt",
  "text/csv": "csv",
};

function extForMime(mime: string, fileName: string): string {
  const mapped = MIME_EXT[mime];
  if (mapped) return mapped;
  const fromName = path.extname(fileName).replace(/[^A-Za-z0-9.]/g, "").slice(0, 11);
  return fromName || "bin";
}

async function importS3() {
  try {
    return await import("@aws-sdk/client-s3");
  } catch {
    throw new Error("@aws-sdk/client-s3 is not installed.");
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
 * Validates size + content bytes (rejecting disguised HTML/SVG/polyglots),
 * re-encodes images via sharp, and registers the owning org for tenant
 * isolation. Returns an authenticated URL.
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
  const buffer = typeof data === "string" ? Buffer.from(data, "base64") : data;

  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit.`);
  }

  const check = validateUploadContent(buffer, mimeType);
  if (!check.ok) {
    throw new Error(check.reason);
  }

  let finalBuffer = buffer;
  let safeMime = check.safeMime;
  if (check.image) {
    const re = await reencodeImage(buffer, check.kind);
    finalBuffer = re.buffer;
    safeMime = re.mime;
  }

  const ext = extForMime(safeMime, fileName);
  const key = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;

  if (PROVIDER === "local" || PROVIDER === "dev") {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, key), finalBuffer);
  } else if (PROVIDER === "s3") {
    const { PutObjectCommand } = await importS3();
    await (await s3Client()).send(
      new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET || "uploads",
        Key: key,
        Body: finalBuffer,
        ContentType: safeMime,
      }),
    );
  } else {
    throw new Error(`Unsupported STORAGE_PROVIDER: ${PROVIDER}`);
  }

  await db.storedFile.create({
    data: {
      key,
      organizationId: owner.organizationId,
      projectId: owner.projectId ?? null,
      fileName: fileName.slice(0, 255),
      mimeType: safeMime,
      size: finalBuffer.byteLength,
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

  return null;
}

/**
 * Delete a file by its storage key OR storage URL.
 */
export async function deleteFile(keyOrUrl: string): Promise<void> {
  // Normalize: strip URL prefixes to recover the bare key.
  let key = keyOrUrl;

  const routeMarker = "/api/files/";
  if (key.includes(routeMarker)) {
    key = key.slice(key.lastIndexOf(routeMarker) + routeMarker.length);
  }
  if (key.startsWith("/uploads/")) {
    key = key.slice("/uploads/".length);
  }

  const bucket = process.env.STORAGE_BUCKET || "uploads";
  const bucketMarker = `/${bucket}/`;
  if (key.includes(bucketMarker)) {
    key = key.slice(key.indexOf(bucketMarker) + bucketMarker.length);
  }

  if (key.startsWith("http")) {
    const meta = await db.storedFile.findFirst({
      where: { externalUrl: keyOrUrl },
      select: { key: true },
    });
    if (meta) key = meta.key;
  }

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
  }

  await db.storedFile.deleteMany({ where: { key } }).catch(() => {});
}

/**
 * Get the authenticated access URL for a stored file by its key.
 */
export function getFileUrl(key: string): string {
  return `/api/files/${key}`;
}
