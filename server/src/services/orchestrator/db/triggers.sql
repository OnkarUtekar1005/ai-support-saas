-- ═══════════════════════════════════════════
-- PostgreSQL LISTEN/NOTIFY Triggers
-- for Orchestrator Agent
-- ═══════════════════════════════════════════

-- Run this once against your database:
--   psql $DATABASE_URL -f src/db/triggers.sql
-- Or use: npm run setup:triggers

-- ─── Trigger: notify on new error log ───
CREATE OR REPLACE FUNCTION notify_new_error() RETURNS trigger AS $$
BEGIN
  IF NEW.level IN ('ERROR', 'FATAL') THEN
    PERFORM pg_notify('new_error', json_build_object(
      'id', NEW.id,
      'level', NEW.level,
      'source', NEW.source,
      'projectId', NEW."projectId",
      'organizationId', NEW."organizationId",
      'analyzed', NEW.analyzed
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS error_log_insert_trigger ON "ErrorLog";
CREATE TRIGGER error_log_insert_trigger
  AFTER INSERT ON "ErrorLog"
  FOR EACH ROW EXECUTE FUNCTION notify_new_error();

-- ─── Trigger: notify when error analysis completes ───
CREATE OR REPLACE FUNCTION notify_error_analyzed() RETURNS trigger AS $$
BEGIN
  IF OLD.analyzed = false AND NEW.analyzed = true THEN
    PERFORM pg_notify('error_analyzed', json_build_object(
      'id', NEW.id,
      'level', NEW.level,
      'source', NEW.source,
      'projectId', NEW."projectId",
      'organizationId', NEW."organizationId",
      'aiAnalysis', LEFT(COALESCE(NEW."aiAnalysis", ''), 500),
      'aiSuggestion', LEFT(COALESCE(NEW."aiSuggestion", ''), 500)
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS error_log_analyzed_trigger ON "ErrorLog";
CREATE TRIGGER error_log_analyzed_trigger
  AFTER UPDATE ON "ErrorLog"
  FOR EACH ROW EXECUTE FUNCTION notify_error_analyzed();

-- ─── Trigger: notify on pipeline status change ───
CREATE OR REPLACE FUNCTION notify_pipeline_update() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM pg_notify('pipeline_status', json_build_object(
      'id', NEW.id,
      'status', NEW.status,
      'projectId', NEW."projectId",
      'organizationId', NEW."organizationId"
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pipeline_status_trigger ON "Pipeline";
CREATE TRIGGER pipeline_status_trigger
  AFTER UPDATE ON "Pipeline"
  FOR EACH ROW EXECUTE FUNCTION notify_pipeline_update();

-- Also fire on INSERT (when pipeline is first created with status DETECTED)
CREATE OR REPLACE FUNCTION notify_pipeline_insert() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('pipeline_status', json_build_object(
    'id', NEW.id,
    'status', NEW.status,
    'projectId', NEW."projectId",
    'organizationId', NEW."organizationId"
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pipeline_insert_trigger ON "Pipeline";
CREATE TRIGGER pipeline_insert_trigger
  AFTER INSERT ON "Pipeline"
  FOR EACH ROW EXECUTE FUNCTION notify_pipeline_insert();
