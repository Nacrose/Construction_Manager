import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { setOrgContext } from "@/lib/rls";
import { assertCanWrite } from "@/lib/authz";
import { ok, handleError, unauthorized, notFound } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";

type Params = { params: Promise<{ itemId: string }> };

const UpdateSchema = z.object({
  title: z.string().optional(),
  type: z.string().optional(),
  discipline: z.string().nullable().optional(),
  status: z.string().optional(),
  revision: z.string().optional(),
  receivedFrom: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const denied = assertSameOrigin(req);
    if (denied) return denied;

    const user = await getCurrentUser(req.headers.get("authorization"));
    if (!user) return unauthorized();

    // RLS context — REST routes bypass the tRPC context builder, so the
    // org context must be set here too (RLS rollout Phase 0, gap G-2).
    await setOrgContext(db, user.organizationId, !!user.isSuperAdmin);

    const { itemId } = await params;
    const item = await db.document.findUnique({ where: { id: itemId }, select: { projectId: true } });
    if (!item) return notFound("Document not found.");
    await assertCanWrite(user, item.projectId);
    const body = await req.json();
    const data = UpdateSchema.parse(body);
    const updated = await db.document.update({ where: { id: itemId }, data });
    return ok({ document: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const denied = assertSameOrigin(req);
    if (denied) return denied;

    const user = await getCurrentUser(req.headers.get("authorization"));
    if (!user) return unauthorized();

    // RLS context — REST routes bypass the tRPC context builder, so the
    // org context must be set here too (RLS rollout Phase 0, gap G-2).
    await setOrgContext(db, user.organizationId, !!user.isSuperAdmin);

    const { itemId } = await params;
    const item = await db.document.findUnique({ where: { id: itemId }, select: { projectId: true } });
    if (!item) return notFound("Document not found.");
    await assertCanWrite(user, item.projectId);
    await db.document.delete({ where: { id: itemId } });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
