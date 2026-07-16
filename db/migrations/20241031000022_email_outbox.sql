-- Phase 6.4: transactional email outbox + draft/invite enqueue hooks.

CREATE TABLE IF NOT EXISTS email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_email TEXT, -- optional override; otherwise resolved from auth.users
    template TEXT NOT NULL, -- 'draft_turn' | 'invite' | 'lineup_reminder'
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS email_outbox_pending_idx
    ON email_outbox (created_at)
    WHERE sent_at IS NULL;

ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;

-- No client access; server poller uses adminPool
REVOKE ALL ON email_outbox FROM anon, authenticated;
GRANT ALL ON email_outbox TO service_role;

CREATE OR REPLACE FUNCTION enqueue_email(
    p_user_id UUID,
    p_template TEXT,
    p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    INSERT INTO email_outbox (recipient_user_id, template, payload)
    VALUES (p_user_id, p_template, COALESCE(p_payload, '{}'::jsonb))
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION enqueue_email FROM PUBLIC, anon, authenticated;

-- When draft advances (or starts), email the manager on the clock
CREATE OR REPLACE FUNCTION notify_draft_turn_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    mgr UUID;
    league_name TEXT;
    prefs JSONB;
BEGIN
    IF NEW.draft_status IS DISTINCT FROM 'in_progress' OR NEW.draft_current_pick IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.draft_current_pick IS NOT DISTINCT FROM NEW.draft_current_pick
       AND OLD.draft_status IS NOT DISTINCT FROM NEW.draft_status THEN
        RETURN NEW;
    END IF;

    SELECT ft.manager_user_id, NEW.name
    INTO mgr, league_name
    FROM draft_picks dp
    JOIN fantasy_teams ft ON ft.id = dp.fantasy_team_id
    WHERE dp.league_id = NEW.id
      AND dp.pick_number = NEW.draft_current_pick;

    IF mgr IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT up.email_preferences INTO prefs
    FROM user_profiles up
    WHERE up.user_id = mgr;

    -- Default to sending when no profile; respect league_updates = false
    IF prefs IS NOT NULL AND COALESCE((prefs->>'league_updates')::boolean, true) = false THEN
        RETURN NEW;
    END IF;

    PERFORM enqueue_email(
        mgr,
        'draft_turn',
        jsonb_build_object(
            'league_id', NEW.id,
            'league_name', league_name,
            'pick_number', NEW.draft_current_pick
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leagues_draft_turn_email ON leagues;
CREATE TRIGGER leagues_draft_turn_email
    AFTER INSERT OR UPDATE OF draft_status, draft_current_pick ON leagues
    FOR EACH ROW
    EXECUTE FUNCTION notify_draft_turn_email();

-- When an invite code is created, email the league owner with the shareable code
CREATE OR REPLACE FUNCTION notify_invite_created_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    owner_id UUID;
    league_name TEXT;
    prefs JSONB;
BEGIN
    SELECT lm.user_id, l.name INTO owner_id, league_name
    FROM leagues l
    JOIN league_members lm ON lm.league_id = l.id AND lm.role = 'owner'
    WHERE l.id = NEW.league_id
    LIMIT 1;

    IF owner_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT up.email_preferences INTO prefs
    FROM user_profiles up
    WHERE up.user_id = owner_id;

    IF prefs IS NOT NULL AND COALESCE((prefs->>'league_updates')::boolean, true) = false THEN
        RETURN NEW;
    END IF;

    PERFORM enqueue_email(
        owner_id,
        'invite',
        jsonb_build_object(
            'league_id', NEW.league_id,
            'league_name', league_name,
            'code', NEW.code,
            'expires_at', NEW.expires_at
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_invitations_email ON league_invitations;
CREATE TRIGGER league_invitations_email
    AFTER INSERT ON league_invitations
    FOR EACH ROW
    EXECUTE FUNCTION notify_invite_created_email();

-- Queue lineup reminders for managers missing a lineup for the given week
CREATE OR REPLACE FUNCTION enqueue_lineup_reminders(
    p_week INTEGER,
    p_season INTEGER DEFAULT 2025
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    queued INTEGER := 0;
    r RECORD;
    prefs JSONB;
BEGIN
    FOR r IN
        SELECT DISTINCT ft.manager_user_id AS user_id, l.id AS league_id, l.name AS league_name
        FROM fantasy_teams ft
        JOIN leagues l ON l.id = ft.league_id AND l.season = p_season
        JOIN weeks w ON w.league_id = l.id AND w.week_number = p_week AND NOT w.is_locked
        WHERE ft.manager_user_id IS NOT NULL
          AND l.draft_status = 'complete'
          AND NOT EXISTS (
              SELECT 1 FROM fantasy_lineups fl
              WHERE fl.fantasy_team_id = ft.id AND fl.week = p_week
          )
    LOOP
        SELECT up.email_preferences INTO prefs
        FROM user_profiles up
        WHERE up.user_id = r.user_id;

        IF prefs IS NOT NULL AND COALESCE((prefs->>'matchup_reminders')::boolean, true) = false THEN
            CONTINUE;
        END IF;

        PERFORM enqueue_email(
            r.user_id,
            'lineup_reminder',
            jsonb_build_object(
                'league_id', r.league_id,
                'league_name', r.league_name,
                'week', p_week
            )
        );
        queued := queued + 1;
    END LOOP;

    RETURN queued;
END;
$$;

-- Callable only by the server (admin connection); not granted to authenticated
REVOKE EXECUTE ON FUNCTION enqueue_lineup_reminders FROM PUBLIC, anon, authenticated;
