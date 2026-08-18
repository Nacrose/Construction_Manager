const fs = require('fs');
let content = fs.readFileSync('src/server/routers/gantt.ts', 'utf8');

// Update Schemas
content = content.replace(
  'const CreateTaskSchema = z.object({',
  `const CreateTaskSchema = z.object({\n  versionId: z.string().optional(),\n  selectedCostLibraryId: z.string().nullable().optional(),`
);
content = content.replace(
  'const UpdateTaskSchema = z.object({',
  `const UpdateTaskSchema = z.object({\n  versionId: z.string().optional(),\n  selectedCostLibraryId: z.string().nullable().optional(),`
);
content = content.replace(
  'const ReorderSchema = z.object({',
  `const CreateVersionSchema = z.object({\n  projectId: z.string(),\n  name: z.string().min(1),\n  isDefault: z.boolean().default(false),\n  cloneFromVersionId: z.string().optional(),\n});\n\nconst ReorderSchema = z.object({`
);

// Update list endpoint 
content = content.replace(
  '.input(z.object({ projectId: z.string() }))',
  '.input(z.object({ projectId: z.string(), versionId: z.string().optional() }))'
);

content = content.replace(
  'const database = getFreshDb();',
  `const database = getFreshDb();\n\n      let targetVersionId = input.versionId;\n      if (!targetVersionId) {\n        let defaultVer = await database.ganttVersion.findFirst({ where: { projectId: input.projectId, isDefault: true } });\n        if (!defaultVer) defaultVer = await database.ganttVersion.findFirst({ where: { projectId: input.projectId } });\n        if (defaultVer) targetVersionId = defaultVer.id;\n      }\n\n      const whereClause = targetVersionId ? { projectId: input.projectId, versionId: targetVersionId } : { projectId: input.projectId };`
);

content = content.replace(
  'where: { projectId: input.projectId },',
  'where: whereClause,'
);
// replace second occurrence inside self-heal
content = content.replace(
  'where: { projectId: input.projectId },',
  'where: whereClause,'
);

// Include rateAnalyses in the nested boqItem select
content = content.replace(
  'rate: true,',
  'rate: true,\n                  rateAnalyses: { include: { library: true } },'
);
// second occurrence
content = content.replace(
  'rate: true,',
  'rate: true,\n                    rateAnalyses: { include: { library: true } },'
);


// Add versions endpoints at the start of router
const newEndpoints = `
  listVersions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      let versions = await db.ganttVersion.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
      });
      if (versions.length === 0) {
        const defaultVer = await db.ganttVersion.create({
          data: { projectId: input.projectId, name: "Default Running", isDefault: true },
        });
        versions = [defaultVer];
        await db.ganttTask.updateMany({
          where: { projectId: input.projectId, versionId: null },
          data: { versionId: defaultVer.id },
        });
      }
      return { versions };
    }),

  createVersion: protectedProcedure
    .input(CreateVersionSchema)
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role === "client" || role === "inspector") throw new TRPCError({ code: "FORBIDDEN", message: "Read-only" });
      
      const newVersion = await db.ganttVersion.create({
        data: { projectId: input.projectId, name: input.name, isDefault: input.isDefault },
      });

      if (input.cloneFromVersionId) {
        const sourceTasks = await db.ganttTask.findMany({
          where: { versionId: input.cloneFromVersionId },
          include: { boqLinks: true },
        });

        const idMap = new Map();
        for (const task of sourceTasks) {
          const newTask = await db.ganttTask.create({
            data: {
              projectId: input.projectId,
              versionId: newVersion.id,
              name: task.name,
              code: task.code,
              startDate: task.startDate,
              endDate: task.endDate,
              duration: task.duration,
              progress: task.progress,
              plannedValue: task.plannedValue,
              selectedCostLibraryId: task.selectedCostLibraryId,
              laborCount: task.laborCount,
              isMilestone: task.isMilestone,
              sortOrder: task.sortOrder,
              boqLinks: {
                create: task.boqLinks.map(link => ({ boqItemId: link.boqItemId, quantity: link.quantity }))
              }
            }
          });
          idMap.set(task.id, newTask.id);
        }

        for (const task of sourceTasks) {
          if (!task.parentId && !task.dependencies) continue;
          let newDeps = task.dependencies;
          if (newDeps) {
            try {
              const deps = JSON.parse(newDeps);
              newDeps = JSON.stringify(deps.map(d => ({ ...d, taskId: idMap.get(d.taskId) ?? d.taskId })));
            } catch (e) {}
          }
          await db.ganttTask.update({
            where: { id: idMap.get(task.id) },
            data: {
              parentId: task.parentId ? idMap.get(task.parentId) : null,
              dependencies: newDeps,
            }
          });
        }
      }
      return { version: newVersion };
    }),
`;

content = content.replace('export const ganttRouter = router({', 'export const ganttRouter = router({' + newEndpoints);

// Add versionId and selectedCostLibraryId to create/update mutations
content = content.replace(
  'projectId: input.projectId,',
  'projectId: input.projectId,\n          versionId: input.versionId,'
);
content = content.replace(
  'progress: input.progress,',
  'progress: input.progress,\n          selectedCostLibraryId: input.selectedCostLibraryId,'
);
content = content.replace(
  '...data.name',
  '...(data.versionId !== undefined && { versionId: data.versionId }),\n          ...(data.selectedCostLibraryId !== undefined && { selectedCostLibraryId: data.selectedCostLibraryId }),\n          ...data.name'
);

fs.writeFileSync('src/server/routers/gantt.ts', content);
