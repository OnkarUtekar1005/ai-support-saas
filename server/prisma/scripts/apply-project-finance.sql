-- Idempotent: safe to re-run even if tables already exist
-- Run with: npx prisma db execute --file prisma/scripts/apply-project-finance.sql

-- 1. Drop dealId from Activity (safe if column doesn't exist)
ALTER TABLE "Activity" DROP COLUMN IF EXISTS "dealId";

-- 2. Drop Deal table (safe if doesn't exist)
DROP TABLE IF EXISTS "Deal" CASCADE;

-- 3. Drop DealStage enum (safe if doesn't exist)
DROP TYPE IF EXISTS "DealStage";

-- 4. New columns on Project
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "totalBudget" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "currency"    TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "deadline"    TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clientContactId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Project" ADD CONSTRAINT "Project_clientContactId_fkey"
    FOREIGN KEY ("clientContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Enums (idempotent)
DO $$ BEGIN
  CREATE TYPE "CostType" AS ENUM ('BASE_COST', 'EXTRA_FEATURE', 'EXPENSE', 'PAYMENT_RECEIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceType" AS ENUM ('INVOICE', 'PURCHASE_ORDER', 'WORK_ORDER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. ProjectCost
CREATE TABLE IF NOT EXISTS "ProjectCost" (
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

DO $$ BEGIN
  ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectCost_projectId_idx" ON "ProjectCost"("projectId");

-- 7. ProjectAttachment
CREATE TABLE IF NOT EXISTS "ProjectAttachment" (
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

DO $$ BEGIN
  ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectAttachment_projectId_idx" ON "ProjectAttachment"("projectId");

-- 8. ProjectUpdate
CREATE TABLE IF NOT EXISTS "ProjectUpdate" (
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

DO $$ BEGIN
  ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectUpdate_projectId_idx" ON "ProjectUpdate"("projectId");

-- 9. Invoice
CREATE TABLE IF NOT EXISTS "Invoice" (
  "id"             TEXT NOT NULL,
  "invoiceNumber"  TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type"           "InvoiceType"   NOT NULL DEFAULT 'INVOICE',
  "status"         "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "currency"       TEXT NOT NULL DEFAULT 'USD',
  "subtotal"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxRate"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxAmount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lineItems"      JSONB NOT NULL DEFAULT '[]',
  "notes"          TEXT,
  "issueDate"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate"        TIMESTAMP(3),
  "contactId"      TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_invoiceNumber_organizationId_key"
    UNIQUE ("invoiceNumber", "organizationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Invoice_projectId_idx"      ON "Invoice"("projectId");
CREATE INDEX IF NOT EXISTS "Invoice_organizationId_idx" ON "Invoice"("organizationId");
CREATE INDEX IF NOT EXISTS "Invoice_status_idx"         ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "Invoice_type_idx"           ON "Invoice"("type");
