"use client";

/**
 * useRegister — Tier 2 pattern engine (Phase B of the engine consolidation).
 *
 * OWNS: the list-side plumbing of every "register" page (Leave Register,
 * Material Register, Day Book, ...) — the typed item pick and the refresh/
 * fetching state that every register toolbar repeats.
 *
 * Pair it with FormDialogEngine: the dialog's `invalidate` callback refreshes
 * the register after a create/update; `register.refresh()` backs the manual
 * refresh button. Filters stay in the page (they are page concerns); the
 * register engine owns only the register semantics.
 *
 * PROTOCOL NOTES
 * - Typed end-to-end: pass the concrete pieces of the tRPC useQuery result —
 *   `data` (a plain `TOutput | undefined`, so TData flows straight from the
 *   router's inferred output) and `pick` must return the exact item type.
 *   (We accept properties rather than the whole result object because tRPC's
 *   union result types resist structural inference and degrade TData to
 *   `unknown`/`never`; a concrete `.data` property keeps full fidelity with
 *   zero casts and zero version-specific type imports.)
 * - Extractive, not speculative: extracted from the leaves pilot
 *   (leaves-tab.tsx) — it exists because every register page repeats
 *   `const items = data?.items || []` plus loading/refetch plumbing.
 */

import * as React from "react";

export interface RegisterHandle<TItem> {
  items: TItem[];
  isLoading: boolean;
  isFetching: boolean;
  /** Manual refresh (backs the toolbar RefreshCw button). */
  refresh: () => unknown;
}

export function useRegister<TData, TItem>(opts: {
  /** The data of a tRPC `useQuery(...)` result, e.g. `listQuery.data` — typed straight from the router. */
  data: TData | undefined;
  isLoading: boolean;
  isFetching: boolean;
  /** Backing refetch for the manual refresh button, e.g. `listQuery.refetch`. */
  refresh: () => unknown;
  /** Typed pick from the router payload to the item array, e.g. `(d) => d?.leaves ?? []`. */
  pick: (data: TData | undefined) => TItem[];
}): RegisterHandle<TItem> {
  const { data, isLoading, isFetching, refresh, pick } = opts;

  const items = pick(data);

  return React.useMemo(
    () => ({ items, isLoading, isFetching, refresh }),
    [items, isLoading, isFetching, refresh],
  );
}
