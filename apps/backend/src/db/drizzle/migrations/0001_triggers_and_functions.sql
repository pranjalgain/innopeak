-- Function to prevent deletion of audit logs
CREATE OR REPLACE FUNCTION prevent_audit_log_deletion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Deletion is not allowed in the audit_logs table';
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the prevent_audit_log_deletion function before deletion
CREATE TRIGGER prevent_deletion
BEFORE DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_deletion();

-- Function to log DB changes
CREATE OR REPLACE FUNCTION log_db_changes()
RETURNS TRIGGER AS $$
DECLARE
    trigger_source TEXT;
BEGIN
    IF TG_WHEN = 'AFTER' THEN
        trigger_source := TG_NAME;
    ELSE
        trigger_source := current_user;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO db_audit_logs(table_name, operation_type, new_value, triggered_by, db_user, db_name)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(NEW), trigger_source, session_user, current_database());
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO db_audit_logs(table_name, operation_type, old_value, new_value, triggered_by, db_user, db_name)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD), row_to_json(NEW), trigger_source, session_user, current_database());
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO db_audit_logs(table_name, operation_type, old_value, triggered_by, db_user, db_name)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD), trigger_source, session_user, current_database());
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
