import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xjmiczrvfagyavlfaspb.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqbWljenJ2ZmFneWF2bGZhc3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMjI2MDgsImV4cCI6MjA3Njg5ODYwOH0.8zCP-BuV_3kwXd_7X8HkCAUaPjN6WTWrtY0uYeZ7r9k'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
