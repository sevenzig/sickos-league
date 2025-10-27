import { supabase } from '../utils/supabase'
import { parseWeeklyCSV } from '../utils/csvParser'
import { updateCurrentWeek } from './database'

export interface ImportResult {
  success: boolean
  recordsImported: number
  errors: string[]
  week: number
  newCurrentWeek?: number
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
    const { data: existingData, error: checkError } = await supabase
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
      const { error: deleteError } = await supabase
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
    const { data: insertedData, error: insertError } = await supabase
      .from('game_stats')
      .insert(gameStatsData)
      .select()

    if (insertError) {
      result.errors.push(`Error inserting data: ${insertError.message}`)
      return result
    }

    result.success = true
    result.recordsImported = insertedData?.length || 0

    // Auto-advance current week if we just imported data for the current week
    try {
      const { data: currentSettings } = await supabase
        .from('league_settings')
        .select('current_week')
        .order('id', { ascending: false })
        .limit(1)
        .single()

      const currentWeek = currentSettings?.current_week || 1
      
      if (week === currentWeek) {
        const newCurrentWeek = week + 1
        await updateCurrentWeek(newCurrentWeek)
        result.newCurrentWeek = newCurrentWeek
        console.log(`🔄 Auto-advanced current week from ${currentWeek} to ${newCurrentWeek}`)
      }
    } catch (error) {
      console.warn('Failed to auto-advance current week:', error)
      // Don't fail the import if week advancement fails
    }

    return result

  } catch (error) {
    result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return result
  }
}

export async function getImportHistory(): Promise<{ week: number; season: number; recordsCount: number; importedAt: string }[]> {
  const { data, error } = await supabase
    .from('game_stats')
    .select('week, season, created_at')
    .order('week', { ascending: false })

  if (error) {
    console.error('Error fetching import history:', error)
    return []
  }

  // Group by week and season to get counts
  const weekGroups: { [key: string]: { week: number; season: number; recordsCount: number; importedAt: string } } = {}

  data?.forEach(stat => {
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
    const { error } = await supabase
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
