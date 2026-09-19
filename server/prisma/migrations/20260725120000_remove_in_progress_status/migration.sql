-- Drop the IN_PROGRESS project status: the company doesn't track the construction phase,
-- so the lifecycle is now DRAFT -> QUOTED -> APPROVED -> COMPLETED (CANCELLED terminal).
-- Postgres can't remove a value from an enum in place, so recreate the type. No rows use
-- IN_PROGRESS (verified before writing this migration), so the cast below can't fail.
ALTER TYPE "ProjectStatus" RENAME TO "ProjectStatus_old";
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'QUOTED', 'APPROVED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "Project" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "status" TYPE "ProjectStatus" USING ("status"::text::"ProjectStatus");
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "ProjectStatus_old";
