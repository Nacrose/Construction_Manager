/**
 * Client-side tRPC React hooks setup.
 * Wraps @trpc/react-query to generate type-safe React Query hooks.
 */
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers/_app";

export const trpc = createTRPCReact<AppRouter>({});
