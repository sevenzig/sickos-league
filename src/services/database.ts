import { supabase } from '../utils/supabase'
import { Team, WeeklyLineup, Matchup, GameStats, LeagueData } from '../types'

// Database service layer for all Supabase operations

export async function loadTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('name')

  if (error) {
    console.error('Error loading teams:', error)
    throw error
  }

  return data?.map(team => ({
    name: team.name,
    rosters: team.rosters
  })) || []
}

export async function loadLineups(): Promise<WeeklyLineup[]> {
  console.log('🔄 Loading lineups from database...');
  
  const { data, error } = await supabase
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
  const { data, error } = await supabase
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
  let query = supabase
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

  data?.forEach(stat => {
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

export async function loadLeagueSettings(): Promise<{ currentWeek: number; lockedWeeks: number[] }> {
  const { data, error } = await supabase
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

export async function saveLineup(teamName: string, week: number, activeQBs: string[]): Promise<void> {
  console.log(`🔄 Saving lineup for ${teamName} week ${week}:`, activeQBs);
  
  // First get team ID
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id')
    .eq('name', teamName)
    .single()

  if (teamError || !team) {
    console.error(`❌ Team ${teamName} not found:`, teamError);
    throw new Error(`Team ${teamName} not found`)
  }

  console.log(`✅ Found team ${teamName} with ID:`, team.id);

  // Get existing lineup to preserve lock status
  const { data: existingLineup } = await supabase
    .from('lineups')
    .select('is_locked')
    .eq('team_id', team.id)
    .eq('week', week)
    .single()

  console.log(`📋 Existing lineup lock status:`, existingLineup?.is_locked || false);

  const { error } = await supabase
    .from('lineups')
    .upsert({
      team_id: team.id,
      week,
      active_qbs: activeQBs,
      is_locked: existingLineup?.is_locked || false
    }, {
      onConflict: 'team_id,week'  // Specify the unique constraint
    })

  if (error) {
    console.error('❌ Error saving lineup:', error)
    throw error
  }
  
  console.log(`✅ Successfully saved lineup for ${teamName} week ${week}`);
}

export async function updateMatchupScores(
  week: number, 
  team1: string, 
  team2: string, 
  team1Score: number, 
  team2Score: number
): Promise<void> {
  // Get team IDs
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name')
    .in('name', [team1, team2])

  if (teamsError || teams.length !== 2) {
    throw new Error('Teams not found')
  }

  const team1Data = teams.find(t => t.name === team1)
  const team2Data = teams.find(t => t.name === team2)

  if (!team1Data || !team2Data) {
    throw new Error('Teams not found')
  }

  const winnerId = team1Score > team2Score ? team1Data.id : team2Data.id

  const { error } = await supabase
    .from('matchups')
    .update({
      team1_score: team1Score,
      team2_score: team2Score,
      winner_id: winnerId
    })
    .eq('week', week)
    .eq('team1_id', team1Data.id)
    .eq('team2_id', team2Data.id)

  if (error) {
    console.error('Error updating matchup scores:', error)
    throw error
  }
}

export async function lockTeamLineup(teamName: string, week: number): Promise<void> {
  console.log(`🔒 Locking lineup for ${teamName} week ${week}`);
  
  // First get team ID
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id')
    .eq('name', teamName)
    .single()

  if (teamError || !team) {
    console.error(`❌ Team ${teamName} not found:`, teamError);
    throw new Error(`Team ${teamName} not found`)
  }

  console.log(`✅ Found team ${teamName} with ID:`, team.id);

  const { error } = await supabase
    .from('lineups')
    .update({ is_locked: true })
    .eq('team_id', team.id)
    .eq('week', week)

  if (error) {
    console.error('❌ Error locking team lineup:', error)
    throw error
  }
  
  console.log(`✅ Successfully locked lineup for ${teamName} week ${week}`);
}

export async function lockWeek(week: number): Promise<void> {
  console.log(`🔒 Attempting to lock week ${week}`);
  
  const { data: settings, error: fetchError } = await supabase
    .from('league_settings')
    .select('locked_weeks')
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (fetchError) {
    console.log('📝 No existing league settings found, creating new settings');
    // Create new settings if none exist
    const { error: insertError } = await supabase
      .from('league_settings')
      .insert({
        current_week: 1,
        locked_weeks: [week],
        season: 2025
      })

    if (insertError) {
      console.error('❌ Error creating league settings:', insertError)
      throw new Error(`Failed to create league settings: ${insertError.message}`)
    }
    console.log(`✅ Successfully created league settings and locked week ${week}`);
  } else {
    const currentLockedWeeks = settings?.locked_weeks || []
    
    // Check if week is already locked
    if (currentLockedWeeks.includes(week)) {
      console.log(`ℹ️ Week ${week} is already locked - no action needed`);
      return; // Don't throw an error, just return successfully
    }
    
    const updatedLockedWeeks = [...new Set([...currentLockedWeeks, week])]
    console.log(`📝 Updating locked weeks from [${currentLockedWeeks.join(', ')}] to [${updatedLockedWeeks.join(', ')}]`);

    const { error: updateError } = await supabase
      .from('league_settings')
      .update({ locked_weeks: updatedLockedWeeks })
      .eq('id', settings.id)

    if (updateError) {
      console.error('❌ Error updating locked weeks:', updateError)
      throw new Error(`Failed to lock week ${week}: ${updateError.message}`)
    }
    console.log(`✅ Successfully locked week ${week}`);
  }
}

export async function updateCurrentWeek(week: number): Promise<void> {
  console.log(`🔄 Updating current week to ${week}`);
  
  const { data: settings, error: fetchError } = await supabase
    .from('league_settings')
    .select('*')
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (fetchError) {
    console.log('📝 No existing league settings found, creating new settings');
    // Create new settings if none exist
    const { error: insertError } = await supabase
      .from('league_settings')
      .insert({
        current_week: week,
        locked_weeks: [],
        season: 2025
      })

    if (insertError) {
      console.error('❌ Error creating league settings:', insertError)
      throw new Error(`Failed to create league settings: ${insertError.message}`)
    }
    console.log(`✅ Successfully created league settings with current week ${week}`);
  } else {
    const { error: updateError } = await supabase
      .from('league_settings')
      .update({ current_week: week })
      .eq('id', settings.id)

    if (updateError) {
      console.error('❌ Error updating current week:', updateError)
      throw new Error(`Failed to update current week to ${week}: ${updateError.message}`)
    }
    console.log(`✅ Successfully updated current week to ${week}`);
  }
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
