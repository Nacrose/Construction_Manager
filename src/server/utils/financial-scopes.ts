/**
 * Canonical Domain Scoping Helpers for Financial & IPC Queries
 *
 * In this construction platform:
 *  - Client Progress Billings / Turnover / Revenue: `subcontractorId === null`
 *  - Subcontractor Billings / Liabilities / Payables: `subcontractorId !== null`
 *
 * Using these canonical query builders prevents data leakage where
 * Subcontractor IPC liabilities pollute Client revenue ledgers (or vice versa).
 */

export interface IpcScopeOptions {
  projectId?: string;
  projectIds?: string[];
  status?: string | string[];
  period?: string;
  from?: Date;
  to?: Date;
}

/**
 * Filter for Client Progress Billings (Revenue / Turnover / Inflow)
 */
export function clientIpcWhere(opts: IpcScopeOptions = {}) {
  const where: Record<string, any> = {
    subcontractorId: null,
  };

  if (opts.projectId) {
    where.projectId = opts.projectId;
  } else if (opts.projectIds && opts.projectIds.length > 0) {
    where.projectId = { in: opts.projectIds };
  }

  if (opts.status) {
    where.status = Array.isArray(opts.status) ? { in: opts.status } : opts.status;
  }

  if (opts.period) {
    where.period = opts.period;
  }

  if (opts.from || opts.to) {
    where.createdAt = {};
    if (opts.from) where.createdAt.gte = opts.from;
    if (opts.to) where.createdAt.lte = opts.to;
  }

  return where;
}

/**
 * Filter for Subcontractor IPC Bills (Liabilities / Outflows)
 */
export function subcontractorIpcWhere(opts: IpcScopeOptions = {}) {
  const where: Record<string, any> = {
    subcontractorId: { not: null },
  };

  if (opts.projectId) {
    where.projectId = opts.projectId;
  } else if (opts.projectIds && opts.projectIds.length > 0) {
    where.projectId = { in: opts.projectIds };
  }

  if (opts.status) {
    where.status = Array.isArray(opts.status) ? { in: opts.status } : opts.status;
  }

  if (opts.period) {
    where.period = opts.period;
  }

  if (opts.from || opts.to) {
    where.createdAt = {};
    if (opts.from) where.createdAt.gte = opts.from;
    if (opts.to) where.createdAt.lte = opts.to;
  }

  return where;
}
