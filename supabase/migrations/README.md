# Migrations

- File order = replay order. The database history (`supabase_migrations.schema_migrations`) holds the version numbers that were applied through the Supabase tool; they never matched these file names one to one, and nothing reads the file names, so renaming files is safe.
- 2026-10-22: files that carried placeholder dates in the future (20261022090000 ... 20261101100000) were renamed to 20261022000105 ... 20261022000175 (same order). `dashboard_views` was applied directly and is saved as 20261022000943. New migrations use the real UTC time of the day they are written (YYYYMMDDHHMMSS), always after the newest file.
