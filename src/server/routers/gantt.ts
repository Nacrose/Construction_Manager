/**
 * Gantt master router merging tasks, versions, dependencies, analytics, and imports.
 */
import { mergeRouters } from "@/server/trpc";
import { ganttTasksRouter } from "./gantt-tasks";
import { ganttVersionsRouter } from "./gantt-versions";
import { ganttDependenciesRouter } from "./gantt-dependencies";
import { ganttAnalyticsRouter } from "./gantt-analytics";
import { ganttImportRouter } from "./gantt-import";

export const ganttRouter = mergeRouters(
  ganttTasksRouter,
  ganttVersionsRouter,
  ganttDependenciesRouter,
  ganttAnalyticsRouter,
  ganttImportRouter
);
