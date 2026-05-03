-- Add InvoiceSettings table + billingAddress to Invoice
-- Run: npx prisma db execute --file prisma/scripts/add-invoice-settings.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "InvoiceSettings" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "companyName"     TEXT,
  "companyAddress"  TEXT,
  "companyPhone"    TEXT,
  "companyEmail"    TEXT,
  "companyWebsite"  TEXT,
  "logoUrl"         TEXT,
  "primaryColor"    TEXT NOT NULL DEFAULT '#1e40af',
  "accentColor"     TEXT NOT NULL DEFAULT '#dbeafe',
  "footerText"      TEXT NOT NULL DEFAULT 'Thank you for your business!',
  "paymentTerms"    TEXT NOT NULL DEFAULT 'Payment due within 30 days',
  "bankDetails"     TEXT,
  "taxId"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceSettings_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "InvoiceSettings" ADD CONSTRAINT "InvoiceSettings_organizationId_key" UNIQUE ("organizationId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InvoiceSettings" ADD CONSTRAINT "InvoiceSettings_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add billingAddress to Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "billingAddress" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "billingName"    TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "billingEmail"   TEXT;
