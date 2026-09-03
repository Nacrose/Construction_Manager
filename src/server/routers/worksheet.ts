import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertCanWrite, assertProjectMember } from "@/lib/authz";
import { db } from "@/lib/db";
import { protectedProcedure, router } from "@/server/trpc";

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("standalone") }),
  z.object({ kind: z.literal("ipc"), projectId: z.string(), ipcId: z.string() }),
  z.object({ kind: z.literal("variation"), projectId: z.string(), variationId: z.string() }),
]);

const documentIdentitySchema = z.object({
  projectId: z.string(),
  documentKey: z.string().min(1).max(180),
});

function hasWorkbookShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const workbook = value as Record<string, unknown>;
  return (
    typeof workbook.id === "string" &&
    typeof workbook.name === "string" &&
    Array.isArray(workbook.sheetOrder) &&
    !!workbook.sheets &&
    typeof workbook.sheets === "object"
  );
}

async function assertScopeExists(scope: z.infer<typeof scopeSchema>, projectId: string) {
  if (scope.kind === "standalone") return;
  if (scope.projectId !== projectId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Worksheet scope does not match its project." });
  }
  if (scope.kind === "ipc") {
    const ipc = await db.ipc.findFirst({
      where: { id: scope.ipcId, projectId },
      select: { id: true },
    });
    if (!ipc) throw new TRPCError({ code: "NOT_FOUND", message: "IPC worksheet source was not found." });
  }
}

export const worksheetRouter = router({
  get: protectedProcedure
    .input(documentIdentitySchema)
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const document = await db.worksheetDocument.findFirst({
        where: {
          organizationId: ctx.user.organizationId,
          projectId: input.projectId,
          documentKey: input.documentKey,
        },
      });
      return { document };
    }),

  save: protectedProcedure
    .input(documentIdentitySchema.extend({
      title: z.string().trim().min(1).max(180),
      scope: scopeSchema,
      workbook: z.unknown(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await assertScopeExists(input.scope, input.projectId);
      if (!hasWorkbookShape(input.workbook)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid workbook document." });
      }

      const document = await db.worksheetDocument.upsert({
        where: {
          organizationId_documentKey: {
            organizationId: ctx.user.organizationId,
            documentKey: input.documentKey,
          },
        },
        create: {
          organizationId: ctx.user.organizationId,
          projectId: input.projectId,
          documentKey: input.documentKey,
          title: input.title,
          scope: input.scope,
          workbook: input.workbook,
        },
        update: {
          projectId: input.projectId,
          title: input.title,
          scope: input.scope,
          workbook: input.workbook,
          version: { increment: 1 },
        },
      });

      return { document };
    }),
});
