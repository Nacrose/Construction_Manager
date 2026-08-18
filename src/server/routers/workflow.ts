/**
 * tRPC router merging RFI, Daily Program, and Daily Reports into a single Workflow module.
 */
import { router } from "@/server/trpc";
import { rfiRouter } from "./rfi";
import { dailyReportRouter } from "./daily-report";
import { dailyProgramRouter } from "./daily-program";

export const workflowRouter = router({
  rfi: rfiRouter,
  dailyReport: dailyReportRouter,
  dailyProgram: dailyProgramRouter,
});
