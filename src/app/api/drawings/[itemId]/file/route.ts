import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { setOrgContext } from "@/lib/rls";
import { assertProjectMember } from "@/lib/authz";
import { ok, handleError, unauthorized, notFound } from "@/lib/api";

// GET /api/drawings/[itemId]/file — returns the base64 file data for preview
export async function GET(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await getCurrentUser(req.headers.get("authorization"));
    if (!user) return unauthorized();

    // RLS context — REST routes bypass the tRPC context builder, so the
    // org context must be set here too (RLS rollout Phase 0, gap G-2).
    await setOrgContext(db, user.organizationId, !!user.isSuperAdmin);

    const { itemId } = await params;

    const drawing = await db.drawing.findUnique({
      where: { id: itemId },
      select: { id: true, projectId: true, fileData: true, fileName: true, fileType: true },
    });
    if (!drawing) return notFound("Drawing not found.");
    await assertProjectMember(user, drawing.projectId);

    return ok({
      fileData: drawing.fileData,
      fileName: drawing.fileName,
      fileType: drawing.fileType,
    });
  } catch (err) {
    return handleError(err);
  }
}
