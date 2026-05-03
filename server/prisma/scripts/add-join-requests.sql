DO $$ BEGIN
  CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProjectJoinRequest" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "status"       "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
  "message"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"   TIMESTAMP(3),
  "resolvedById" TEXT,
  CONSTRAINT "ProjectJoinRequest_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_projectId_userId_key" UNIQUE ("projectId", "userId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectJoinRequest" ADD CONSTRAINT "ProjectJoinRequest_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectJoinRequest_projectId_idx" ON "ProjectJoinRequest"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectJoinRequest_userId_idx"    ON "ProjectJoinRequest"("userId");
CREATE INDEX IF NOT EXISTS "ProjectJoinRequest_status_idx"    ON "ProjectJoinRequest"("status");
