-- AlterTable: add nullable first so existing rows can be backfilled before the
-- NOT NULL constraint is applied (Postgres won't allow ADD COLUMN ... NOT NULL
-- without a default on a non-empty table).
ALTER TABLE "Quote" ADD COLUMN "revisionNo" INTEGER;

-- Backfill: number each project's existing quotes 1, 2, 3, ... in creation order.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt" ASC) AS rn
  FROM "Quote"
)
UPDATE "Quote"
SET "revisionNo" = ranked.rn
FROM ranked
WHERE "Quote".id = ranked.id;

ALTER TABLE "Quote" ALTER COLUMN "revisionNo" SET NOT NULL;

-- Seed the atomic per-project counter (see lib/document-sequence.ts) so future quotes
-- on a project that already has quotes continue the sequence instead of restarting at 1.
INSERT INTO "DocumentCounter" (id, value)
SELECT 'quote-rev:' || "projectId", MAX("revisionNo")
FROM "Quote"
GROUP BY "projectId"
ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;
