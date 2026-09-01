/**
 * Canonical Domain Router Factory for Construction Manager
 *
 * Produces standard CRUD, IDOR-guarded, and lifecycle-transitioned tRPC routers
 * with built-in multi-tenant organization context, audit events, and fiscal lock checks.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db, type DbTxClient } from "@/lib/db";
import {
  assertProjectMember,
  assertCanWrite,
  assertProjectAdmin,
  assertProjectManager,
  type ProjectRole,
} from "@/lib/authz";
import { audit } from "@/lib/audit";
import {
  transitionEntityState,
  type SupportedLifecycleModel,
} from "./state-machine";

export interface DomainRouterConfig<
  TCreateInput extends Record<string, any>,
  TUpdateInput extends Record<string, any> = Record<string, any>,
> {
  model: SupportedLifecycleModel;
  modelDelegateName?: string;
  auditEntityType?: string;

  /** Roles required for actions */
  roles?: {
    list?: "member" | "write" | "admin" | "manager";
    get?: "member" | "write" | "admin" | "manager";
    create?: "write" | "admin" | "manager";
    update?: "write" | "admin" | "manager";
    delete?: "write" | "admin" | "manager";
    transition?: "write" | "admin" | "manager";
  };

  /** Zod Schemas */
  schemas: {
    create: z.ZodType<TCreateInput>;
    update?: z.ZodType<TUpdateInput>;
    listFilter?: z.ZodType<Record<string, any>>;
  };

  /** Custom Query & Mutation Hooks */
  hooks?: {
    buildListWhere?: (input: any, ctx: any) => Record<string, any>;
    buildOrderBy?: (input: any) => any;
    getIncludes?: () => any;
    beforeCreate?: (ctx: any, input: TCreateInput) => Promise<Record<string, any>> | Record<string, any>;
    afterCreate?: (ctx: any, entity: any) => Promise<void> | void;
    beforeDelete?: (ctx: any, entity: any, tx: DbTxClient) => Promise<void> | void;
    afterTransition?: (ctx: any, result: any, tx: DbTxClient) => Promise<void> | void;
  };
}

async function assertRole(user: any, projectId: string, role: "member" | "write" | "admin" | "manager" = "member"): Promise<ProjectRole> {
  if (role === "manager") return assertProjectManager(user, projectId);
  if (role === "admin") return assertProjectAdmin(user, projectId);
  if (role === "write") return assertCanWrite(user, projectId);
  return assertProjectMember(user, projectId);
}

export function createDomainRouter<
  TCreateInput extends Record<string, any>,
  TUpdateInput extends Record<string, any> = Record<string, any>,
>(config: DomainRouterConfig<TCreateInput, TUpdateInput>) {
  const {
    model,
    modelDelegateName = model,
    auditEntityType = model,
    roles = {},
    schemas,
    hooks = {},
  } = config;

  const getDelegate = (txOrDb: any = db) => {
    const delegate = txOrDb[modelDelegateName] || txOrDb[model];
    if (!delegate) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Database delegate for '${modelDelegateName}' not found.`,
      });
    }
    return delegate;
  };

  return router({
    /** List entities with project scoping and optional filters */
    list: protectedProcedure
      .input(
        (schemas.listFilter || z.object({ projectId: z.string() })).and(
          z.object({
            projectId: z.string(),
            status: z.string().optional(),
            q: z.string().optional(),
          })
        )
      )
      .query(async ({ ctx, input }) => {
        await assertRole(ctx.user, input.projectId, roles.list || "member");
        const delegate = getDelegate(db);

        let where: Record<string, any> = { projectId: input.projectId };
        if (input.status && input.status !== "all") {
          where.status = input.status;
        }

        if (hooks.buildListWhere) {
          where = { ...where, ...hooks.buildListWhere(input, ctx) };
        }

        const items = await delegate.findMany({
          where,
          orderBy: hooks.buildOrderBy ? hooks.buildOrderBy(input) : { createdAt: "desc" },
          include: hooks.getIncludes ? hooks.getIncludes() : undefined,
        });

        return { items };
      }),

    /** Get single record with project IDOR guard */
    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const delegate = getDelegate(db);
        const entity = await delegate.findUnique({
          where: { id: input.id },
          include: hooks.getIncludes ? hooks.getIncludes() : undefined,
        });

        if (!entity) {
          throw new TRPCError({ code: "NOT_FOUND", message: `${model} record not found.` });
        }

        if (entity.projectId) {
          await assertRole(ctx.user, entity.projectId, roles.get || "member");
        }

        return { item: entity };
      }),

    /** Create record with attribution and audit logging */
    create: protectedProcedure
      .input(schemas.create)
      .mutation(async ({ ctx, input }) => {
        const projectId = (input as any).projectId;
        if (!projectId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "projectId is required in create input." });
        }

        await assertRole(ctx.user, projectId, roles.create || "write");

        const customData = hooks.beforeCreate
          ? await hooks.beforeCreate(ctx, input as any)
          : input;


        const delegate = getDelegate(db);
        const entity = await delegate.create({
          data: {
            ...customData,
            createdById: ctx.user.id,
          },
        });

        await audit({
          userId: ctx.user.id,
          projectId,
          action: `${auditEntityType}.create`,
          entityType: auditEntityType,
          entityId: entity.id,
          metadata: { id: entity.id, ...(entity.number ? { number: entity.number } : {}) },
        });

        if (hooks.afterCreate) {
          await hooks.afterCreate(ctx, entity);
        }

        return { item: entity };
      }),

    /** State machine transition endpoint */
    transition: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          targetState: z.string(),
          notes: z.string().optional(),
          additionalData: z.record(z.string(), z.any()).optional(),

        })
      )
      .mutation(async ({ ctx, input }) => {
        const delegate = getDelegate(db);
        const entity = await delegate.findUnique({
          where: { id: input.id },
          select: { id: true, projectId: true, status: true },
        });

        if (!entity) {
          throw new TRPCError({ code: "NOT_FOUND", message: `${model} record not found.` });
        }

        if (entity.projectId) {
          await assertRole(ctx.user, entity.projectId, roles.transition || "write");
        }

        const result = await transitionEntityState(db, {
          model,
          id: input.id,
          targetState: input.targetState,
          userId: ctx.user.id,
          userName: ctx.user.name,
          notes: input.notes,
          additionalData: input.additionalData,
          projectId: entity.projectId || undefined,
        });

        await audit({
          userId: ctx.user.id,
          projectId: entity.projectId,
          action: `${auditEntityType}.${input.targetState}`,
          entityType: auditEntityType,
          entityId: input.id,
          metadata: { fromState: result.previousState, toState: result.currentState },
        });

        return result;
      }),

    /** Delete record with project check */
    delete: protectedProcedure
      .input(z.object({ id: z.string(), projectId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertRole(ctx.user, input.projectId, roles.delete || "write");

        const delegate = getDelegate(db);
        const existing = await delegate.findFirst({
          where: { id: input.id, projectId: input.projectId },
        });

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: `${model} record not found in this project.` });
        }

        if (hooks.beforeDelete) {
          await hooks.beforeDelete(ctx, existing, db);
        }

        await delegate.delete({ where: { id: input.id } });

        await audit({
          userId: ctx.user.id,
          projectId: input.projectId,
          action: `${auditEntityType}.delete`,
          entityType: auditEntityType,
          entityId: input.id,
        });

        return { success: true };
      }),
  });
}
