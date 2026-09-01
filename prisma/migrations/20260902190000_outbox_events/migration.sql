-- Transactional outbox: durable event log written in the same transaction
-- as the state change that produced it. Delivered by the background worker
-- (src/server/utils/outbox.ts) with bounded retries and a dead-letter
-- status ("failed"). Intentionally NOT under tenant RLS: no client surface,
-- server-side worker reads only (see model comment in schema.prisma).
CREATE TABLE IF NOT EXISTS "OutboxEvent" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT,
    "projectId"      TEXT,
    "type"           TEXT NOT NULL,
    "entityType"     TEXT NOT NULL,
    "entityId"       TEXT NOT NULL,
    "payload"        JSONB NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'pending',
    "attempts"       INTEGER NOT NULL DEFAULT 0,
    "lastError"      TEXT,
    "availableAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt"    TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_type_status_idx" ON "OutboxEvent"("type", "status");
