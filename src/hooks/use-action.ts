"use client";

/**
 * useAction — Tier 2 pattern engine (Phase C of the engine consolidation).
 *
 * OWNS: the mutation-side protocol every page repeats —
 *   `proc.useMutation({ onSuccess: { toast + invalidate + ... }, onError: toast.error })`
 * Success protocol: toast -> invalidate -> onSuccess callback.
 * Error protocol: toast.error(message) + onError callback (fail loud, never silent).
 *
 * Call sites keep the full tRPC mutation shape (`.mutate()`, `.mutateAsync()`,
 * `.isPending`, `.data`), so adopting it is a mechanical replacement of the
 * `proc.useMutation({...})` block.
 *
 * PROTOCOL NOTES
 * - Single path: reuse of the EngineMutationProcedure structural type from
 *   FormDialogEngine — one definition of "what an engine-compatible tRPC
 *   mutation looks like".
 * - Typed end-to-end: TInput/TData flow from the real procedure; a wrong
 *   mutate() input is a compile error at the call site.
 * - Extractive, not speculative: extracted from the leaves pilot's
 *   approve/reject pair and the expenses page's approve/reject/delete trio.
 */

import { toast } from "sonner";

import { trpc } from "@/lib/trpc-client";
import type { EngineMutationProcedure, RouterUtils } from "@/components/engine/form-dialog-engine";

export interface UseActionOptions<TInput, TData> {
  /** Typed invalidation after success, e.g. `(u) => u.leave.list.invalidate({ projectId })`. */
  invalidate?: (utils: RouterUtils) => unknown;
  /** Success toast. Default "Done."; pass "" to suppress the toast entirely. */
  successMessage?: string | ((data: TData, variables: TInput) => string);
  /** Extra success hook (runs after toast + invalidate). */
  onSuccess?: (data: TData, variables: TInput) => void;
  /** Extra error hook (runs after the error toast). */
  onError?: (error: Error) => void;
}

export function useAction<TInput, TData>(
  procedure: EngineMutationProcedure<TInput, TData>,
  opts: UseActionOptions<TInput, TData> = {},
) {
  const utils = trpc.useUtils();

  // NOTE: opts is closed over directly — react-query keeps the latest callbacks
  // for in-flight mutations, so no options ref is needed.
  const mutation = procedure.useMutation({
    onSuccess: (data, variables) => {
      const message =
        typeof opts.successMessage === "function"
          ? opts.successMessage(data, variables)
          : opts.successMessage;
      if (message !== "") toast.success(message || "Done.");
      if (opts.invalidate) opts.invalidate(utils);
      opts.onSuccess?.(data, variables);
    },
    onError: (e) => {
      const error = e instanceof Error ? e : new Error(String(e));
      toast.error(error.message || "Something went wrong.");
      opts.onError?.(error);
    },
  });

  return mutation;
}
