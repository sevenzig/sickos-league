-- Login by username or email. Username required on signup going forward;
-- existing users keep email-only login until they set a username.

ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS username VARCHAR(32);

-- Unique when set (NULLs allowed for legacy rows)
CREATE UNIQUE INDEX IF NOT EXISTS auth_users_username_lower_uidx
    ON auth.users (LOWER(username))
    WHERE username IS NOT NULL;
