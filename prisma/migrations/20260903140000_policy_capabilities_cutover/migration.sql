-- Policy & Capability Cutover (Phase C)
-- (ADR-0004 operating method + capability model, ADR-0008 clean break)
--
-- The legacy four-value workflow vocabulary dies here:
--   - "Organization"."operatingModel" (hq_centralized_imprest /
--     hybrid_daybook_hq_procure / decentralized_site_and_hq /
--     single_project_jv) is replaced by operatingMethod + the ACTIVE
--     OrganizationPolicyVersion capability map (added in Phase A).
--   - "DelegationRule"."allowedRoles" mixed org and project roles in one
--     JSON list (ADR-0004 context). Roles gate *who* (authz.ts), so the
--     column is dropped; a delegation rule is now ONLY a spending limit.
--   - "DelegationRule"."siteScopedOnly" encoded a role concept ("site-level
--     roles only") inside the amount store — same three-axes violation.
--
-- DATA NOTE (ADR-0008): every deployment's database/storage data is test
-- data, explicitly declared disposable. Columns are dropped without
-- backfill/mapping machinery. If a deployment ever holds real contractor
-- data, ADR-0008 must be revisited BEFORE running this migration.
--
-- Orgs created before Phase A lack an ACTIVE OrganizationPolicyVersion;
-- application code bootstraps version 1 lazily
-- (ensureActivePolicyVersion) and resolves method defaults until then.

ALTER TABLE "Organization" DROP COLUMN IF EXISTS "operatingModel";

ALTER TABLE "DelegationRule" DROP COLUMN IF EXISTS "allowedRoles";

ALTER TABLE "DelegationRule" DROP COLUMN IF EXISTS "siteScopedOnly";
