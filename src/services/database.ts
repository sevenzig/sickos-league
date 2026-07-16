import { db } from '../utils/db'
import { Team, WeeklyLineup, Matchup, GameStats, LeagueData } from '../types'

// Database service layer for all API-backed database operations

export async function loadTeams(): Promise<Team[]> {
  const { data, error } = await db
    .from('teams')
    .select('*')
    .order('name')

  if (error) {
    console.error('Error loading teams:', error)
    throw error
  }

  return data?.map((team: any) => ({
    name: team.name,
    rosters: team.rosters
  })) || []
}

export async function loadLineups(): Promise<WeeklyLineup[]> {
  console.log('🔄 Loading lineups from database...');
  
  const { data, error } = await db
    .from('lineups')
    .select(`
      week,
      active_qbs,
      is_locked,
      teams!inner(name)
    `)
    .order('week')

  if (error) {
    console.error('❌ Error loading lineups:', error)
    throw error
  }

  const lineups = data?.map((lineup: any) => ({
    teamName: lineup.teams.name,
    week: lineup.week,
    activeQBs: lineup.active_qbs,
    isLocked: lineup.is_locked || false
  })) || []

  console.log(`✅ Loaded ${lineups.length} lineups from database:`, lineups);
  return lineups;
}

export async function loadMatchups(): Promise<Matchup[]> {
  const { data, error } = await db
    .from('matchups')
    .select(`
      week,
      team1_score,
      team2_score,
      winner_id,
      team1:teams!matchups_team1_id_fkey(name),
      team2:teams!matchups_team2_id_fkey(name)
    `)
    .order('week')

  if (error) {
    console.error('Error loading matchups:', error)
    throw error
  }

  return data?.map((matchup: any) => ({
    week: matchup.week,
    team1: matchup.team1.name,
    team2: matchup.team2.name,
    team1Score: matchup.team1_score,
    team2Score: matchup.team2_score,
    winner: matchup.winner_id ? 
      (matchup.winner_id === matchup.team1.id ? matchup.team1.name : matchup.team2.name) : 
      null
  })) || []
}

export async function loadGameStats(week?: number): Promise<GameStats[]> {
  let query = db
    .from('game_stats')
    .select('*')
    .order('week')

  if (week) {
    query = query.eq('week', week)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error loading game stats:', error)
    throw error
  }

  // Group by team and week to match GameStats interface
  const groupedStats: { [key: string]: GameStats } = {}

  data?.forEach((stat: any) => {
    const key = `${stat.team_abbr}-${stat.week}`
    if (!groupedStats[key]) {
      groupedStats[key] = {
        teamName: stat.team_abbr,
        week: stat.week,
        qbStats: {},
        calculatedScore: stat.final_score
      }
    }

    // Add QB stats (this would need to be expanded based on your QB data structure)
    groupedStats[key].qbStats[stat.team_abbr] = {
      passYards: stat.pass_yards,
      touchdowns: stat.pass_tds,
      completionPercent: stat.completion_percent,
      turnovers: stat.interceptions + stat.fumbles,
      events: [] // Would need to be calculated from stats
    }
  })

  return Object.values(groupedStats)
}

/**
 * Get QB performance data from the database for a specific week and team
 */
export async function getQBPerformanceFromDb(week: number, teamAbbr: string): Promise<any | null> {
  const { data, error } = await db
    .from('game_stats')
    .select('*')
    .eq('week', week)
    .eq('team_abbr', teamAbbr)
    .single()

  if (error) {
    console.error(`Error loading QB performance for ${teamAbbr} week ${week}:`, error)
    return null
  }

  if (!data) return null

  // Convert database rows to match the QBPerformance interface
  const events: string[] = []
  
  // Add events based on performance thresholds
  if (data.completion_percent <= 30) events.push('Poor Completion %')
  if (data.pass_yards <= 100) events.push('Low Pass Yards')
  if (data.pass_tds === 0) events.push('No Touchdowns')
  if (data.interceptions >= 3) events.push('Multiple Interceptions')
  if (data.fumbles >= 2) events.push('Multiple Fumbles')
  if (data.defensive_td > 0) events.push('Defensive TD')
  if (data.safety > 0) events.push('Safety')
  if (data.game_ending_fumble > 0) events.push('Game-ending Fumble')
  if (data.game_winning_drive > 0) events.push('Game-winning Drive')
  if (data.benching > 0) events.push('Benching')

  return {
    team: teamAbbr,
    passYards: data.pass_yards,
    touchdowns: data.pass_tds,
    completionPercent: data.completion_percent,
    turnovers: data.interceptions + data.fumbles,
    events,
    finalScore: data.final_score,
    // Additional stats from the database
    passCompletions: data.pass_completions,
    passAttempts: data.pass_attempts,
    interceptions: data.interceptions,
    sacks: data.sacks,
    sackYards: data.sack_yards,
    qbr: data.qbr,
    rushYards: data.rush_yards,
    rushTouchdowns: data.rush_tds,
    longestPlay: data.longest_play,
    fumbles: data.fumbles,
    fumblesLost: data.fumbles_lost,
    defensiveTD: data.defensive_td,
    safety: data.safety,
    gameEndingFumble: data.game_ending_fumble,
    gameWinningDrive: data.game_winning_drive,
    benching: data.benching,
    netPassYards: data.net_pass_yards,
    totalTouchdowns: data.total_tds
  }
}

/**
 * Get all QB performances for a specific week from the database (with caching)
 */
let qbPerformancesCache: { [week: number]: any[] } = {};
let cacheTimestamp: number = 0;
const CACHE_DURATION = 30000; // 30 seconds

export async function getWeeklyQBPerformancesFromDb(week: number): Promise<any[]> {
  const now = Date.now();
  
  // Check if we have cached data that's still fresh
  if (qbPerformancesCache[week] && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log(`Using cached QB performances for week ${week}`);
    return qbPerformancesCache[week];
  }

  console.log(`Fetching QB performances for week ${week} from the database`);
  const { data, error } = await db
    .from('game_stats')
    .select('*')
    .eq('week', week)
    .order('team_abbr')

  if (error) {
    console.error(`Error loading QB performances for week ${week}:`, error)
    return []
  }

  if (!data) return []

  const performances = data.map((stat: any) => {
    const events: string[] = []
    
    // Add events based on performance thresholds
    if (stat.completion_percent <= 30) events.push('Poor Completion %')
    if (stat.pass_yards <= 100) events.push('Low Pass Yards')
    if (stat.pass_tds === 0) events.push('No Touchdowns')
    if (stat.interceptions >= 3) events.push('Multiple Interceptions')
    if (stat.fumbles >= 2) events.push('Multiple Fumbles')
    if (stat.defensive_td > 0) events.push('Defensive TD')
    if (stat.safety > 0) events.push('Safety')
    if (stat.game_ending_fumble > 0) events.push('Game-ending Fumble')
    if (stat.game_winning_drive > 0) events.push('Game-winning Drive')
    if (stat.benching > 0) events.push('Benching')

    return {
      team: stat.team_abbr,
      passYards: stat.pass_yards,
      touchdowns: stat.pass_tds,
      completionPercent: stat.completion_percent,
      turnovers: stat.interceptions + stat.fumbles,
      events,
      finalScore: stat.final_score,
      // Additional stats from the database
      passCompletions: stat.pass_completions,
      passAttempts: stat.pass_attempts,
      interceptions: stat.interceptions,
      sacks: stat.sacks,
      sackYards: stat.sack_yards,
      qbr: stat.qbr,
      rushYards: stat.rush_yards,
      rushTouchdowns: stat.rush_tds,
      longestPlay: stat.longest_play,
      fumbles: stat.fumbles,
      fumblesLost: stat.fumbles_lost,
      defensiveTD: stat.defensive_td,
      safety: stat.safety,
      gameEndingFumble: stat.game_ending_fumble,
      gameWinningDrive: stat.game_winning_drive,
      benching: stat.benching,
      netPassYards: stat.net_pass_yards,
      totalTouchdowns: stat.total_tds
    }
  })

  // Cache the result
  qbPerformancesCache[week] = performances;
  cacheTimestamp = now;

  return performances
}

/**
 * Clear the QB performances cache (useful when data is updated)
 */
export function clearQBPerformancesCache(): void {
  qbPerformancesCache = {};
  cacheTimestamp = 0;
  console.log('QB performances cache cleared');
}

export async function loadLeagueSettings(): Promise<{ currentWeek: number; lockedWeeks: number[] }> {
  const { data, error } = await db
    .from('league_settings')
    .select('current_week, locked_weeks')
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    console.error('Error loading league settings:', error)
    return { currentWeek: 1, lockedWeeks: [] }
  }

  return {
    currentWeek: data?.current_week || 1,
    lockedWeeks: data?.locked_weeks || []
  }
}

const ARCHIVE_READONLY = 'Legacy archive is read-only'

export async function saveLineup(_teamName: string, _week: number, _activeQBs: string[]): Promise<void> {
  throw new Error(ARCHIVE_READONLY)
}

export async function updateMatchupScores(
  _week: number,
  _team1: string,
  _team2: string,
  _team1Score: number,
  _team2Score: number
): Promise<void> {
  throw new Error(ARCHIVE_READONLY)
}

export async function lockTeamLineup(_teamName: string, _week: number): Promise<void> {
  throw new Error(ARCHIVE_READONLY)
}

export async function lockWeek(_week: number): Promise<void> {
  throw new Error(ARCHIVE_READONLY)
}

export async function updateCurrentWeek(_week: number): Promise<void> {
  throw new Error(ARCHIVE_READONLY)
}

export async function loadFullLeagueData(): Promise<LeagueData> {
  const [teams, lineups, matchups, gameStats, settings] = await Promise.all([
    loadTeams(),
    loadLineups(),
    loadMatchups(),
    loadGameStats(),
    loadLeagueSettings()
  ])

  // Calculate records from matchups
  const records = teams.map(team => {
    const teamMatchups = matchups.filter(m => 
      m.team1 === team.name || m.team2 === team.name
    )
    
    const wins = teamMatchups.filter(m => 
      (m.team1 === team.name && m.winner === team.name) ||
      (m.team2 === team.name && m.winner === team.name)
    ).length

    const losses = teamMatchups.length - wins
    const totalPoints = teamMatchups.reduce((sum, m) => {
      if (m.team1 === team.name) return sum + m.team1Score
      if (m.team2 === team.name) return sum + m.team2Score
      return sum
    }, 0)

    const weeklyResults = teamMatchups.map(m => 
      (m.team1 === team.name && m.winner === team.name) ||
      (m.team2 === team.name && m.winner === team.name) ? 'W' : 'L'
    )

    return {
      teamName: team.name,
      wins,
      losses,
      totalPoints,
      weeklyResults
    }
  })

  return {
    teams,
    lineups,
    gameStats,
    matchups,
    currentWeek: settings.currentWeek,
    records,
    lockedWeeks: settings.lockedWeeks
  }
}
