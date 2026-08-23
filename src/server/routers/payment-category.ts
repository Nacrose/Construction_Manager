import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";

/** Standard Construction & Accounting (Tally / Swastik) Category Tree Presets */
export const DEFAULT_NEPAL_PAYMENT_CATEGORIES = [
  {
    name: "Site Overheads",
    nameNp: "साइट ओभरहेड तथा प्रशासनिक खर्च",
    code: "OVH",
    color: "amber",
    icon: "Building2",
    sortOrder: 1,
    subcategories: [
      { name: "Food & Mess / Khaja", nameNp: "खाजा तथा मेस खर्च", code: "OVH-FOD" },
      { name: "Transport, Fuel & Vehicle Travel", nameNp: "सवारी इन्धन तथा यातायात", code: "OVH-TRP" },
      { name: "Site Office & Camp Rent", nameNp: "साइट कार्यालय तथा क्याम्प भाडा", code: "OVH-RNT" },
      { name: "Electricity, Water & Utilities", nameNp: "बिजुली, पानी तथा महशुल", code: "OVH-UTL" },
      { name: "Safety Gear & PPE", nameNp: "सुरक्षा उपकरण तथा पीपीई", code: "OVH-SAF" },
      { name: "Lab & Quality Testing", nameNp: "ल्याब तथा गुणस्तर परीक्षण", code: "OVH-LAB" },
      { name: "Internet & Communication", nameNp: "इन्टरनेट तथा फोन/सञ्चार", code: "OVH-COM" },
      { name: "Stationery, Printing & Photocopy", nameNp: "स्टेशनरी तथा छपाइ", code: "OVH-STN" },
      { name: "Site Cleaning & Camp Security", nameNp: "सरसफाइ तथा सुरक्षा गार्ड", code: "OVH-SEC" },
      { name: "Legal, Permits & Municipal Fees", nameNp: "कागजात तथा इजाजत दस्तुर", code: "OVH-LGL" },
      { name: "Staff Welfare & Medical First-Aid", nameNp: "कर्मचारी कल्याण तथा प्राथमिक उपचार", code: "OVH-MED" },
      { name: "Miscellaneous & Petty Cash", nameNp: "विविध खुद्रा खर्च", code: "OVH-MIS" },
    ],
  },
  {
    name: "Materials",
    nameNp: "निर्माण सामग्री",
    code: "MAT",
    color: "emerald",
    icon: "Package",
    sortOrder: 2,
    subcategories: [
      { name: "Cement", nameNp: "सिमेन्ट (OPC/PPC)", code: "MAT-CEM" },
      { name: "Rebar & Structural Steel", nameNp: "छड तथा संरचनात्मक स्टिल", code: "MAT-STL" },
      { name: "Aggregates & Gitti", nameNp: "गिट्टी तथा चिप्स", code: "MAT-AGG" },
      { name: "Sand / Baluwa", nameNp: "बालुवा", code: "MAT-SND" },
      { name: "Bricks & AAC Blocks", nameNp: "इँटा तथा ब्लक", code: "MAT-BRK" },
      { name: "Timber & Shuttering Plywood", nameNp: "काठ तथा फर्मा प्लाइ", code: "MAT-TMB" },
      { name: "Plumbing & Sanitary", nameNp: "प्लम्बिङ तथा स्यानिटरी", code: "MAT-PLB" },
      { name: "Electrical & Wiring", nameNp: "विद्युतीय सामग्री", code: "MAT-ELE" },
      { name: "Paint, Chemicals & Waterproofing", nameNp: "रङ, रसायन तथा वाटरप्रूफिङ", code: "MAT-PNT" },
      { name: "General Hardware & Fasteners", nameNp: "हार्डवेयर तथा नट-बोल्ट", code: "MAT-HRD" },
      { name: "Geotextile, Gabion & Drain Pipes", nameNp: "ग्याबियन तार तथा ड्रेन पाइप", code: "MAT-GEO" },
    ],
  },
  {
    name: "Subcontractors & Piece-rate",
    nameNp: "पेटी ठेकेदार तथा पिस-रेट",
    code: "SUB",
    color: "purple",
    icon: "Layers",
    sortOrder: 3,
    subcategories: [
      { name: "RCC & Structural Work", nameNp: "आरसीसी तथा ढलान काम", code: "SUB-RCC" },
      { name: "Masonry & Wall Works", nameNp: "गारो लगाउने काम", code: "SUB-MAS" },
      { name: "Plaster & Wall Finishing", nameNp: "प्लास्टर तथा फिनिसिङ", code: "SUB-PLS" },
      { name: "Earthwork & Excavation Subcontract", nameNp: "माटो खन्ने तथा पुर्ने काम", code: "SUB-EXC" },
      { name: "Bar Bending & Steel Fixing", nameNp: "छड बाँध्ने काम", code: "SUB-BAR" },
      { name: "Formwork & Scaffolding", nameNp: "फर्मा तथा स्काफोल्डिङ", code: "SUB-FRM" },
      { name: "Flooring, Marble & Tile", nameNp: "टायल, मार्बल तथा फ्लोरिङ", code: "SUB-FLR" },
      { name: "Fabrication & Metal Grill", nameNp: "ग्रिल तथा स्टिल फेब्रिकेसन", code: "SUB-FAB" },
      { name: "MEP & Electrical Subcontract", nameNp: "विद्युतीय तथा स्यानिटरी ठेक्का", code: "SUB-MEP" },
      { name: "Road Paving & Asphalt Works", nameNp: "कालोपत्रे तथा पेभिङ ब्लक", code: "SUB-PAV" },
    ],
  },
  {
    name: "Plant & Machinery",
    nameNp: "उपकरण तथा मेसिनरी",
    code: "EQP",
    color: "sky",
    icon: "Truck",
    sortOrder: 4,
    subcategories: [
      { name: "Equipment Spot Hire / Hourly", nameNp: "स्पट तथा घण्टाको भाडा", code: "EQP-SPT" },
      { name: "Monthly Machine Lease", nameNp: "मासिक मेसिन भाडा", code: "EQP-MNT" },
      { name: "Heavy Equipment Diesel / Fuel", nameNp: "हेभी मेसिनरी डिजेल", code: "EQP-DSL" },
      { name: "Lubricants, Grease & Mobil", nameNp: "मोबिल, ग्रीस तथा आयल", code: "EQP-OIL" },
      { name: "Servicing & Routine Maintenance", nameNp: "नियमित मर्मत तथा सर्भिसिङ", code: "EQP-SRV" },
      { name: "Spare Parts & Tyre Replacement", nameNp: "स्पेयर पार्ट्स तथा टायर", code: "EQP-PRT" },
      { name: "Machine Shifting & Mobilization", nameNp: "मेसिन ढुवानी तथा सिफ्टिङ", code: "EQP-MOB" },
    ],
  },
  {
    name: "Direct Site Labor",
    nameNp: "साइट श्रमिक ज्याला",
    code: "LAB",
    color: "indigo",
    icon: "Users",
    sortOrder: 5,
    subcategories: [
      { name: "Daily Wage Muster Roll", nameNp: "दैनिक ज्यालादारी मस्टर रोल", code: "LAB-DAY" },
      { name: "Weekly Gang Wage Payment", nameNp: "साप्ताहिक समूह ज्याला", code: "LAB-WKG" },
      { name: "Piece-rate Labor Wages", nameNp: "पिस-रेट श्रमिक ज्याला", code: "LAB-PCR" },
      { name: "Overtime & Night Shift Allowance", nameNp: "ओभरटाइम तथा रात्रि भत्ता", code: "LAB-OTM" },
      { name: "Site Supervisors & Foremen Salary", nameNp: "सुपरभाइजर तथा फोरम्यान तलब", code: "LAB-SUP" },
    ],
  },
  {
    name: "Statutory Taxes & Financial",
    nameNp: "कर तथा वित्तीय खर्च",
    code: "TAX",
    color: "rose",
    icon: "Receipt",
    sortOrder: 6,
    subcategories: [
      { name: "TDS Deposit to IRD / Rajaswa", nameNp: "अग्रिम कर (TDS) दाखिला", code: "TAX-TDS" },
      { name: "VAT Return Payment to IRD", nameNp: "मूल्य अभिवृद्धि कर भुक्तानी", code: "TAX-VAT" },
      { name: "Municipal & Quarry Royalty", nameNp: "स्थानीय सरकार तथा खानी रोयल्टी", code: "TAX-ROY" },
      { name: "Contractor All Risk (CAR) Insurance", nameNp: "निर्माण बिमा (CAR Policy)", code: "TAX-INS" },
      { name: "Bank Guarantee Commission & Fees", nameNp: "बैंक ग्यारेन्टी कमिसन", code: "TAX-BNK" },
    ],
  },
  {
    name: "Advances & Security Deposits",
    nameNp: "अग्रिम तथा धरौटी",
    code: "ADV",
    color: "orange",
    icon: "Coins",
    sortOrder: 7,
    subcategories: [
      { name: "Material Supplier Advance", nameNp: "सामग्री आपूर्तिकर्ता पेस्की", code: "ADV-SUP" },
      { name: "Subcontractor Mobilization Advance", nameNp: "पेटी ठेकेदार मोबिलाइजेसन पेस्की", code: "ADV-SUB" },
      { name: "Equipment Security Deposit", nameNp: "उपकरण धरौटी", code: "ADV-EQP" },
      { name: "Staff Travel / Work Advance", nameNp: "कर्मचारी भ्रमण / काम पेस्की", code: "ADV-STF" },
    ],
  },
];

export const paymentCategoryRouter = router({
  /** List all hierarchical categories and subcategories for a project (auto-seeds defaults if empty) */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      let categories = await db.paymentCategory.findMany({
        where: { projectId: input.projectId },
        include: {
          children: {
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });

      // Auto-seed if none exist for project
      if (categories.length === 0) {
        for (const cat of DEFAULT_NEPAL_PAYMENT_CATEGORIES) {
          const parent = await db.paymentCategory.create({
            data: {
              projectId: input.projectId,
              name: cat.name,
              nameNp: cat.nameNp,
              code: cat.code,
              color: cat.color,
              icon: cat.icon,
              sortOrder: cat.sortOrder,
              isSystem: true,
            },
          });

          for (let i = 0; i < cat.subcategories.length; i++) {
            const sub = cat.subcategories[i];
            await db.paymentCategory.create({
              data: {
                projectId: input.projectId,
                parentId: parent.id,
                name: sub.name,
                nameNp: sub.nameNp,
                code: sub.code,
                color: cat.color,
                sortOrder: i + 1,
                isSystem: true,
              },
            });
          }
        }

        categories = await db.paymentCategory.findMany({
          where: { projectId: input.projectId },
          include: {
            children: {
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            },
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        });
      }

      // Filter top-level parents with their nested children
      const topLevel = categories.filter((c) => !c.parentId);
      return { categories: topLevel };
    }),

  /** Create a new custom Category or Subcategory */
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1, "Name is required"),
        nameNp: z.string().optional(),
        code: z.string().optional(),
        color: z.string().optional().default("amber"),
        icon: z.string().optional(),
        parentId: z.string().optional(), // if set, creates a subcategory
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await assertNotLocked(ctx.user.organizationId);

      // Check unique name per parent
      const existing = await db.paymentCategory.findFirst({
        where: {
          projectId: input.projectId,
          name: { equals: input.name, mode: "insensitive" },
          parentId: input.parentId || null,
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A category named "${input.name}" already exists.`,
        });
      }

      const cat = await db.paymentCategory.create({
        data: {
          projectId: input.projectId,
          name: input.name.trim(),
          nameNp: input.nameNp?.trim() || null,
          code: input.code?.trim().toUpperCase() || null,
          color: input.color || "amber",
          icon: input.icon || null,
          parentId: input.parentId || null,
          isSystem: false,
        },
      });

      return { category: cat };
    }),

  /** Update an existing category or subcategory */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
        name: z.string().min(1).optional(),
        nameNp: z.string().optional(),
        code: z.string().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // IDOR guard: verify the category belongs to the project the
      // caller was authorized on. Previously this used update({where:{id}})
      // directly — caller authorized on project A could update categories
      // in project B by cuid.
      const existing = await db.paymentCategory.findFirst({
        where: { id: input.id, projectId: input.projectId },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Category not found in this project." });
      }

      const updated = await db.paymentCategory.update({
        where: { id: input.id },
        data: {
          ...(input.name ? { name: input.name.trim() } : {}),
          ...(input.nameNp !== undefined ? { nameNp: input.nameNp ? input.nameNp.trim() : null } : {}),
          ...(input.code !== undefined ? { code: input.code ? input.code.trim().toUpperCase() : null } : {}),
          ...(input.color ? { color: input.color } : {}),
          ...(input.icon !== undefined ? { icon: input.icon || null } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      });

      return { category: updated };
    }),

  /** Delete a category or subcategory */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // IDOR guard: verify the category belongs to the project the
      // caller was authorized on.
      const existing = await db.paymentCategory.findFirst({
        where: { id: input.id, projectId: input.projectId },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Category not found in this project." });
      }

      // Check if payments are linked
      const count = await db.payment.count({
        where: {
          OR: [{ categoryId: input.id }, { subCategoryId: input.id }],
        },
      });

      if (count > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete category because ${count} payment record(s) are currently categorized under it.`,
        });
      }

      await db.paymentCategory.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  /** Reset/Seed standard Nepal default presets */
  seedDefaults: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      for (const cat of DEFAULT_NEPAL_PAYMENT_CATEGORIES) {
        let parent = await db.paymentCategory.findFirst({
          where: {
            projectId: input.projectId,
            name: cat.name,
            parentId: null,
          },
        });

        if (!parent) {
          parent = await db.paymentCategory.create({
            data: {
              projectId: input.projectId,
              name: cat.name,
              nameNp: cat.nameNp,
              code: cat.code,
              color: cat.color,
              icon: cat.icon,
              sortOrder: cat.sortOrder,
              isSystem: true,
            },
          });
        }

        for (let i = 0; i < cat.subcategories.length; i++) {
          const sub = cat.subcategories[i];
          const exists = await db.paymentCategory.findFirst({
            where: {
              projectId: input.projectId,
              parentId: parent.id,
              name: sub.name,
            },
          });

          if (!exists) {
            await db.paymentCategory.create({
              data: {
                projectId: input.projectId,
                parentId: parent.id,
                name: sub.name,
                nameNp: sub.nameNp,
                code: sub.code,
                color: cat.color,
                sortOrder: i + 1,
                isSystem: true,
              },
            });
          }
        }
      }

      return { success: true };
    }),
});
