/**
 * Central URL sanitization engine (XSS defense).
 *
 * Every user-supplied URL that is later rendered as a link (href) or as an
 * embeddable document (iframe/img src) MUST pass through `isSafeUrl` /
 * `sanitizeUrl` / `safeUrlSchema`. This is the single choke point for the
 * stored-XSS class of bugs where a `javascript:` URI (or a `data:text/html`
 * payload) is persisted in fields like `scannedBillUrl` / `documentUrl` and
 * executed when another user clicks the rendered link.
 *
 * ALLOWLIST (anything else is rejected):
 *   - `https://…` / `http://…` absolute web links
 *   - `/relative/path` site-relative links (e.g. `/uploads/<key>`)
 *   - `#` fragment-only placeholder
 *   - `data:application/pdf;base64,…` and `data:image/(png|jpeg|gif|webp|bmp|heic);base64,…`
 *     inline scans — the app persists base64 scans from file pickers.
 *
 * BLOCKED (non-exhaustive): javascript:, data:text/html, data:image/svg+xml
 * (scripts inside SVG), vbscript:, file:, blob:, protocol-relative `//host`,
 * backslash tricks (`\\host`), and anything with an unexpected scheme.
 *
 * This module is dependency-free (no zod import at runtime for the pure
 * helpers) so it can be used from both server routers and client components.
 */
import { z } from "zod";

/** Max accepted URL length (inline base64 scans can be a few MB). */
const MAX_URL_LENGTH = 10_000_000;

/** Absolute web links and site-relative paths (never protocol-relative). */
const SAFE_PREFIX = /^(?:https:\/\/|http:\/\/|\/(?!\/|#)|#)/i;

/** Inline base64 documents: PDF scans and raster images only. */
const DATA_URL_PREFIX =
  /^data:(application\/pdf|image\/(?:png|jpe?g|gif|webp|bmp|heic));base64,/i;

/** Base64 body alphabet (padding + embedded whitespace tolerated). */
const BASE64_BODY = /^[a-z0-9+/=\s]*$/i;

/**
 * Returns true when the URL is safe to render as href / src.
 * Allowlist-based: unknown schemes fail closed.
 */
export function isSafeUrl(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim();
  if (!v || v.length > MAX_URL_LENGTH) return false;

  if (SAFE_PREFIX.test(v)) return true;

  if (DATA_URL_PREFIX.test(v)) {
    const commaIdx = v.indexOf(",");
    if (commaIdx < 0) return false;
    return BASE64_BODY.test(v.slice(commaIdx + 1));
  }

  return false;
}

/**
 * Returns the trimmed URL when safe, otherwise null.
 * Use at every render sink: `href={sanitizeUrl(x) ?? "#"}`
 */
export function sanitizeUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return isSafeUrl(v) ? v : null;
}

/**
 * Zod schema for URL inputs on tRPC mutations.
 * Replaces `z.string()` for every field that is later rendered as a link.
 * Empty strings fail (use `.optional()` / `.nullable()` for optional fields).
 */
export const safeUrlSchema = z
  .string()
  .refine(isSafeUrl, {
    message:
      "Invalid URL: must be an http(s) link, a site-relative path, or an inline PDF/image scan",
  });

/**
 * Optional Zod schema for URL inputs — accepts null/undefined/empty string.
 */
export const optionalSafeUrlSchema = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : undefined))
  .refine((v) => !v || isSafeUrl(v), {
    message:
      "Invalid URL: must be an http(s) link, a site-relative path, or an inline PDF/image scan",
  });
