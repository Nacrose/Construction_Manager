import { db } from "@/lib/db";

export type MatchType = "exact" | "alias" | "token_sort" | "trigram" | "levenshtein";
export type MatchConfidence = "high" | "medium" | "low";

export interface SimilarityMatch {
  id: string;
  name: string;
  category: string | null;
  subCategory: string | null;
  defaultUnit: string | null;
  defaultRate: number | null;
  score: number; // 0.0 to 1.0
  matchType: MatchType;
  confidence: MatchConfidence;
  scope: "global" | "org" | "project";
  isCustom?: boolean;
}

export function normalizeMaterialName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[,.()\-/\\]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * High-performance similarity search for materials using PostgreSQL pg_trgm + token sorting.
 * Now queries the unified CatalogMaterial table (scope=global|org|project).
 */
export async function findSimilarMaterials(params: {
  name: string;
  scope?: "global" | "org" | "project" | "all";
  organizationId?: string | null;
  projectId?: string | null;
  threshold?: number;
  limit?: number;
}): Promise<SimilarityMatch[]> {
  const { name, scope = "all", organizationId = null, projectId = null, threshold = 0.35, limit = 8 } = params;
  const rawInput = name.trim();
  if (!rawInput || rawInput.length < 2) return [];

  const normalizedInput = normalizeMaterialName(rawInput);

  // Build scope filter
  let scopeWhere = "";
  const scopeParams: any[] = [];
  // We'll use parameterized scope filter built into SQL string
  if (scope === "global") {
    scopeWhere = `AND scope = 'global'`;
  } else if (scope === "org") {
    if (!organizationId) return [];
    scopeWhere = `AND scope = 'org' AND "organizationId" = $5`;
    scopeParams.push(organizationId);
  } else if (scope === "project") {
    if (!projectId) return [];
    scopeWhere = `AND scope = 'project' AND "projectId" = $5`;
    scopeParams.push(projectId);
  } else {
    // all: global + org (if orgId) + project (if projectId)
    if (organizationId && projectId) {
      scopeWhere = `AND (scope = 'global' OR (scope = 'org' AND "organizationId" = $5) OR (scope = 'project' AND "projectId" = $6))`;
      scopeParams.push(organizationId, projectId);
    } else if (organizationId) {
      scopeWhere = `AND (scope = 'global' OR (scope = 'org' AND "organizationId" = $5))`;
      scopeParams.push(organizationId);
    } else if (projectId) {
      scopeWhere = `AND (scope = 'global' OR (scope = 'project' AND "projectId" = $5))`;
      scopeParams.push(projectId);
    } else {
      scopeWhere = `AND scope = 'global'`;
    }
  }

  try {
    const sql = `
        SELECT 
          id, 
          name, 
          "normalizedName",
          category, 
          "subCategory", 
          "defaultUnit", 
          "defaultRate", 
          aliases,
          scope,
          GREATEST(
            similarity(name, $1),
            similarity("normalizedName", $2)
          ) AS score
        FROM "CatalogMaterial"
        WHERE 
          "isActive" = true
          ${scopeWhere}
          AND (
            GREATEST(similarity(name, $1), similarity("normalizedName", $2)) >= $3
            OR $1 = ANY(aliases)
            OR "normalizedName" = $2
            OR name ILIKE '%' || $1 || '%'
          )
        ORDER BY score DESC
        LIMIT $4;
      `;

    const rows = await db.$queryRawUnsafe<any[]>(
      sql,
      rawInput,
      normalizedInput,
      threshold,
      limit,
      ...scopeParams
    );

    const matches: SimilarityMatch[] = [];
    for (const row of rows) {
      let matchType: MatchType = "trigram";
      let score = parseFloat(row.score) || 0;
      let confidence: MatchConfidence = "low";

      if (row.name.toLowerCase() === rawInput.toLowerCase()) {
        matchType = "exact";
        score = 1.0;
        confidence = "high";
      } else if (row.normalizedName === normalizedInput) {
        matchType = "token_sort";
        score = Math.max(score, 0.95);
        confidence = "high";
      } else if (Array.isArray(row.aliases) && row.aliases.some((a: string) => a.toLowerCase() === rawInput.toLowerCase())) {
        matchType = "alias";
        score = 0.99;
        confidence = "high";
      } else if (score >= 0.70) {
        confidence = "medium";
      }

      matches.push({
        id: row.id,
        name: row.name,
        category: row.category,
        subCategory: row.subCategory,
        defaultUnit: row.defaultUnit,
        defaultRate: row.defaultRate,
        score,
        matchType,
        confidence,
        scope: row.scope as any,
        isCustom: row.scope !== "global",
      });
    }

    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
  } catch (err) {
    console.error("Error in trigram search:", err);
    return [];
  }
}
