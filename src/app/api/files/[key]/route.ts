import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readStoredFile, STORAGE_KEY_PATTERN } from "@/lib/storage";

/**
 * GET /api/files/[key] — authenticated, tenant-isolated file streaming.
 *
 * This is the ONLY way stored files are served (audit C-4 fix):
 * previously files lived in public/uploads/ (or public S3/Blob URLs) and
 * were served to anyone with the link. Now:
 *
 *   1. The caller must have a valid session (cookie or bearer header).
 *   2. The key must match the server-generated format (no traversal).
 *   3. The StoredFile registry must contain the key (fail closed).
 *   4. The caller's org must match the file's owning org (superadmins
 *      may read across orgs for support/impersonation flows).
 *
 * Response headers force `X-Content-Type-Options: nosniff` and
 * `Cache-Control: private` so browsers never sniff content types or
 * cache another tenant's file bytes.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    // 1. Authentication (cookie works for browser <a href> / <img src>).
    const user = await getCurrentUser(req.headers.get("authorization"));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key } = await params;

    // 2. Key format — server-generated keys only, blocks traversal/garbage.
    if (!STORAGE_KEY_PATTERN.test(key)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 3. Registry lookup — fail closed for unregistered files.
    const meta = await db.storedFile.findUnique({ where: { key } });
    if (!meta) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 4. Tenant isolation — same org, or a (non-impersonating) superadmin.
    //    `isSuperAdmin` is already the EFFECTIVE flag (false while
    //    impersonating a tenant org), which is exactly the semantics we want.
    if (!user.isSuperAdmin && user.organizationId !== meta.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const file = await readStoredFile(key);
    if (!file) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const disposition =
      new URL(req.url).searchParams.get("download") === "1" ? "attachment" : "inline";

    return new NextResponse(new Uint8Array(file.body), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Length": String(file.body.byteLength),
        "Content-Disposition": `${disposition}; filename="${(file.fileName || key).replace(/["\\]/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[api/files] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
