-- Reconcile drift: Template.updatedAt is `@updatedAt` in schema.prisma (app-managed on every
-- write) but the DB still carried a leftover column DEFAULT from the earlier
-- 20260811120000_add_template_description_updatedat migration. Drop it so the live DB matches
-- the Prisma schema and `prisma migrate diff` reports no difference. No client regeneration
-- needed — the Prisma schema never declared a default, so the generated client is unchanged.
ALTER TABLE "Template" ALTER COLUMN "updatedAt" DROP DEFAULT;
