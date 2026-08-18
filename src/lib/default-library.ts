/**
 * Helpers for resolving a project's default analysis library.
 *
 * The "default library" is the single source of truth for which of the
 * three rate-analysis libraries (Client's Estimate / Contractor Bid /
 * Contractor's Actual) the rest of the app should pull ingredient data
 * from when computing resource requirements, look-ahead material needs,
 * daily-program autofill, Gantt resource overlays, etc.
 *
 * Resolution order (first wins):
 *   1. `Project.costLibraryId` — explicit FK set by the project manager
 *   2. The library on the project with `AnalysisLibrary.isDefault = true`
 *   3. The library on the project with `purpose = 'client_estimate'`
 *   4. The oldest library on the project (createdAt asc) — last-resort
 *      fallback so callers never have to handle null.
 */

import { db } from "@/lib/db";

export type DefaultLibrary = {
  id: string;
  name: string;
  purpose: "client_estimate" | "contractor_bid" | "contractor_actual";
};

/**
 * Returns the project's default analysis library, or null if the project
 * has no libraries at all (e.g. a brand-new project before the auto-setup
 * ran).
 *
 * Callers that need to filter ingredients by library should use this
 * instead of hardcoding `purpose: 'client_estimate'`.
 */
export async function getDefaultLibrary(
  projectId: string
): Promise<DefaultLibrary | null> {
  // 1. Explicit FK on the project
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      costLibraryId: true,
      costLibrary: { select: { id: true, name: true, purpose: true } },
    },
  });

  if (project?.costLibrary) {
    return {
      id: project.costLibrary.id,
      name: project.costLibrary.name,
      purpose: project.costLibrary.purpose as DefaultLibrary["purpose"],
    };
  }

  // 2 & 3 & 4. Look at the project's libraries
  const libraries = await db.analysisLibrary.findMany({
    where: { projectId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, purpose: true, isDefault: true },
  });

  if (libraries.length === 0) return null;

  // The orderBy already prefers isDefault=true first; client_estimate
  // is the conventional fallback if no explicit default is set.
  const explicit =
    libraries.find((l) => l.isDefault) ??
    libraries.find((l) => l.purpose === "client_estimate") ??
    libraries[0];

  return {
    id: explicit.id,
    name: explicit.name,
    purpose: explicit.purpose as DefaultLibrary["purpose"],
  };
}

/**
 * Returns the library ID to filter ingredients by.
 *
 * Convenience wrapper around `getDefaultLibrary` for callers that only
 * need the ID (the common case). Returns null if the project has no
 * libraries yet — callers should fall back to filtering by
 * `purpose: 'client_estimate'` in that case.
 */
export async function getDefaultLibraryId(
  projectId: string
): Promise<string | null> {
  const lib = await getDefaultLibrary(projectId);
  return lib?.id ?? null;
}
