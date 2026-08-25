import { db } from "@/lib/db";

async function main() {
  const projects = await db.project.findMany({
    select: {
      id: true,
      name: true,
      ganttTasks: {
        select: {
          id: true,
          name: true,
          code: true,
          parentId: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  console.log(JSON.stringify(projects, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
