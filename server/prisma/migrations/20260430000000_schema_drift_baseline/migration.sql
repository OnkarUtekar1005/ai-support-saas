-- Baseline migration capturing schema changes that exist in the DB but were not in migration history.
-- AutoFixConfig.language made nullable with no default
ALTER TABLE "AutoFixConfig" ALTER COLUMN "language" DROP NOT NULL;
ALTER TABLE "AutoFixConfig" ALTER COLUMN "language" DROP DEFAULT;

-- Project(name, organizationId) unique index
CREATE UNIQUE INDEX IF NOT EXISTS "Project_name_organizationId_key" ON "Project"("name", "organizationId");
