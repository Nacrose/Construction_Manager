/**
 * Structured JSON logger for serverless-friendly observability.
 *
 * Bare console.* calls produce unstructured text that platform log drains
 * can't query. This logger emits one JSON object per line with stable
 * fields, so "show me every RLS context failure for org X in the last
 * hour" becomes a filter instead of archaeology.
 *
 * Usage:
 *   const log = logger.child({ orgId: user.organizationId, userId: user.id });
 *   log.error("rls context failed", { error: err, table: "GanttTask" });
 *
 * Output (one line):
 *   {"ts":"...","level":"error","msg":"rls context failed","orgId":"...",
 *    "userId":"...","table":"GanttTask","error":"...","stack":"..."}
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: LogLevel = ((): LogLevel => {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
})();

function serializeValue(v: unknown): unknown {
  if (v instanceof Error) {
    return { name: v.name, message: v.message, stack: v.stack };
  }
  return v;
}

function emit(level: LogLevel, msg: string, fields: LogFields, base: LogFields) {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;
  const merged: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(fields)) {
    merged[k] = serializeValue(v);
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...merged,
  });
  // stderr for warn/error keeps stdout clean for platform log routing.
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    // eslint-disable-next-line no-console -- stdout JSON lines are the product
    console.log(line);
  }
}

export type Logger = {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Derive a logger with permanently-bound fields (request/org context). */
  child(fields: LogFields): Logger;
};

export function logger(base: LogFields = {}): Logger {
  return {
    debug: (msg, fields = {}) => emit("debug", msg, fields, base),
    info: (msg, fields = {}) => emit("info", msg, fields, base),
    warn: (msg, fields = {}) => emit("warn", msg, fields, base),
    error: (msg, fields = {}) => emit("error", msg, fields, base),
    child: (fields) => logger({ ...base, ...fields }),
  };
}
