-- ============================================================
-- Replace Deals with Project Finance module
-- Removes: Deal table, DealStage enum, Activity.dealId column
-- Adds: ProjectCost, ProjectAttachment, ProjectUpdate, Invoice
--       + deadline, totalBudget, currency, clientContactId on Project
-- ============================================================

-- 1. Drop dealId from Activity (FK constraint drops automatically)
ALTER TABLE "Activity" DROP COLUMN IF EXISTS "dealId";

-- 2. Drop Deal table (all FKs referencing it drop automatically)
DROP TABLE IF EXISTS "Deal";

-- 3. Drop DealStage enum
DROP TYPE IF EXISTS "DealStage";

-- 4. Add new columns to Project
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "totalBudget" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "deadline" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clientContactId" TEXT;

ALTER TABLE "Project" ADD CONSTRAINT "Project_clientContactId_fkey"
  FOREIGN KEY ("clientContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. New enums
CREATE TYPE "CostType" AS ENUM ('BASE_COST', 'EXTRA_FEATURE', 'EXPENSE', 'PAYMENT_RECEIVED');
CREATE TYPE "InvoiceType" AS ENUM ('INVOICE', 'PURCHASE_ORDER', 'WORK_ORDER');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'CANCELLED');

-- 6. ProjectCost table
CREATE TABLE "ProjectCost" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "type"        "CostType" NOT NULL DEFAULT 'BASE_COST',
  "amount"      DOUBLE PRECISION NOT NULL,
  "date"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "addedById"   TEXT,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectCost_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_addedById_fkey"
  FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ProjectCost_projectId_idx" ON "ProjectCost"("projectId");

-- 7. ProjectAttachment table
CREATE TABLE "ProjectAttachment" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "fileType"     TEXT NOT NULL,
  "filePath"     TEXT NOT NULL,
  "fileSize"     INTEGER,
  "notes"        TEXT,
  "uploadedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ProjectAttachment_projectId_idx" ON "ProjectAttachment"("projectId");

-- 8. ProjectUpdate table
CREATE TABLE "ProjectUpdate" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "content"     TEXT NOT NULL,
  "sentEmails"  TEXT[] DEFAULT ARRAY[]::TEXT[],
  "emailSent"   BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectUpdate_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ProjectUpdate_projectId_idx" ON "ProjectUpdate"("projectId");

-- 9. Invoice table
CREATE TABLE "Invoice" (
  "id"            TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "projectId"     TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type"          "InvoiceType" NOT NULL DEFAULT 'INVOICE',
  "status"        "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "currency"      TEXT NOT NULL DEFAULT 'USD',
  "subtotal"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxRate"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxAmount"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lineItems"     JSONB NOT NULL DEFAULT '[]',
  "notes"         TEXT,
  "issueDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate"       TIMESTAMP(3),
  "contactId"     TEXT,
  "createdById"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_invoiceNumber_organizationId_key"
  UNIQUE ("invoiceNumber", "organizationId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Invoice_projectId_idx" ON "Invoice"("projectId");
CREATE INDEX "Invoice_organizationId_idx" ON "Invoice"("organizationId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX "Invoice_type_idx" ON "Invoice"("type");
