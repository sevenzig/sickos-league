-- One-time password reset tokens. The API stores only a SHA-256 hash.
-- The raw token exists in the reset email and is never written here.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
    ON password_reset_tokens (user_id)
    WHERE used_at IS NULL;

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- No client access; reset routes use adminPool
REVOKE ALL ON password_reset_tokens FROM anon, authenticated;
GRANT ALL ON password_reset_tokens TO service_role;
