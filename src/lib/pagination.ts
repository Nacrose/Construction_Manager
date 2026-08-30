/**
 * Shared pagination primitives for list endpoints.
 *
 * The codebase's list queries were written unbounded — fine at demo scale,
 * a latency/memory cliff at production scale (50k documents in one org =
 * one giant response, every row dragging through its RLS EXISTS subquery).
 *
 * This helper provides the standard bounded-list shape:
 *   - `limit` (default 200, max 500) caps the page size.
 *   - Optional `cursor` (the last row's id) enables keyset "load more".
 *   - The response carries `hasMore` + `nextCursor` so UIs can page lazily
 *     while still seeing everything that exists.
 *
 * Requirements for correct cursor paging with this helper:
 *   - orderBy MUST be [{ <sortField>: 'desc'|'asc' }, { id: 'desc'|'asc' }]
 *     (the id tiebreaker makes the order total so cursor skips are exact).
 */
import { z } from "zod";

/** Standard input fields every paginated list accepts. */
export const paginationInput = {
  limit: z.number().int().min(1).max(500).default(200),
  cursor: z.string().optional(), // id of the last row of the previous page
};

export type PaginationInput = {
  limit?: number;
  cursor?: string;
};

/**
 * Build the Prisma args fragment for a bounded, cursor-paged query.
 * Merge into the query's where/orderBy:
 *
 *   const page = pageArgs(input);
 *   db.document.findMany({ where, orderBy: page.orderBy, take: page.take, cursor: page.cursor, skip: page.skip })
 */
export function pageArgs(
  input: PaginationInput,
  sortField = "createdAt",
  dir: "asc" | "desc" = "desc"
): {
  orderBy: Array<Record<string, "asc" | "desc">>;
  take: number;
  cursor?: { id: string };
  skip?: number;
} {
  return {
    orderBy: [{ [sortField]: dir }, { id: dir }],
    take: (input.limit ?? 200) + 1, // +1 probe row to detect hasMore
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  };
}

/**
 * Trim the +1 probe row and report page metadata.
 * `rows` must be ordered by the same sort the pageArgs used.
 */
export function pageResult<T extends { id: string }>(
  rows: T[],
  input: PaginationInput
): { items: T[]; hasMore: boolean; nextCursor: string | null } {
  const limit = input.limit ?? 200;
  if (rows.length > limit) {
    const items = rows.slice(0, limit);
    return { items, hasMore: true, nextCursor: items[items.length - 1]?.id ?? null };
  }
  return { items: rows, hasMore: false, nextCursor: null };
}
