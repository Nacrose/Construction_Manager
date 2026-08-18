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
  scope: "global" | "org";
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
 */
export async function findSimilarMaterials(params: {
  name: string;
  scope?: "global" | "org" | "all";
  organizationId?: string | null;
  threshold?: number;
  limit?: number;
}): Promise<SimilarityMatch[]> {
  const { name, scope = "all", organizationId = null, threshold = 0.35, limit = 8 } = params;
  const rawInput = name.trim();
  if (!rawInput || rawInput.length < 2) return [];

  const normalizedInput = normalizeMaterialName(rawInput);
  const matches: SimilarityMatch[] = [];
  const seenIds = new Set<string>();

  // 1. Search Global Material Catalog using pg_trgm
  if (scope === "global" || scope === "all") {
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
          GREATEST(
            similarity(name, $1),
            similarity("normalizedName", $2)
          ) AS score
        FROM "GlobalMaterialCatalog"
        WHERE 
          "isActive" = true
          AND (
            GREATEST(similarity(name, $1), similarity("normalizedName", $2)) >= $3
            OR $1 = ANY(aliases)
            OR "normalizedName" = $2
            OR name ILIKE '%' || $1 || '%'
          )
        ORDER BY score DESC
        LIMIT $4;
      `;

      const globalRows = await db.$queryRawUnsafe<any[]>(
        sql,
        rawInput,
        normalizedInput,
        threshold,
        limit
      );

      for (const row of globalRows) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);

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
          scope: "global",
        });
      }
    } catch (err) {
      console.error("Error in global trigram search:", err);
    }
  }

  // 2. Search Org Material Entries if organizationId is given
  if ((scope === "org" || scope === "all") && organizationId) {
    try {
      const orgSql = `
        SELECT 
          o.id, 
          o."localName" as name, 
          o."localCategory" as category, 
          o."localSubCategory" as "subCategory", 
          o."localUnit" as "defaultUnit", 
          o."defaultRate", 
          o."isCustom",
          GREATEST(
            similarity(COALESCE(o."localName", ''), $1),
            similarity(COALESCE(g.name, ''), $1)
          ) AS score
        FROM "OrgMaterialEntry" o
        LEFT JOIN "GlobalMaterialCatalog" g ON o."globalMaterialId" = g.id
        WHERE 
          o."organizationId" = $2
          AND o."isActive" = true
          AND (
            GREATEST(similarity(COALESCE(o."localName", ''), $1), similarity(COALESCE(g.name, ''), $1)) >= $3
            OR o."localName" ILIKE '%' || $1 || '%'
            OR g.name ILIKE '%' || $1 || '%'
          )
        ORDER BY score DESC
        LIMIT $4;
      `;

      const orgRows = await db.$queryRawUnsafe<any[]>(
        orgSql,
        rawInput,
        organizationId,
        threshold,
        limit
      );

      for (const row of orgRows) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);

        let score = parseFloat(row.score) || 0;
        let matchType: MatchType = "trigram";
        let confidence: MatchConfidence = "low";

        if (row.name && row.name.toLowerCase() === rawInput.toLowerCase()) {
          matchType = "exact";
          score = 1.0;
          confidence = "high";
        } else if (normalizeMaterialName(row.name || "") === normalizedInput) {
          matchType = "token_sort";
          score = Math.max(score, 0.95);
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
          scope: "org",
          isCustom: row.isCustom,
        });
      }
    } catch (err) {
      console.error("Error in org trigram search:", err);
    }
  }

  // Sort overall matches descending by score
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
