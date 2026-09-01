import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { withOrgContext } from "@/lib/rls";
import { Prisma } from "@prisma/client";
import { adToBs } from "@/lib/nepali-calendar";
import { transitionEntityState } from "@/server/utils/state-machine";

export const interSiteTransferRouter = router({
  // ── 1. List Material & Equipment Transfers ────────────────────
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        status: z.enum(["all", "dispatched", "in_transit", "received", "cancelled"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is not assigned to an organization" });
      }

      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
      }

      const where: Prisma.InterSiteTransferWhereInput = {
        organizationId: orgId,
        ...(input.projectId
          ? {
              OR: [{ originProjectId: input.projectId }, { destinationProjectId: input.projectId }],
            }
          : {}),
        ...(input.status && input.status !== "all" ? { status: input.status } : {}),
      };

      const transfers = await db.interSiteTransfer.findMany({
        where,
        include: {
          material: { select: { id: true, name: true, unit: true, category: true } },
          originProject: { select: { id: true, name: true, code: true } },
          destinationProject: { select: { id: true, name: true, code: true } },
          originStoreLocation: { select: { id: true, name: true } },
          destinationStoreLocation: { select: { id: true, name: true } },
          dispatchedBy: { select: { id: true, name: true, email: true } },
          receivedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return { transfers };
    }),

  // ── 2. Transfer Material (Instant 1-Click or 2-Step Handshake) ──
  transferMaterial: protectedProcedure
    .input(
      z.object({
        originProjectId: z.string().min(1),
        destinationProjectId: z.string().min(1),
        materialId: z.string().min(1),
        quantity: z.number().positive(),
        transferRate: z.number().nonnegative().default(0),
        originStoreLocationId: z.string().optional().nullable(),
        destinationStoreLocationId: z.string().optional().nullable(),
        isInstantTransfer: z.boolean().default(true),
        vehicleNo: z.string().optional().nullable(),
        driverName: z.string().optional().nullable(),
        chalanNo: z.string().optional().nullable(),
        remarks: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is not assigned to an organization" });
      }

      if (input.originProjectId === input.destinationProjectId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Origin and Destination projects cannot be identical." });
      }

      await assertProjectMember(ctx.user, input.originProjectId);
      await assertCanWrite(ctx.user, input.originProjectId);
      await assertNotLocked(orgId, new Date());

      if (input.isInstantTransfer) {
        await assertProjectMember(ctx.user, input.destinationProjectId);
        await assertNotLocked(orgId, new Date());
      }

      // Generate sequence transfer number
      const count = await db.interSiteTransfer.count({ where: { organizationId: orgId } });
      const transferNo = `ITC-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
      const now = new Date();
      const miti = adToBs(now).formatted;

      return db.$transaction(async (tx) => {
        await withOrgContext(tx, orgId, !!ctx.user.isSuperAdmin);
        // 1. Fetch origin material
          const originMat = await tx.material.findUnique({
            where: { id: input.materialId },
          });
          if (!originMat || originMat.projectId !== input.originProjectId) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Origin material not found." });
          }

          const transferRate = input.transferRate > 0 ? input.transferRate : Number(originMat.minStock || 0);
          const totalAmount = new Prisma.Decimal(input.quantity).mul(transferRate);

          // 2. Decrement origin material stock
          await tx.material.update({
            where: { id: originMat.id },
            data: {
              currentStock: { decrement: input.quantity },
            },
          });

          // If store location specified, decrement store stock
          if (input.originStoreLocationId) {
            await tx.materialStoreStock.upsert({
              where: {
                materialId_storeLocationId: {
                  materialId: originMat.id,
                  storeLocationId: input.originStoreLocationId,
                },
              },
              create: {
                materialId: originMat.id,
                storeLocationId: input.originStoreLocationId,
                currentStock: -input.quantity,
              },
              update: {
                currentStock: { decrement: input.quantity },
              },
            });
          }

          // 3. Create outbound MaterialTransaction on Origin Project
          await tx.materialTransaction.create({
            data: {
              projectId: input.originProjectId,
              materialId: originMat.id,
              type: "transfer",
              quantity: new Prisma.Decimal(input.quantity),
              unit: originMat.unit,
              rate: new Prisma.Decimal(transferRate),
              reference: transferNo,
              remarks: `Inter-Site Transfer OUT to project. ${input.remarks || ""}`,
              date: now,
              createdById: ctx.user.id,
              storeLocationId: input.originStoreLocationId || null,
            },
          });

          // 4. If Instant Transfer: Immediately receive at Destination Project
          if (input.isInstantTransfer) {
            // Find or create matching material on destination project
            let destMat = await tx.material.findFirst({
              where: {
                projectId: input.destinationProjectId,
                name: { equals: originMat.name, mode: "insensitive" },
                unit: originMat.unit,
              },
            });

            if (!destMat) {
              destMat = await tx.material.create({
                data: {
                  projectId: input.destinationProjectId,
                  name: originMat.name,
                  code: originMat.code,
                  category: originMat.category,
                  subCategory: originMat.subCategory,
                  unit: originMat.unit,
                  currentStock: input.quantity,
                  minStock: originMat.minStock,
                  catalogMaterialId: originMat.catalogMaterialId,
                },
              });
            } else {
              await tx.material.update({
                where: { id: destMat.id },
                data: {
                  currentStock: { increment: input.quantity },
                },
              });
            }

            // If destination store location specified, increment store stock
            if (input.destinationStoreLocationId) {
              await tx.materialStoreStock.upsert({
                where: {
                  materialId_storeLocationId: {
                    materialId: destMat.id,
                    storeLocationId: input.destinationStoreLocationId,
                  },
                },
                create: {
                  materialId: destMat.id,
                  storeLocationId: input.destinationStoreLocationId,
                  currentStock: input.quantity,
                },
                update: {
                  currentStock: { increment: input.quantity },
                },
              });
            }

            // Create inbound MaterialTransaction on Destination Project
            await tx.materialTransaction.create({
              data: {
                projectId: input.destinationProjectId,
                materialId: destMat.id,
                type: "transfer",
                quantity: new Prisma.Decimal(input.quantity),
                unit: originMat.unit,
                rate: new Prisma.Decimal(transferRate),
                reference: transferNo,
                remarks: `Inter-Site Transfer IN from project. ${input.remarks || ""}`,
                date: now,
                createdById: ctx.user.id,
                storeLocationId: input.destinationStoreLocationId || null,
              },
            });

            // Dual internal cost entries (Cost credit on origin, cost debit on destination)
            if (totalAmount.gt(0)) {
              await tx.projectCost.create({
                data: {
                  projectId: input.originProjectId,
                  category: "material",
                  amount: totalAmount.negated(), // Credit (cost reduction)
                  description: `Internal Transfer Credit: ${originMat.name} (${input.quantity} ${originMat.unit}) to ${transferNo}`,
                  date: now,
                  createdById: ctx.user.id,
                },
              });

              await tx.projectCost.create({
                data: {
                  projectId: input.destinationProjectId,
                  category: "material",
                  amount: totalAmount, // Debit (cost addition)
                  description: `Internal Transfer Debit: ${originMat.name} (${input.quantity} ${originMat.unit}) from ${transferNo}`,
                  date: now,
                  createdById: ctx.user.id,
                },
              });
            }
          }

          // 5. Create InterSiteTransfer Record
          const transferRecord = await tx.interSiteTransfer.create({
            data: {
              transferNo,
              organizationId: orgId,
              originProjectId: input.originProjectId,
              destinationProjectId: input.destinationProjectId,
              materialId: originMat.id,
              quantity: new Prisma.Decimal(input.quantity),
              unit: originMat.unit,
              transferRate: new Prisma.Decimal(transferRate),
              totalAmount,
              originStoreLocationId: input.originStoreLocationId || null,
              destinationStoreLocationId: input.destinationStoreLocationId || null,
              isInstantTransfer: input.isInstantTransfer,
              status: input.isInstantTransfer ? "received" : "in_transit",
              dispatchDate: now,
              dispatchMiti: miti,
              dispatchedById: ctx.user.id,
              vehicleNo: input.vehicleNo || null,
              driverName: input.driverName || null,
              chalanNo: input.chalanNo || null,
              receivedDate: input.isInstantTransfer ? now : null,
              receivedMiti: input.isInstantTransfer ? miti : null,
              receivedById: input.isInstantTransfer ? ctx.user.id : null,
              receivedQty: input.isInstantTransfer ? new Prisma.Decimal(input.quantity) : null,
              damageLossQty: new Prisma.Decimal(0),
              remarks: input.remarks || null,
            },
          });

          return transferRecord;
      });
    }),

  // ── 3. Receive In-Transit Transfer (Destination Site Acknowledgment) ──
  receiveMaterial: protectedProcedure
    .input(
      z.object({
        transferId: z.string().min(1),
        receivedQty: z.number().positive(),
        damageLossQty: z.number().nonnegative().default(0),
        destinationStoreLocationId: z.string().optional().nullable(),
        remarks: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is not assigned to an organization" });
      }

      const transfer = await db.interSiteTransfer.findUnique({
        where: { id: input.transferId },
        include: { material: true, originProject: true, destinationProject: true },
      });

      if (!transfer || transfer.organizationId !== orgId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transfer order not found." });
      }

      if (transfer.status !== "in_transit" && transfer.status !== "dispatched") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Transfer is already in status: ${transfer.status}` });
      }

      await assertProjectMember(ctx.user, transfer.destinationProjectId);
      await assertCanWrite(ctx.user, transfer.destinationProjectId);
      await assertNotLocked(orgId, new Date());

      const now = new Date();
      const miti = adToBs(now).formatted;

      return db.$transaction(async (tx) => {
        await withOrgContext(tx, orgId, !!ctx.user.isSuperAdmin);
        // 1. Find or create matching material at destination project
        let destMat = await tx.material.findFirst({
          where: {
            projectId: transfer.destinationProjectId,
            name: { equals: transfer.material.name, mode: "insensitive" },
            unit: transfer.unit,
          },
        });

        if (!destMat) {
          destMat = await tx.material.create({
            data: {
              projectId: transfer.destinationProjectId,
              name: transfer.material.name,
              code: transfer.material.code,
              category: transfer.material.category,
              subCategory: transfer.material.subCategory,
              unit: transfer.unit,
              currentStock: input.receivedQty,
              minStock: transfer.material.minStock,
              catalogMaterialId: transfer.material.catalogMaterialId,
            },
          });
        } else {
          await tx.material.update({
            where: { id: destMat.id },
            data: {
              currentStock: { increment: input.receivedQty },
            },
          });
        }

        // 2. Increment store location stock if specified
        const storeId = input.destinationStoreLocationId || transfer.destinationStoreLocationId;
        if (storeId) {
          await tx.materialStoreStock.upsert({
            where: {
              materialId_storeLocationId: {
                materialId: destMat.id,
                storeLocationId: storeId,
              },
            },
            create: {
              materialId: destMat.id,
              storeLocationId: storeId,
              currentStock: input.receivedQty,
            },
            update: {
              currentStock: { increment: input.receivedQty },
            },
          });
        }

        // 3. Create destination MaterialTransaction
        await tx.materialTransaction.create({
          data: {
            projectId: transfer.destinationProjectId,
            materialId: destMat.id,
            type: "transfer",
            quantity: new Prisma.Decimal(input.receivedQty),
            unit: transfer.unit,
            rate: transfer.transferRate,
            reference: transfer.transferNo,
            remarks: `Inbound GRN receipt from ${transfer.originProject.name}. ${input.remarks || ""}`,
            date: now,
            createdById: ctx.user.id,
            storeLocationId: storeId || null,
          },
        });

        // 4. Project cost debit for received quantity
        const receivedAmount = new Prisma.Decimal(input.receivedQty).mul(transfer.transferRate);
        if (receivedAmount.gt(0)) {
          await tx.projectCost.create({
            data: {
              projectId: transfer.destinationProjectId,
              category: "material",
              amount: receivedAmount,
              description: `Internal Transfer Debit: ${transfer.material.name} (${input.receivedQty} ${transfer.unit}) from ${transfer.transferNo}`,
              date: now,
              createdById: ctx.user.id,
            },
          });
        }

        // 5. Update transfer record — engine transition: validates the
        // dispatched/in_transit→received edge and CAS-claims the row, so a
        // double-receive race fails CONFLICT instead of double-posting the
        // destination stock and the debit journal entry above. receivedById
        // rides additionalData (the engine reserves *_ById for its own
        // attribution fields only on approved/rejected/submitted).
        const { entity: updated } = await transitionEntityState(tx, {
          model: "interSiteTransfer",
          id: transfer.id,
          targetState: "received",
          userId: ctx.user.id,
          userName: ctx.user.name,
          projectId: transfer.destinationProjectId,
          additionalData: {
            receivedDate: now,
            receivedMiti: miti,
            receivedById: ctx.user.id,
            receivedQty: new Prisma.Decimal(input.receivedQty),
            damageLossQty: new Prisma.Decimal(input.damageLossQty),
            destinationStoreLocationId: storeId || null,
            remarks: input.remarks ? `${transfer.remarks ? transfer.remarks + " | " : ""}${input.remarks}` : transfer.remarks,
          },
        });

        return updated;
      });
    }),

  // ── 4. Transfer Equipment / Machinery ──────────────────────────
  transferEquipment: protectedProcedure
    .input(
      z.object({
        equipmentId: z.string().min(1),
        originProjectId: z.string().min(1),
        destinationProjectId: z.string().min(1),
        chalanNo: z.string().optional().nullable(),
        vehicleNo: z.string().optional().nullable(),
        driverName: z.string().optional().nullable(),
        transporterName: z.string().optional().nullable(),
        meterAtDispatch: z.number().nonnegative().optional().nullable(),
        meterAtReceive: z.number().nonnegative().optional().nullable(),
        freightCost: z.number().nonnegative().default(0),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is not assigned to an organization" });
      }

      if (input.originProjectId === input.destinationProjectId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Origin and Destination projects cannot be identical." });
      }

      await assertProjectMember(ctx.user, input.originProjectId);
      await assertProjectMember(ctx.user, input.destinationProjectId);
      await assertCanWrite(ctx.user, input.originProjectId);

      const count = await db.equipmentTransfer.count({ where: { organizationId: orgId } });
      const transferNo = `ETC-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
      const now = new Date();
      const miti = adToBs(now).formatted;

      return db.$transaction(async (tx) => {
        await withOrgContext(tx, orgId, !!ctx.user.isSuperAdmin);
        const equip = await tx.equipment.findUnique({
          where: { id: input.equipmentId },
        });

        if (!equip || equip.projectId !== input.originProjectId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Equipment not found on origin project." });
        }

        // 1. Relocate equipment to destination project
        await tx.equipment.update({
          where: { id: equip.id },
          data: {
            projectId: input.destinationProjectId,
            status: "active",
          },
        });

        // 2. Create EquipmentTransfer record
        const transfer = await tx.equipmentTransfer.create({
          data: {
            transferNo,
            organizationId: orgId,
            equipmentId: equip.id,
            originProjectId: input.originProjectId,
            destinationProjectId: input.destinationProjectId,
            transferDate: now,
            transferMiti: miti,
            chalanNo: input.chalanNo || null,
            vehicleNo: input.vehicleNo || null,
            driverName: input.driverName || null,
            transporterName: input.transporterName || null,
            meterAtDispatch: input.meterAtDispatch ? new Prisma.Decimal(input.meterAtDispatch) : null,
            meterAtReceive: input.meterAtReceive ? new Prisma.Decimal(input.meterAtReceive) : null,
            freightCost: new Prisma.Decimal(input.freightCost),
            status: "completed",
            dispatchedById: ctx.user.id,
            receivedById: ctx.user.id,
            notes: input.notes || null,
          },
        });

        // 3. Log freight cost if any to destination project
        if (input.freightCost > 0) {
          await tx.projectCost.create({
            data: {
              projectId: input.destinationProjectId,
              category: "equipment",
              amount: new Prisma.Decimal(input.freightCost),
              description: `Equipment Relocation Freight: ${equip.name} (${equip.code || equip.model || ""}) via ${transferNo}`,
              date: now,
              createdById: ctx.user.id,
            },
          });
        }

        return transfer;
      });
    }),

  // ── 5. List Equipment Transfers ────────────────────────────────
  listEquipmentTransfers: protectedProcedure
    .input(z.object({ projectId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is not assigned to an organization" });
      }

      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
      }

      const where: Prisma.EquipmentTransferWhereInput = {
        organizationId: orgId,
        ...(input.projectId
          ? {
              OR: [{ originProjectId: input.projectId }, { destinationProjectId: input.projectId }],
            }
          : {}),
      };

      const transfers = await db.equipmentTransfer.findMany({
        where,
        include: {
          equipment: { select: { id: true, name: true, code: true, model: true, type: true } },
          originProject: { select: { id: true, name: true, code: true } },
          destinationProject: { select: { id: true, name: true, code: true } },
          dispatchedBy: { select: { id: true, name: true } },
          receivedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return { transfers };
    }),
});
