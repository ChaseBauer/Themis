DROP INDEX IF EXISTS idx_devices_hostname_trgm;
ALTER TABLE devices DROP COLUMN IF EXISTS hostname;
