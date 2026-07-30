// Multi-League API utilities
// Functions for interacting with the new multi-league system

import { db } from './db'
import { uploadPhoto, deletePhoto, uploadTeamPhoto, photoUrl } from './apiClient'
import { generateLeagueId, isLeagueId, isValidLeagueId, isValidUUID, isShortId, isValidShortId } from './urlUtils'

// Types for proper multi-league system
export interface League {
  id: string
  name: string
  season: number
  teams_started_per_week: number
  draft_at?: string
  created_at: string
  user_role: 'owner' | 'manager'
  member_count: number
  fantasy_teams_count: number
  draft_status: 'pending' | 'in_progress' | 'complete'
  my_pick: boolean
  draft_mode: 'async' | 'live'
  draft_pick_seconds: number
  draft_paused: boolean
}

export interface FantasyTeam {
  id: string
  league_id: string
  team_name: string
  manager_user_id?: string
  manager_email?: string
  created_at: string
  logo_url?: string | null
}

export interface Invitation {
  code: string
  league_id: string
  league_name: string
  team_name?: string
  expires_at: string
  is_valid: boolean
  used_at?: string
  used_by_user_id?: string
}

export interface LeagueMatchup {
  id: string
  week: number
  fantasy_team1_id: string
  fantasy_team1_name: string
  team1_manager_email?: string
  fantasy_team2_id: string
  fantasy_team2_name: string
  team2_manager_email?: string
  locks_at?: string
  week_locked: boolean
  team1_score: number | null
  team2_score: number | null
  is_complete: boolean
}

export interface FantasyLineup {
  fantasy_team_id: string
  fantasy_team_name: string
  manager_email?: string
  active_nfl_teams: string[] // NFL team UUIDs
  active_nfl_team_names: string[] // NFL team names for display
  is_locked: boolean
  week_locked: boolean
}

export interface RosterEntry {
  nfl_team_id: string
  nfl_team_name: string
  acquired_via: 'draft' | 'commissioner'
  draft_pick_number?: number
}

export interface LeagueRosterEntry extends RosterEntry {
  fantasy_team_id: string
  fantasy_team_name: string
}

export interface DraftPick {
  pick_number: number
  round: number
  fantasy_team_id: string
  fantasy_team_name: string
  nfl_team_id: string | null
  nfl_team_name: string | null
  picked_at: string | null
  is_auto: boolean
}

export interface DraftState {
  draft_status: 'pending' | 'in_progress' | 'complete'
  draft_mode: 'async' | 'live'
  draft_at: string | null
  draft_pick_seconds: number
  draft_paused: boolean
  draft_pick_deadline: string | null
  draft_current_pick: number | null
  room_opens_at: string | null
  draft_order_set: boolean
  on_clock: {
    fantasy_team_id: string
    team_name: string
    manager_user_id: string | null
  } | null
  picks: DraftPick[]
}

export interface CreateLeagueOptions {
  ownerTeamName?: string
  draftMode?: 'async' | 'live'
  draftAt?: string | null
  draftPickSeconds?: 30 | 60 | 90
}

export interface DraftSettingsUpdate {
  draftMode?: 'async' | 'live'
  draftAt?: string | null
  draftPickSeconds?: 30 | 60 | 90
}

export interface WeekStatus {
  week: number
  locks_at?: string
  is_locked: boolean
  lineups_submitted: number
  total_teams: number
}

export interface UserProfile {
  user_id: string
  email: string | null
  first_name?: string | null
  last_name?: string | null
  profile_photo_url?: string | null
  email_preferences: EmailPreferences
  fantasy_teams: FantasyTeamInfo[]
  created_at: string
  updated_at: string
}

export interface EmailPreferences {
  marketing: boolean
  league_updates: boolean
  matchup_reminders: boolean
  weekly_summaries: boolean
}

export interface FantasyTeamInfo {
  league_id: string
  league_name: string
  team_name: string
  team_id: string
}

// League management functions
export class MultiLeagueApi {
  // Resolve league ID - handles both 8-char IDs and legacy UUIDs
  static async resolveLeagueId(leagueId: string): Promise<string> {
    // If it's a legacy UUID, return it as-is
    if (isValidUUID(leagueId)) {
      return leagueId;
    }

    // If it looks like an 8-character ID (either new league ID or shortened UUID), resolve it
    if (isValidLeagueId(leagueId)) {
      try {
        // Use RPC to get user's leagues and find matching one
        const userLeagues = await this.getUserLeagues();

        // Find league where UUID starts with the short ID
        const matchingLeague = userLeagues.find(league =>
          league.id.toLowerCase().startsWith(leagueId.toLowerCase())
        );

        if (matchingLeague) {
          return matchingLeague.id;
        }

        // League not found in user's leagues
        throw new Error(`League not found or access denied. You may not be a member of this league.`);
      } catch (err) {
        console.warn('Failed to resolve 8-character ID via user leagues:', err);
        // Re-throw the error if it's already a meaningful message
        if (err instanceof Error && err.message.includes('League not found')) {
          throw err;
        }
        throw new Error(`Unable to access league. Please check that you're signed in and have permission to view this league.`);
      }
    }

    throw new Error(`Invalid league ID format: ${leagueId}`);
  }
  // Create a new league
  static async createLeague(
    name: string,
    season: number = 2025,
    teamsStartedPerWeek: number = 1,
    options?: CreateLeagueOptions | string
  ): Promise<string> {
    // Back-compat: fourth arg used to be ownerTeamName string
    const opts: CreateLeagueOptions =
      typeof options === 'string' ? { ownerTeamName: options } : options || {};

    const { data, error } = await db.rpc('create_league', {
      league_name: name,
      season,
      teams_started_per_week: teamsStartedPerWeek,
      owner_team_name: opts.ownerTeamName || null,
      p_draft_mode: opts.draftMode || 'async',
      p_draft_at: opts.draftAt ?? null,
      p_draft_pick_seconds: opts.draftPickSeconds ?? 90,
    });

    if (error) throw new Error(error.message);
    return data; // This returns the league ID (currently a UUID)
  }

  // Get user's leagues
  static async getUserLeagues(): Promise<League[]> {
    const { data, error } = await db.rpc('get_user_leagues')

    if (error) throw new Error(error.message)
    // pg returns COUNT(*)/bigint as strings; coerce so === 8 checks work
    return (data || []).map((row: League) => ({
      ...row,
      member_count: Number(row.member_count),
      fantasy_teams_count: Number(row.fantasy_teams_count),
    }))
  }

  // Get league details
  static async getLeagueDetails(leagueId: string) {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('get_league_details', {
      league_id: fullLeagueId,
    })

    if (error) throw new Error(error.message)
    const row = data?.[0] || null
    if (!row) return null
    // pg returns COUNT(*)/bigint as strings; coerce so === 8 checks work
    return {
      ...row,
      member_count: Number(row.member_count),
      fantasy_teams_count: Number(row.fantasy_teams_count),
    }
  }

  // Get league fantasy teams
  static async getLeagueFantasyTeams(leagueId: string): Promise<FantasyTeam[]> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('get_league_fantasy_teams', {
      p_league_id: fullLeagueId,
    })

    if (error) throw new Error(error.message)
    return data || []
  }

  // Create fantasy team
  static async createFantasyTeam(
    leagueId: string,
    teamName: string,
    managerUserId?: string
  ): Promise<string> {
    const { data, error } = await db.rpc('create_fantasy_team', {
      p_league_id: leagueId,
      p_team_name: teamName,
      p_manager_user_id: managerUserId,
    })

    if (error) throw new Error(error.message)
    return data
  }

  // Invitation system for code-based league joining
  static async generateInviteCode(leagueId: string): Promise<string> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    // Generate a simple 8-character code
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    // Set expiration to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { data, error } = await db
      .from('league_invitations')
      .insert({
        code,
        league_id: fullLeagueId,
        expires_at: expiresAt.toISOString(),
        is_active: true
      })
      .select('code')
      .single();

    if (error) throw new Error(error.message);
    return data.code;
  }

  static async getLeagueInvitations(leagueId: string): Promise<Invitation[]> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db
      .from('league_invitations')
      .select(`
        code,
        league_id,
        expires_at,
        is_active,
        used_at,
        used_by_user_id,
        leagues!inner(name)
      `)
      .eq('league_id', fullLeagueId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((invite: any) => ({
      code: invite.code,
      league_id: invite.league_id,
      league_name: invite.leagues.name,
      expires_at: invite.expires_at,
      is_valid: new Date(invite.expires_at) > new Date() && !invite.used_at,
      used_at: invite.used_at,
      used_by_user_id: invite.used_by_user_id
    }));
  }

  static async validateInviteCode(code: string): Promise<Invitation | null> {
    const { data, error } = await db
      .from('league_invitations')
      .select(`
        code,
        league_id,
        expires_at,
        is_active,
        used_at,
        used_by_user_id,
        leagues!inner(name)
      `)
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !data) return null;

    const invitation: Invitation = {
      code: data.code,
      league_id: data.league_id,
      league_name: data.leagues.name,
      expires_at: data.expires_at,
      is_valid: new Date(data.expires_at) > new Date() && !data.used_at,
      used_at: data.used_at,
      used_by_user_id: data.used_by_user_id
    };

    return invitation;
  }

  static async redeemInviteCode(code: string, teamName: string): Promise<string> {
    const { data, error } = await db.rpc('redeem_invite_code', {
      p_invite_code: code.toUpperCase(),
      p_team_name: teamName
    });

    if (error) throw new Error(error.message);
    return data; // Returns the league_id
  }

  // Schedule management
  static async generateSchedule(leagueId: string): Promise<boolean> {
    const { data, error } = await db.rpc('generate_league_schedule', {
      p_league_id: leagueId,
    })

    if (error) throw new Error(error.message)
    return data
  }

  static async getLeagueSchedule(
    leagueId: string,
    week?: number
  ): Promise<LeagueMatchup[]> {
    const { data, error } = await db.rpc('get_league_schedule', {
      p_league_id: leagueId,
      p_week: week,
    })

    if (error) throw new Error(error.message)
    return data || []
  }

  // Week and lineup management
  static async setWeekLock(
    leagueId: string,
    weekNumber: number,
    locksAt?: string,
    isLocked: boolean = false
  ): Promise<boolean> {
    const { data, error } = await db.rpc('set_week_lock', {
      league_id: leagueId,
      week_number: weekNumber,
      locks_at: locksAt,
      is_locked: isLocked,
    })

    if (error) throw new Error(error.message)
    return data
  }

  static async toggleWeekLock(
    leagueId: string,
    weekNumber: number,
    lockState: boolean
  ): Promise<boolean> {
    const { data, error } = await db.rpc('toggle_week_lock', {
      p_league_id: leagueId,
      p_week_number: weekNumber,
      p_lock_state: lockState,
    })

    if (error) throw new Error(error.message)
    return data
  }

  // Persist matchup scores for a week across ALL leagues (Phase 4).
  // Idempotent; returns the number of matchups finalized.
  static async finalizeWeekScores(week: number, season: number = 2025): Promise<number> {
    const { data, error } = await db.rpc('finalize_week_scores', {
      p_week: week,
      p_season: season,
    })

    if (error) throw new Error(error.message)
    return data ?? 0
  }

  static async setFantasyLineup(
    fantasyTeamId: string,
    week: number,
    activeNflTeams: string[]
  ): Promise<boolean> {
    const { data, error } = await db.rpc('set_fantasy_lineup', {
      p_fantasy_team_id: fantasyTeamId,
      p_week: week,
      p_active_nfl_teams: activeNflTeams,
    })

    if (error) throw new Error(error.message)
    return data
  }

  // Async snake draft (Phase 2) + live room controls
  static async startDraft(leagueId: string, draftOrder?: string[]): Promise<boolean> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('start_draft', {
      p_league_id: fullLeagueId,
      p_draft_order: draftOrder,
    })

    if (error) throw new Error(error.message)
    return data
  }

  static async setDraftOrder(leagueId: string, draftOrder: string[]): Promise<boolean> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('set_draft_order', {
      p_league_id: fullLeagueId,
      p_draft_order: draftOrder,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  /** Dev helper: fill empty slots with unmanaged Bot N teams (pending draft only). */
  static async fillDraftBots(leagueId: string): Promise<number> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('fill_draft_bots', {
      p_league_id: fullLeagueId,
    });
    if (error) throw new Error(error.message);
    return data ?? 0;
  }

  static async updateLeagueDraftSettings(
    leagueId: string,
    settings: DraftSettingsUpdate
  ): Promise<boolean> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const args: Record<string, unknown> = { p_league_id: fullLeagueId };
    if (settings.draftMode !== undefined) args.p_draft_mode = settings.draftMode;
    if (settings.draftAt !== undefined) args.p_draft_at = settings.draftAt;
    if (settings.draftPickSeconds !== undefined) args.p_draft_pick_seconds = settings.draftPickSeconds;
    const { data, error } = await db.rpc('update_league_draft_settings', args);
    if (error) throw new Error(error.message);
    return data;
  }

  static async pauseDraft(leagueId: string): Promise<boolean> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('pause_draft', { p_league_id: fullLeagueId });
    if (error) throw new Error(error.message);
    return data;
  }

  static async resumeDraft(leagueId: string): Promise<boolean> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('resume_draft', { p_league_id: fullLeagueId });
    if (error) throw new Error(error.message);
    return data;
  }

  static async makeDraftPick(leagueId: string, nflTeamId: string): Promise<boolean> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('make_draft_pick', {
      p_league_id: fullLeagueId,
      p_nfl_team_id: nflTeamId,
    })

    if (error) throw new Error(error.message)
    return data
  }

  static async makeDraftPickFor(leagueId: string, nflTeamId: string): Promise<boolean> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('make_draft_pick_for', {
      p_league_id: fullLeagueId,
      p_nfl_team_id: nflTeamId,
    })

    if (error) throw new Error(error.message)
    return data
  }

  static async getDraftState(leagueId: string): Promise<DraftState> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('get_draft_state', {
      p_league_id: fullLeagueId,
    })

    if (error) throw new Error(error.message)
    return data
  }

  static async lockFantasyLineup(
    fantasyTeamId: string,
    week: number
  ): Promise<boolean> {
    const { data, error } = await db.rpc('lock_fantasy_lineup', {
      p_fantasy_team_id: fantasyTeamId,
      p_week: week,
    })

    if (error) throw new Error(error.message)
    return data
  }

  // Commissioner: auto-fill missing lineups, lock all lineups + the week.
  // Returns the number of auto-filled lineups.
  static async finalizeWeekLineups(
    leagueId: string,
    week: number
  ): Promise<number> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('finalize_week_lineups', {
      p_league_id: fullLeagueId,
      p_week: week,
    })

    if (error) throw new Error(error.message)
    return data
  }

  // Roster ownership (Phase 1)
  static async getTeamRoster(fantasyTeamId: string): Promise<RosterEntry[]> {
    const { data, error } = await db.rpc('get_team_roster', {
      p_fantasy_team_id: fantasyTeamId,
    })

    if (error) throw new Error(error.message)
    return data || []
  }

  static async getLeagueRosters(leagueId: string): Promise<LeagueRosterEntry[]> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('get_league_rosters', {
      p_league_id: fullLeagueId,
    })

    if (error) throw new Error(error.message)
    return data || []
  }

  static async getFantasyLineups(
    leagueId: string,
    week: number
  ): Promise<FantasyLineup[]> {
    const { data, error } = await db.rpc('get_fantasy_lineups_for_week', {
      p_league_id: leagueId,
      p_week: week,
    })

    if (error) throw new Error(error.message)
    return data || []
  }

  // Kickoff times for every NFL team playing in a given week (Phase 4).
  // Returns an empty array if game times haven't been seeded yet.
  static async getNflKickoffTimes(
    week: number
  ): Promise<{ nfl_team_id: string; game_time: string }[]> {
    const { data, error } = await db.rpc('get_nfl_kickoff_times', {
      p_week: week,
    })

    if (error) throw new Error(error.message)
    return data || []
  }

  /** Platform-admin upsert of NFL kickoffs into matchups.game_time for a week. */
  static async upsertNflKickoffTimes(
    week: number,
    games: { team1: string; team2: string; game_time: string }[]
  ): Promise<number> {
    const { data, error } = await db.rpc('upsert_nfl_kickoff_times', {
      p_week: week,
      p_games: JSON.stringify(games),
    })

    if (error) throw new Error(error.message)
    return data ?? 0
  }

  static async getWeekStatus(
    leagueId: string,
    weekNumber: number
  ): Promise<WeekStatus | null> {
    const { data, error } = await db.rpc('get_week_status', {
      league_id: leagueId,
      week_number: weekNumber,
    })

    if (error) throw new Error(error.message)
    return data?.[0] || null
  }

  // Standings (using existing view — 0-0 rows before any scores)
  static async getLeagueStandings(leagueId: string) {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db
      .from('v_league_standings')
      .select('*')
      .eq('league_id', fullLeagueId)
      .order('rank')

    if (error) throw new Error(error.message)
    return data || []
  }

  // User Profile Management
  static async getUserProfile(userId?: string): Promise<UserProfile | null> {
    const { data, error } = await db.rpc('get_user_profile_with_teams', {
      p_user_id: userId || undefined
    })

    if (error) throw new Error(error.message)
    return data?.[0] || null
  }

  static async updateUserProfile(profileData: {
    first_name?: string
    last_name?: string
    profile_photo_url?: string
    email_preferences?: EmailPreferences
  }): Promise<boolean> {
    const { data, error } = await db.rpc('update_user_profile', {
      p_first_name: profileData.first_name,
      p_last_name: profileData.last_name,
      p_profile_photo_url: profileData.profile_photo_url,
      p_email_preferences: profileData.email_preferences
    })

    if (error) throw new Error(error.message)
    return data
  }

  static async updateFantasyTeamName(teamId: string, teamName: string): Promise<boolean> {
    const { data, error } = await db.rpc('update_fantasy_team_name', {
      p_team_id: teamId,
      p_team_name: teamName
    })

    if (error) throw new Error(error.message)
    return data
  }

  // Team logo (Phase 5.2) - stored on the API's photos volume, path persisted
  // onto fantasy_teams.logo_url by the server. Returns the absolute URL.
  static async uploadTeamLogo(teamId: string, file: File): Promise<string> {
    const relativeUrl = await uploadTeamPhoto(teamId, file)
    return photoUrl(relativeUrl)
  }

  // League management (Phase 5.1) - commissioner toolkit
  static async removeLeagueMember(leagueId: string, userId: string): Promise<boolean> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('remove_league_member', {
      p_league_id: fullLeagueId,
      p_user_id: userId,
    })

    if (error) throw new Error(error.message)
    return data
  }

  static async transferCommissioner(leagueId: string, newOwnerUserId: string): Promise<boolean> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('transfer_commissioner', {
      p_league_id: fullLeagueId,
      p_new_owner_user_id: newOwnerUserId,
    })

    if (error) throw new Error(error.message)
    return data
  }

  static async deleteLeague(leagueId: string): Promise<boolean> {
    const fullLeagueId = await this.resolveLeagueId(leagueId);
    const { data, error } = await db.rpc('delete_league', {
      p_league_id: fullLeagueId,
    })

    if (error) throw new Error(error.message)
    return data
  }

  // Profile Photo Management (stored on the API's photos volume)
  static async uploadProfilePhoto(file: File): Promise<string> {
    const { data: userData, error: userError } = await db.auth.getUser()
    if (userError || !userData.user) throw new Error('User not authenticated')

    const relativeUrl = await uploadPhoto(file)
    return photoUrl(relativeUrl)
  }

  static async deleteProfilePhoto(): Promise<boolean> {
    const { data: userData, error: userError } = await db.auth.getUser()
    if (userError || !userData.user) throw new Error('User not authenticated')

    await deletePhoto()
    return true
  }

  static getProfilePhotoUrl(userId: string): string {
    return photoUrl(`/photos/${userId}/profile.jpg`)
  }
}