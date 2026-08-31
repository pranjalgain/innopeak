-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    event_timestamp TIMESTAMPTZ DEFAULT NOW(),
    requested_api VARCHAR(255),
    app_version VARCHAR(50),
    system_name VARCHAR(100),
    system_version VARCHAR(50),
    user_agent TEXT,
    ip_address VARCHAR(45),
    country VARCHAR(100),
    host_name VARCHAR(255),
    table_name VARCHAR(100),
    operation_type VARCHAR(50),
    severity VARCHAR(20),
    description TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- session_id INT REFERENCES sessions(id) ON DELETE SET NULL,
    -- user_id INT REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT operation_type_check CHECK (operation_type IN ('VIEW', 'INSERT', 'UPDATE', 'DELETE')),
    CONSTRAINT severity_check CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

-- Indexes for faster lookup based on filters
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_timestamp ON audit_logs(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_operation ON audit_logs(table_name, operation_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_requested_api ON audit_logs(requested_api);
CREATE INDEX IF NOT EXISTS idx_audit_logs_country ON audit_logs(country);
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id);


-- DB logs Table
CREATE TABLE IF NOT EXISTS db_audit_logs (
    id SERIAL PRIMARY KEY,
    event_timestamp TIMESTAMPTZ DEFAULT NOW(),
    table_name VARCHAR(100) NOT NULL,
    operation_type VARCHAR(10) NOT NULL,
    db_user VARCHAR(100),
    db_name VARCHAR(100),
    old_value JSONB,
    new_value JSONB,
    triggered_by TEXT DEFAULT current_user,
    CONSTRAINT operation_type_check CHECK (operation_type IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- Additional Migrations will go from here........