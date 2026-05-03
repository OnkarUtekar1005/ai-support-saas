-- AlterTable
ALTER TABLE "ErrorLog" ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ErrorLog_organizationId_lastSeenAt_idx" ON "ErrorLog"("organizationId", "lastSeenAt");
