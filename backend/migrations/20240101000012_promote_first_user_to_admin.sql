-- Promote the earliest-registered user to admin if no admin exists yet.
-- Ensures there is always at least one admin account.
UPDATE users
SET role = 'admin'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');
