// Multi-League API utilities
// Functions for interacting with the new multi-league system

import { supabase } from './supabase'

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
}

export interface FantasyTeam {
  id: string
  league_id: string
  team_name: string
  manager_user_id?: string
  manager_email?: string
  created_at: string
}

export interface Invitation {
  league_id: string
  league_name: string
  team_name?: string
  expires_at: string
  is_valid: boolean
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

export interface WeekStatus {
  week: number
  locks_at?: string
  is_locked: boolean
  lineups_submitted: number
  total_teams: number
}

// League management functions
export class MultiLeagueApi {
  // Create a new league
  static async createLeague(
    name: string,
    season: number = 2025,
    teamsStartedPerWeek: number = 1
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_league', {
      league_name: name,
      season,
      teams_started_per_week: teamsStartedPerWeek,
    })

    if (error) throw error
    return data
  }

  // Get user's leagues
  static async getUserLeagues(): Promise<League[]> {
    const { data, error } = await supabase.rpc('get_user_leagues')

    if (error) throw error
    return data || []
  }

  // Get league details
  static async getLeagueDetails(leagueId: string) {
    const { data, error } = await supabase.rpc('get_league_details', {
      league_id: leagueId,
    })

    if (error) throw error
    return data?.[0] || null
  }

  // Get league fantasy teams
  static async getLeagueFantasyTeams(leagueId: string): Promise<FantasyTeam[]> {
    const { data, error } = await supabase.rpc('get_league_fantasy_teams', {
      p_league_id: leagueId,
    })

    if (error) throw error
    return data || []
  }

  // Create fantasy team
  static async createFantasyTeam(
    leagueId: string,
    teamName: string,
    managerUserId?: string
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_fantasy_team', {
      p_league_id: leagueId,
      p_team_name: teamName,
      p_manager_user_id: managerUserId,
    })

    if (error) throw error
    return data
  }

  // Set draft time
  static async setDraftTime(leagueId: string, draftTime: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('set_draft_time', {
      league_id: leagueId,
      draft_time: draftTime,
    })

    if (error) throw error
    return data
  }

  // TODO: Invitation system needs to be updated for fantasy teams
  // For now, fantasy teams are created directly by league owners

  // Team management
  static async updateFantasyTeamName(
    fantasyTeamId: string,
    teamName: string
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('fantasy_teams')
      .update({ team_name: teamName })
      .eq('id', fantasyTeamId)
      .select()

    if (error) throw error
    return data.length > 0
  }

  // Schedule management
  static async generateSchedule(leagueId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('generate_league_schedule', {
      p_league_id: leagueId,
    })

    if (error) throw error
    return data
  }

  static async getLeagueSchedule(
    leagueId: string,
    week?: number
  ): Promise<LeagueMatchup[]> {
    const { data, error } = await supabase.rpc('get_league_schedule', {
      p_league_id: leagueId,
      p_week: week,
    })

    if (error) throw error
    return data || []
  }

  // Week and lineup management
  static async setWeekLock(
    leagueId: string,
    weekNumber: number,
    locksAt?: string,
    isLocked: boolean = false
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('set_week_lock', {
      league_id: leagueId,
      week_number: weekNumber,
      locks_at: locksAt,
      is_locked: isLocked,
    })

    if (error) throw error
    return data
  }

  static async toggleWeekLock(
    leagueId: string,
    weekNumber: number,
    lockState: boolean
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('toggle_week_lock', {
      league_id: leagueId,
      week_number: weekNumber,
      lock_state: lockState,
    })

    if (error) throw error
    return data
  }

  static async setFantasyLineup(
    fantasyTeamId: string,
    week: number,
    activeNflTeams: string[]
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('set_fantasy_lineup', {
      p_fantasy_team_id: fantasyTeamId,
      p_week: week,
      p_active_nfl_teams: activeNflTeams,
    })

    if (error) throw error
    return data
  }

  static async getFantasyLineups(
    leagueId: string,
    week: number
  ): Promise<FantasyLineup[]> {
    const { data, error } = await supabase.rpc('get_fantasy_lineups_for_week', {
      p_league_id: leagueId,
      p_week: week,
    })

    if (error) throw error
    return data || []
  }

  static async getWeekStatus(
    leagueId: string,
    weekNumber: number
  ): Promise<WeekStatus | null> {
    const { data, error } = await supabase.rpc('get_week_status', {
      league_id: leagueId,
      week_number: weekNumber,
    })

    if (error) throw error
    return data?.[0] || null
  }

  // Standings (using existing view)
  static async getLeagueStandings(leagueId: string) {
    const { data, error } = await supabase
      .from('v_league_standings')
      .select('*')
      .eq('league_id', leagueId)
      .order('rank')

    if (error) throw error
    return data || []
  }
}