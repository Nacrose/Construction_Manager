/**
 * Next.js App Router route handler for tRPC.
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import { captureServerError } from "@/lib/error-tracking";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    // Observability funnel (tRPC v11): every procedure error that reaches
    // the HTTP layer passes through here. Expected business errors
    // (validation/authz/lock guards) are filtered inside captureServerError;
    // the rest go to Sentry with the procedure path attached. See
    // docs/plans/sentry-integration.md §3.5.
    onError({ error, path, ctx }) {
      captureServerError(error, {
        tags: { "trpc.path": path ?? "unknown" },
        userId: ctx?.user?.id,
        trpcCode: error?.code,
      });
    },
  });

export { handler as GET, handler as POST };
