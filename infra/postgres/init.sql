-- Initialize database extensions and settings
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER DATABASE erp_db SET client_encoding TO 'UTF8';

DO $$
BEGIN
    RAISE NOTICE 'Database initialized successfully';
END $$;
