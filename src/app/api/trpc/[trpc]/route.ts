/**
 * Next.js App Router route handler for tRPC.
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import { captureServerError } from "@/lib/error-tracking";
import { assertSameOrigin } from "@/lib/csrf";

// With cookie-only auth (v2.0), tRPC mutations are cookie-authenticated, so
// the endpoint is a CSRF target. Batched queries ride POST too — same-origin
// validation covers both verbs (GET is a safe method and always passes).
const handler = (req: Request) => {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  return fetchRequestHandler({
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
};

export { handler as GET, handler as POST };
