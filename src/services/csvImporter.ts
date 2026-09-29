import { db } from '../utils/db'
import { parseWeeklyCSV } from '../utils/csvParser'
import type { PlatformFinalizeWeekResult } from '../utils/multiLeagueApi'

export interface ImportResult {
  success: boolean
  recordsImported: number
  errors: string[]
  week: number
  matchupsFinalized?: number
  leaguesProcessed?: number
  leaguesFailed?: number
  autoFilled?: number
  leagueErrors?: { league_id: string; error: string }[]
  finalizeError?: string
}

export async function platformFinalizeWeek(
  week: number,
  season: number = 2025
): Promise<PlatformFinalizeWeekResult> {
  const { data, error } = await db.rpc('platform_finalize_week', {
    p_week: week,
    p_season: season,
  })

  if (error) throw new Error(error.message)

  return (data ?? {
    week,
    season,
    leagues_processed: 0,
    leagues_failed: 0,
    auto_filled: 0,
    matchups_finalized: 0,
    league_errors: [],
  }) as PlatformFinalizeWeekResult
}

export async function importWeeklyCSV(csvData: string, week: number, season: number = 2025): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    recordsImported: 0,
    errors: [],
    week
  }

  try {
    // Parse the CSV data
    const { qbPerformances } = parseWeeklyCSV(csvData, week)
    
    if (qbPerformances.length === 0) {
      result.errors.push('No QB performance data found in CSV')
      return result
    }

    // Prepare data for database insertion
    const gameStatsData = qbPerformances.map(qb => ({
      team_abbr: qb.team,
      week,
      season,
      opponent: '', // Would need to be extracted from CSV or determined separately
      pass_completions: qb.passCompletions,
      pass_attempts: qb.passAttempts,
      pass_yards: qb.passYards,
      pass_tds: qb.touchdowns,
      interceptions: qb.interceptions,
      sacks: qb.sacks,
      sack_yards: qb.sackYards,
      qbr: qb.qbr,
      rush_yards: qb.rushYards,
      rush_tds: qb.rushTouchdowns,
      longest_play: qb.longestPlay,
      fumbles: qb.fumbles,
      fumbles_lost: qb.fumblesLost,
      defensive_td: qb.defensiveTD,
      safety: qb.safety,
      game_ending_fumble: qb.gameEndingFumble,
      game_winning_drive: qb.gameWinningDrive,
      benching: qb.benching,
      completion_percent: qb.completionPercent,
      net_pass_yards: qb.netPassYards,
      total_tds: qb.totalTouchdowns,
      final_score: qb.finalScore
    }))

    // Check if data for this week already exists
    const { data: existingData, error: checkError } = await db
      .from('game_stats')
      .select('id')
      .eq('week', week)
      .eq('season', season)

    if (checkError) {
      result.errors.push(`Error checking existing data: ${checkError.message}`)
      return result
    }

    if (existingData && existingData.length > 0) {
      // Delete existing data for this week
      const { error: deleteError } = await db
        .from('game_stats')
        .delete()
        .eq('week', week)
        .eq('season', season)

      if (deleteError) {
        result.errors.push(`Error deleting existing data: ${deleteError.message}`)
        return result
      }
    }

    // Insert new data
    const { data: insertedData, error: insertError } = await db
      .from('game_stats')
      .insert(gameStatsData)
      .select()

    if (insertError) {
      result.errors.push(`Error inserting data: ${insertError.message}`)
      return result
    }

    result.success = true
    result.recordsImported = insertedData?.length || 0

    // Lock lineups + weeks across all leagues, then persist matchup scores.
    // One site-wide upload closes scoring for every league (idempotent).
    try {
      const finalized = await platformFinalizeWeek(week, season)
      result.matchupsFinalized = finalized.matchups_finalized
      result.leaguesProcessed = finalized.leagues_processed
      result.leaguesFailed = finalized.leagues_failed
      result.autoFilled = finalized.auto_filled
      result.leagueErrors = finalized.league_errors
      console.log(
        `✅ platform_finalize_week week ${week}: ` +
          `${finalized.matchups_finalized} matchup(s), ` +
          `${finalized.leagues_processed} league(s), ` +
          `${finalized.auto_filled} auto-filled`
      )
      if (finalized.leagues_failed > 0) {
        result.finalizeError =
          `${finalized.leagues_failed} league(s) failed to lock lineups; ` +
          `${finalized.matchups_finalized} matchup(s) still finalized`
      }
    } catch (error) {
      result.finalizeError = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ platform_finalize_week failed:', error)
    }

    return result

  } catch (error) {
    result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return result
  }
}

export async function getImportHistory(): Promise<{ week: number; season: number; recordsCount: number; importedAt: string }[]> {
  const { data, error } = await db
    .from('game_stats')
    .select('week, season, created_at')
    .order('week', { ascending: false })

  if (error) {
    console.error('Error fetching import history:', error)
    return []
  }

  // Group by week and season to get counts
  const weekGroups: { [key: string]: { week: number; season: number; recordsCount: number; importedAt: string } } = {}

  data?.forEach((stat: any) => {
    const key = `${stat.season}-${stat.week}`
    if (!weekGroups[key]) {
      weekGroups[key] = {
        week: stat.week,
        season: stat.season,
        recordsCount: 0,
        importedAt: stat.created_at
      }
    }
    weekGroups[key].recordsCount++
  })

  return Object.values(weekGroups)
}

export async function deleteWeekData(week: number, season: number = 2025): Promise<boolean> {
  try {
    const { error } = await db
      .from('game_stats')
      .delete()
      .eq('week', week)
      .eq('season', season)

    if (error) {
      console.error('Error deleting week data:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Unexpected error deleting week data:', error)
    return false
  }
}
