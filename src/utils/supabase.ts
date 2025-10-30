import { createClient } from '@supabase/supabase-js'

// Environment-specific configuration
const isDevelopment = import.meta.env.MODE === 'development'

// Get Supabase configuration with fail-fast behavior
function getSupabaseConfig() {
  let supabaseUrl: string
  let supabaseAnonKey: string

  if (isDevelopment && import.meta.env.VITE_DEV_SUPABASE_URL) {
    // Use development Supabase project if configured
    supabaseUrl = import.meta.env.VITE_DEV_SUPABASE_URL
    supabaseAnonKey = import.meta.env.VITE_DEV_SUPABASE_ANON_KEY
  } else {
    // Use production Supabase project
    supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  }

  // Fail fast if environment variables are missing
  if (!supabaseUrl) {
    throw new Error(
      `Missing required environment variable: ${
        isDevelopment ? 'VITE_DEV_SUPABASE_URL or VITE_SUPABASE_URL' : 'VITE_SUPABASE_URL'
      }`
    )
  }

  if (!supabaseAnonKey) {
    throw new Error(
      `Missing required environment variable: ${
        isDevelopment ? 'VITE_DEV_SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY' : 'VITE_SUPABASE_ANON_KEY'
      }`
    )
  }

  return { supabaseUrl, supabaseAnonKey }
}

const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig()

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Feature flags
export const FEATURE_FLAGS = {
  ENABLE_MULTI_LEAGUE: import.meta.env.VITE_ENABLE_MULTI_LEAGUE === 'true',
} as const

// Environment info
export const ENV_INFO = {
  isDevelopment,
  supabaseUrl,
  multiLeagueEnabled: FEATURE_FLAGS.ENABLE_MULTI_LEAGUE,
} as const

// Database types for TypeScript
export interface Database {
  public: {
    Tables: {
      teams: {
        Row: {
          id: number
          name: string
          rosters: string[]
          created_at: string
        }
        Insert: {
          id?: number
          name: string
          rosters: string[]
          created_at?: string
        }
        Update: {
          id?: number
          name?: string
          rosters?: string[]
          created_at?: string
        }
      }
      game_stats: {
        Row: {
          id: number
          team_abbr: string
          week: number
          season: number
          opponent: string
          pass_completions: number
          pass_attempts: number
          pass_yards: number
          pass_tds: number
          interceptions: number
          sacks: number
          sack_yards: number
          qbr: number
          rush_yards: number
          rush_tds: number
          longest_play: number
          fumbles: number
          fumbles_lost: number
          defensive_td: number
          safety: number
          game_ending_fumble: number
          game_winning_drive: number
          benching: number
          completion_percent: number
          net_pass_yards: number
          total_tds: number
          final_score: number
          created_at: string
        }
        Insert: {
          id?: number
          team_abbr: string
          week: number
          season: number
          opponent: string
          pass_completions: number
          pass_attempts: number
          pass_yards: number
          pass_tds: number
          interceptions: number
          sacks: number
          sack_yards: number
          qbr: number
          rush_yards: number
          rush_tds: number
          longest_play: number
          fumbles: number
          fumbles_lost: number
          defensive_td: number
          safety: number
          game_ending_fumble: number
          game_winning_drive: number
          benching: number
          completion_percent: number
          net_pass_yards: number
          total_tds: number
          final_score: number
          created_at?: string
        }
        Update: {
          id?: number
          team_abbr?: string
          week?: number
          season?: number
          opponent?: string
          pass_completions?: number
          pass_attempts?: number
          pass_yards?: number
          pass_tds?: number
          interceptions?: number
          sacks?: number
          sack_yards?: number
          qbr?: number
          rush_yards?: number
          rush_tds?: number
          longest_play?: number
          fumbles?: number
          fumbles_lost?: number
          defensive_td?: number
          safety?: number
          game_ending_fumble?: number
          game_winning_drive?: number
          benching?: number
          completion_percent?: number
          net_pass_yards?: number
          total_tds?: number
          final_score?: number
          created_at?: string
        }
      }
      lineups: {
        Row: {
          id: number
          team_id: number
          week: number
          active_qbs: string[]
          created_at: string
        }
        Insert: {
          id?: number
          team_id: number
          week: number
          active_qbs: string[]
          created_at?: string
        }
        Update: {
          id?: number
          team_id?: number
          week?: number
          active_qbs?: string[]
          created_at?: string
        }
      }
      matchups: {
        Row: {
          id: number
          week: number
          team1_id: number
          team2_id: number
          team1_score: number
          team2_score: number
          winner_id: number | null
          created_at: string
        }
        Insert: {
          id?: number
          week: number
          team1_id: number
          team2_id: number
          team1_score?: number
          team2_score?: number
          winner_id?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          week?: number
          team1_id?: number
          team2_id?: number
          team1_score?: number
          team2_score?: number
          winner_id?: number | null
          created_at?: string
        }
      }
      league_settings: {
        Row: {
          id: number
          current_week: number
          locked_weeks: number[]
          season: number
          created_at: string
        }
        Insert: {
          id?: number
          current_week: number
          locked_weeks: number[]
          season: number
          created_at?: string
        }
        Update: {
          id?: number
          current_week?: number
          locked_weeks?: number[]
          season?: number
          created_at?: string
        }
      }
    }
  }
}
