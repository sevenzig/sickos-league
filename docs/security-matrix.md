# Security permission matrix (Phase 6.1)

Auth layers: Express JWT (`requireUser` on `/api/db/query` and `/api/rpc`) + Postgres RLS / `SECURITY DEFINER` RPC checks via `auth.uid()` and `auth.is_platform_admin()`.

Legend: `-` denied, `R` read, `W` write (insert/update/delete), `RPC` via allowlisted function only.

## Tables (`POST /api/db/query`)

| Table | Anon | Member | Non-member | Commissioner | Platform admin |
|---|---|---|---|---|---|
| teams | - (401) | R | R | R | R/W |
| game_stats | - | R | R | R | R/W |
| lineups (legacy) | - | R | R | R | R |
| matchups (legacy) | - | R | R | R | R |
| league_settings (legacy) | - | R | R | R | R |
| leagues | - | R (own leagues) | - | R | R (if member) |
| league_members | - | R (own leagues) | - | R | R (if member) |
| league_invitations | - | R (own leagues) | - | R | R (if member) |
| fantasy_teams | - | R (own leagues) | - | R | R (if member) |
| fantasy_lineups | - | R; W own team | - | R; W any team in league | R (if member) |
| league_matchups | - | R | - | R | R (if member) |
| weeks | - | R | - | R | R (if member) |
| user_profiles | - | R own + co-members | R own | R own + co-members | R own + co-members |
| audit_logs | - | R (own leagues) | - | R | R (own leagues or admin) |
| v_league_standings | - | R (own leagues) | - | R | R (if member) |
| v_user_leagues | - | R (own rows) | - | R | R (own rows) |

Notes:
- Anonymous callers receive HTTP 401 before RLS.
- Legacy `lineups` / `matchups` / `league_settings` have no write policies (Phase 6.2 archive).
- Multi-league mutations that change game state go through RPCs, not table writes.

## RPCs (`POST /api/rpc/:fn`) — all require auth

| RPC | Member | Non-member | Commissioner (owner) | Platform admin |
|---|---|---|---|---|
| create_league | W (creates) | W | W | W |
| get_user_leagues / get_league_details / get_league_fantasy_teams | R | - | R | R |
| redeem_invite_code | W | W | W | W |
| start_draft / make_draft_pick_for / generate_league_schedule | - | - | W | -† |
| make_draft_pick / set_fantasy_lineup / lock_fantasy_lineup | W (own turn/team) | - | W (own or override) | -† |
| finalize_week_lineups / set_week_lock / toggle_week_lock | - | - | W | -† |
| finalize_week_scores | - | - | - | W |
| remove_league_member / transfer_commissioner / delete_league | - | - | W | -† |
| update_user_profile | W (self) | W (self) | W (self) | W (self) |
| update_fantasy_team_name | W (manager) | - | W | -† |

† Platform admin is not automatically a commissioner; they must be a league member/owner to pass owner checks, unless calling platform-only RPCs.

## Pen-test

Run `node scripts/verify-phase6-pentest.mjs` against a running API (`http://localhost:3001`) with a seeded non-member account. Expects 401 for unauthenticated calls and RPC/table rejection for cross-league mutations.
