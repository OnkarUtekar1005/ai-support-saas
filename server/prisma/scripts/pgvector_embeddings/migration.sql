-- ⚠️  PREREQUISITES BEFORE RUNNING THIS MIGRATION:
--
-- Install pgvector on your PostgreSQL installation first:
--
-- Windows (PostgreSQL 17):
--   1. Download from: https://github.com/pgvector/pgvector/releases
--      Get: vector-0.x.x-pg17-windows-x86_64.zip
--   2. Unzip and copy:
--      vector.dll      → C:\Program Files\PostgreSQL\17\lib\
--      vector.control  → C:\Program Files\PostgreSQL\17\share\extension\
--      vector--*.sql   → C:\Program Files\PostgreSQL\17\share\extension\
--   3. Restart PostgreSQL service (no server restart needed)
--
-- macOS:
--   brew install pgvector
--
-- Linux (Ubuntu/Debian):
--   sudo apt install postgresql-17-pgvector
--
-- Verify installation:
--   psql -c "CREATE EXTENSION IF NOT EXISTS vector;"
--
-- Then apply this migration:
--   npx prisma migrate deploy
--   (or: npx prisma db execute --file prisma/migrations/20260430000002_pgvector_embeddings/migration.sql)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Migrate embedding column from float8[] to vector(768)
ALTER TABLE "KnowledgeEntry" ADD COLUMN "embedding_vec" vector(768);

-- Backfill: cast existing float arrays to vector type
-- (PostgreSQL can convert float8[] → vector via text intermediary)
UPDATE "KnowledgeEntry"
SET "embedding_vec" = embedding::text::vector
WHERE array_length(embedding, 1) = 768;

-- Swap columns
ALTER TABLE "KnowledgeEntry" DROP COLUMN "embedding";
ALTER TABLE "KnowledgeEntry" RENAME COLUMN "embedding_vec" TO "embedding";

-- Create IVFFlat index for approximate nearest-neighbor search
-- (lists = 100 is a good starting point; tune to sqrt(row_count) for large tables)
CREATE INDEX "KnowledgeEntry_embedding_idx"
    ON "KnowledgeEntry"
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
