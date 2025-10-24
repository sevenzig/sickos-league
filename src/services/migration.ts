import { supabase } from '../utils/supabase'
import { initialLeagueData } from '../data/initialData'
import { week1GameStats } from '../data/week1Data'

export interface MigrationResult {
  success: boolean
  teamsImported: number
  lineupsImported: number
  matchupsImported: number
  gameStatsImported: number
  errors: string[]
}

export async function migrateHistoricalData(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    teamsImported: 0,
    lineupsImported: 0,
    matchupsImported: 0,
    gameStatsImported: 0,
    errors: []
  }

  try {
    // 1. Import Teams (handle duplicates gracefully)
    console.log('Importing teams...')
    
    let teamsData: any[] = []
    let teamsError = null
    
    try {
      const { data, error } = await supabase
        .from('teams')
        .insert(
          initialLeagueData.teams.map(team => ({
            name: team.name,
            rosters: team.rosters
          }))
        )
        .select()
      
      teamsData = data || []
      teamsError = error
    } catch (error) {
      // If teams already exist, that's okay - continue with migration
      console.log('Teams may already exist, continuing with migration...')
      teamsData = []
      teamsError = null
    }

    if (teamsError && !teamsError.message.includes('duplicate key')) {
      result.errors.push(`Error importing teams: ${teamsError.message}`)
      return result
    }

    result.teamsImported = teamsData.length
    console.log(`Imported ${result.teamsImported} new teams`)

    // 2. Import Matchups
    console.log('Importing matchups...')
    
    // Get team IDs for matchup creation
    const { data: allTeams, error: teamsFetchError } = await supabase
      .from('teams')
      .select('id, name')

    if (teamsFetchError || !allTeams) {
      result.errors.push(`Error fetching teams for matchups: ${teamsFetchError?.message || 'No teams found'}`)
      return result
    }

    const teamIdMap = new Map(allTeams.map(team => [team.name, team.id]))

    const matchupData = initialLeagueData.matchups.map(matchup => {
      const team1Id = teamIdMap.get(matchup.team1)
      const team2Id = teamIdMap.get(matchup.team2)

      if (!team1Id || !team2Id) {
        throw new Error(`Team not found for matchup: ${matchup.team1} vs ${matchup.team2}`)
      }

      return {
        week: matchup.week,
        team1_id: team1Id,
        team2_id: team2Id,
        team1_score: matchup.team1Score,
        team2_score: matchup.team2Score,
        winner_id: null // Will be calculated later
      }
    })

    // Check for existing matchups
    const { data: existingMatchups } = await supabase
      .from('matchups')
      .select('week, team1_id, team2_id')
    
    const existingMatchupKeys = new Set(
      existingMatchups?.map(m => `${m.week}-${m.team1_id}-${m.team2_id}`) || []
    )
    
    const matchupsToInsert = matchupData.filter(matchup => 
      !existingMatchupKeys.has(`${matchup.week}-${matchup.team1_id}-${matchup.team2_id}`)
    )
    
    let matchupsData: any[] = []
    let matchupsError = null
    
    if (matchupsToInsert.length > 0) {
      const { data, error } = await supabase
        .from('matchups')
        .insert(matchupsToInsert)
        .select()
      
      matchupsData = data || []
      matchupsError = error
    } else {
      console.log('All matchups already exist, skipping matchup import')
    }

    if (matchupsError) {
      result.errors.push(`Error importing matchups: ${matchupsError.message}`)
      return result
    }

    result.matchupsImported = matchupsData.length
    console.log(`Imported ${result.matchupsImported} new matchups`)

    // 3. Import Lineups
    console.log('Importing lineups...')
    
    const lineupData = initialLeagueData.lineups.map(lineup => {
      const teamId = teamIdMap.get(lineup.teamName)
      if (!teamId) {
        throw new Error(`Team not found for lineup: ${lineup.teamName}`)
      }

      return {
        team_id: teamId,
        week: lineup.week,
        active_qbs: lineup.activeQBs
      }
    })

    // Check for existing lineups
    const { data: existingLineups } = await supabase
      .from('lineups')
      .select('team_id, week')
    
    const existingLineupKeys = new Set(
      existingLineups?.map(l => `${l.team_id}-${l.week}`) || []
    )
    
    const lineupsToInsert = lineupData.filter(lineup => 
      !existingLineupKeys.has(`${lineup.team_id}-${lineup.week}`)
    )
    
    let lineupsData: any[] = []
    let lineupsError = null
    
    if (lineupsToInsert.length > 0) {
      const { data, error } = await supabase
        .from('lineups')
        .insert(lineupsToInsert)
        .select()
      
      lineupsData = data || []
      lineupsError = error
    } else {
      console.log('All lineups already exist, skipping lineup import')
    }

    if (lineupsError) {
      result.errors.push(`Error importing lineups: ${lineupsError.message}`)
      return result
    }

    result.lineupsImported = lineupsData.length
    console.log(`Imported ${result.lineupsImported} new lineups`)

    // 4. Import Game Stats (Week 1)
    console.log('Importing week 1 game stats...')
    
    const gameStatsData = week1GameStats.map(stat => ({
      team_abbr: stat.teamName,
      week: stat.week,
      season: 2025,
      opponent: '', // Would need to be determined from matchup data
      pass_completions: 0, // These would need to be extracted from the actual QB stats
      pass_attempts: 0,
      pass_yards: 0,
      pass_tds: 0,
      interceptions: 0,
      sacks: 0,
      sack_yards: 0,
      qbr: 0,
      rush_yards: 0,
      rush_tds: 0,
      longest_play: 0,
      fumbles: 0,
      fumbles_lost: 0,
      defensive_td: 0,
      safety: 0,
      game_ending_fumble: 0,
      game_winning_drive: 0,
      benching: 0,
      completion_percent: 0,
      net_pass_yards: 0,
      total_tds: 0,
      final_score: stat.calculatedScore
    }))

    // Check for existing game stats
    const { data: existingGameStats } = await supabase
      .from('game_stats')
      .select('team_abbr, week, season')
    
    const existingGameStatsKeys = new Set(
      existingGameStats?.map(g => `${g.team_abbr}-${g.week}-${g.season}`) || []
    )
    
    const gameStatsToInsert = gameStatsData.filter(stat => 
      !existingGameStatsKeys.has(`${stat.team_abbr}-${stat.week}-${stat.season}`)
    )
    
    let gameStatsDataResult: any[] = []
    let gameStatsError = null
    
    if (gameStatsToInsert.length > 0) {
      const { data, error } = await supabase
        .from('game_stats')
        .insert(gameStatsToInsert)
        .select()
      
      gameStatsDataResult = data || []
      gameStatsError = error
    } else {
      console.log('All game stats already exist, skipping game stats import')
    }

    if (gameStatsError) {
      result.errors.push(`Error importing game stats: ${gameStatsError.message}`)
      return result
    }

    result.gameStatsImported = gameStatsDataResult.length
    console.log(`Imported ${result.gameStatsImported} new game stats`)

    // 5. Create League Settings (only if none exist)
    console.log('Creating league settings...')
    
    const { data: existingSettings } = await supabase
      .from('league_settings')
      .select('id')
      .limit(1)
    
    let settingsError = null
    
    if (!existingSettings || existingSettings.length === 0) {
      const { error } = await supabase
        .from('league_settings')
        .insert({
          current_week: initialLeagueData.currentWeek,
          locked_weeks: initialLeagueData.lockedWeeks,
          season: 2025
        })
      
      settingsError = error
    } else {
      console.log('League settings already exist, skipping settings creation')
    }

    if (settingsError) {
      result.errors.push(`Error creating league settings: ${settingsError.message}`)
      return result
    }

    result.success = true
    console.log('Migration completed successfully!')

    return result

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    result.errors.push(`Migration failed: ${errorMessage}`)
    console.error('Migration error:', error)
    return result
  }
}

export async function checkMigrationStatus(): Promise<{
  isMigrated: boolean
  teamsCount: number
  lineupsCount: number
  matchupsCount: number
  gameStatsCount: number
}> {
  try {
    const [teamsResult, lineupsResult, matchupsResult, gameStatsResult] = await Promise.all([
      supabase.from('teams').select('id', { count: 'exact', head: true }),
      supabase.from('lineups').select('id', { count: 'exact', head: true }),
      supabase.from('matchups').select('id', { count: 'exact', head: true }),
      supabase.from('game_stats').select('id', { count: 'exact', head: true })
    ])

    const teamsCount = teamsResult.count || 0
    const lineupsCount = lineupsResult.count || 0
    const matchupsCount = matchupsResult.count || 0
    const gameStatsCount = gameStatsResult.count || 0

    return {
      isMigrated: teamsCount > 0 && lineupsCount > 0 && matchupsCount > 0,
      teamsCount,
      lineupsCount,
      matchupsCount,
      gameStatsCount
    }
  } catch (error) {
    console.error('Error checking migration status:', error)
    return {
      isMigrated: false,
      teamsCount: 0,
      lineupsCount: 0,
      matchupsCount: 0,
      gameStatsCount: 0
    }
  }
}
