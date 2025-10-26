import { Matchup, Team, WeeklyLineup, TeamRecord } from '../types';
import { getWeeklyCSVData } from '../data/scoringData';
import { parseWeeklyCSV } from './csvParser';

/**
 * Calculate team score for a specific week based on lineup selections and CSV data
 */
export function calculateTeamScoreForWeek(
  teamName: string,
  week: number,
  lineups: WeeklyLineup[]
): { totalScore: number; qbBreakdown: any[] } {
  const teamLineup = lineups.find(l => l.teamName === teamName && l.week === week);
  if (!teamLineup) {
    return { totalScore: 0, qbBreakdown: [] };
  }

  const csvData = getWeeklyCSVData(week);
  if (!csvData) {
    // Return QB names even when there's no CSV data
    const qbBreakdown = teamLineup.activeQBs.map(qb => ({ qb, breakdown: null }));
    return { totalScore: 0, qbBreakdown };
  }

  const weeklyData = parseWeeklyCSV(csvData, week);
  let totalScore = 0;
  const qbBreakdown: any[] = [];

  teamLineup.activeQBs.forEach(qb => {
    const teamPerformance = weeklyData.qbPerformances.find(team => team.team === qb);
    if (teamPerformance) {
      totalScore += teamPerformance.finalScore;
      qbBreakdown.push({ qb, breakdown: teamPerformance });
    }
  });

  return { totalScore, qbBreakdown };
}

/**
 * Calculate matchup scores for both teams in a specific week
 */
export function calculateMatchupScore(
  matchup: Matchup,
  lineups: WeeklyLineup[]
): { team1Score: number; team2Score: number; team1Breakdown: any[]; team2Breakdown: any[] } {
  const { totalScore: team1Score, qbBreakdown: team1Breakdown } = calculateTeamScoreForWeek(
    matchup.team1,
    matchup.week,
    lineups
  );
  
  const { totalScore: team2Score, qbBreakdown: team2Breakdown } = calculateTeamScoreForWeek(
    matchup.team2,
    matchup.week,
    lineups
  );

  return { team1Score, team2Score, team1Breakdown, team2Breakdown };
}

/**
 * Calculate team standings based on matchups, lineups, and available CSV data
 * Only counts weeks that have both complete lineups AND CSV data
 */
export function calculateStandings(
  matchups: Matchup[],
  lineups: WeeklyLineup[],
  teams: Team[]
): TeamRecord[] {
  const records: { [teamName: string]: { wins: number; losses: number; ties: number; totalPoints: number } } = {};

  // Initialize records for all teams
  teams.forEach(team => {
    records[team.name] = {
      wins: 0,
      losses: 0,
      ties: 0,
      totalPoints: 0
    };
  });

  // Process each matchup
  matchups.forEach(matchup => {
    // Check if CSV data is available for this week
    const csvData = getWeeklyCSVData(matchup.week);
    if (!csvData) {
      return; // Skip weeks without CSV data
    }

    // Check if both teams have lineups for this week
    const team1Lineup = lineups.find(l => l.teamName === matchup.team1 && l.week === matchup.week);
    const team2Lineup = lineups.find(l => l.teamName === matchup.team2 && l.week === matchup.week);
    
    if (!team1Lineup || !team2Lineup) {
      return; // Skip if either team doesn't have a lineup
    }

    // Calculate scores dynamically
    const { team1Score, team2Score } = calculateMatchupScore(matchup, lineups);
    
    // Count all games where both teams have lineups and CSV data is available
    // (regardless of whether scores are positive, zero, or negative)
    const isTie = team1Score === team2Score;
    const team1Won = team1Score > team2Score;
    
    if (isTie) {
      records[matchup.team1].ties++;
      records[matchup.team2].ties++;
    } else if (team1Won) {
      records[matchup.team1].wins++;
      records[matchup.team2].losses++;
    } else {
      records[matchup.team1].losses++;
      records[matchup.team2].wins++;
    }

    // Add points to total
    records[matchup.team1].totalPoints += team1Score;
    records[matchup.team2].totalPoints += team2Score;
  });

  // Convert to array format and sort by wins, then total points
  return Object.entries(records)
    .map(([teamName, record]) => ({
      teamName,
      wins: record.wins,
      losses: record.losses,
      ties: record.ties,
      totalPoints: record.totalPoints,
      weeklyResults: [] // Will be calculated separately for the chart
    }))
    .sort((a, b) => {
      if (a.wins !== b.wins) return b.wins - a.wins;
      return b.totalPoints - a.totalPoints;
    });
}

/**
 * Calculate weekly results for the W/L/T chart
 * Returns an object with team names as keys and arrays of weekly results
 */
export function calculateWeeklyResults(
  matchups: Matchup[],
  lineups: WeeklyLineup[],
  teams: Team[]
): { [teamName: string]: string[] } {
  const weeklyResults: { [teamName: string]: string[] } = {};

  // Initialize weekly results for all teams
  teams.forEach(team => {
    weeklyResults[team.name] = [];
  });

  // Process each week
  for (let week = 1; week <= 18; week++) {
    // Check if CSV data is available for this week
    const csvData = getWeeklyCSVData(week);
    if (!csvData) {
      // No CSV data, mark all teams as null for this week
      teams.forEach(team => {
        weeklyResults[team.name].push('');
      });
      continue;
    }

    // Get matchups for this week
    const weekMatchups = matchups.filter(m => m.week === week);
    
    // Initialize all teams as having no result for this week
    teams.forEach(team => {
      weeklyResults[team.name].push('');
    });

    // Process each matchup for this week
    weekMatchups.forEach(matchup => {
      // Check if both teams have lineups for this week
      const team1Lineup = lineups.find(l => l.teamName === matchup.team1 && l.week === week);
      const team2Lineup = lineups.find(l => l.teamName === matchup.team2 && l.week === week);
      
      if (!team1Lineup || !team2Lineup) {
        return; // Skip if either team doesn't have a lineup
      }

      // Calculate scores dynamically
      const { team1Score, team2Score } = calculateMatchupScore(matchup, lineups);
      
      // Show result for all games where both teams have lineups and CSV data is available
      // (regardless of whether scores are positive, zero, or negative)
      if (team1Score === team2Score) {
        weeklyResults[matchup.team1][week - 1] = 'T';
        weeklyResults[matchup.team2][week - 1] = 'T';
      } else if (team1Score > team2Score) {
        weeklyResults[matchup.team1][week - 1] = 'W';
        weeklyResults[matchup.team2][week - 1] = 'L';
      } else {
        weeklyResults[matchup.team1][week - 1] = 'L';
        weeklyResults[matchup.team2][week - 1] = 'W';
      }
    });
  }

  return weeklyResults;
}

/**
 * Get team result for a specific week (W/L/T or null if no data)
 */
export function getTeamWeekResult(
  teamName: string,
  week: number,
  matchups: Matchup[],
  lineups: WeeklyLineup[]
): 'W' | 'L' | 'T' | null {
  const matchup = matchups.find(m => 
    m.week === week && 
    (m.team1 === teamName || m.team2 === teamName)
  );

  if (!matchup) return null;

  // Check if CSV data is available for this week
  const csvData = getWeeklyCSVData(week);
  if (!csvData) return null;

  // Check if both teams have lineups for this week
  const team1Lineup = lineups.find(l => l.teamName === matchup.team1 && l.week === week);
  const team2Lineup = lineups.find(l => l.teamName === matchup.team2 && l.week === week);
  
  if (!team1Lineup || !team2Lineup) return null;

  // Calculate scores dynamically
  const { team1Score, team2Score } = calculateMatchupScore(matchup, lineups);

  // Show result for all games where both teams have lineups and CSV data is available
  // (regardless of whether scores are positive, zero, or negative)

  if (team1Score === team2Score) {
    return 'T';
  }

  if (matchup.team1 === teamName) {
    return team1Score > team2Score ? 'W' : 'L';
  } else {
    return team2Score > team1Score ? 'W' : 'L';
  }
}

/**
 * Get current record string for a team (e.g., "5-2-1")
 */
export function getCurrentRecord(
  teamName: string,
  matchups: Matchup[],
  lineups: WeeklyLineup[]
): string {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  // Count wins/losses/ties from all matchups using dynamic scoring
  matchups.forEach(matchup => {
    if (matchup.team1 === teamName || matchup.team2 === teamName) {
      const result = getTeamWeekResult(teamName, matchup.week, matchups, lineups);
      
      if (result === 'W') wins++;
      else if (result === 'L') losses++;
      else if (result === 'T') ties++;
    }
  });

  return `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`;
}

/**
 * Get detailed matchup information for a team and week
 * Returns opponent details, scores, and active QBs for tooltip display
 */
export function getTeamWeekMatchupDetails(
  teamName: string,
  week: number,
  matchups: Matchup[],
  lineups: WeeklyLineup[]
): {
  opponent: string;
  teamScore: number;
  opponentScore: number;
  teamQBs: string[];
  opponentQBs: string[];
  result: 'W' | 'L' | 'T' | null;
} | null {
  const matchup = matchups.find(m => 
    m.week === week && 
    (m.team1 === teamName || m.team2 === teamName)
  );

  if (!matchup) return null;

  // Check if CSV data is available for this week
  const csvData = getWeeklyCSVData(week);
  if (!csvData) return null;

  // Check if both teams have lineups for this week
  const team1Lineup = lineups.find(l => l.teamName === matchup.team1 && l.week === week);
  const team2Lineup = lineups.find(l => l.teamName === matchup.team2 && l.week === week);
  
  if (!team1Lineup || !team2Lineup) return null;

  // Calculate scores dynamically
  const { team1Score, team2Score } = calculateMatchupScore(matchup, lineups);

  // Determine which team is the current team
  const isTeam1 = matchup.team1 === teamName;
  const opponent = isTeam1 ? matchup.team2 : matchup.team1;
  const teamScore = isTeam1 ? team1Score : team2Score;
  const opponentScore = isTeam1 ? team2Score : team1Score;
  const teamQBs = isTeam1 ? team1Lineup.activeQBs : team2Lineup.activeQBs;
  const opponentQBs = isTeam1 ? team2Lineup.activeQBs : team1Lineup.activeQBs;

  // Determine result
  let result: 'W' | 'L' | 'T' | null = null;
  if (team1Score === team2Score) {
    result = 'T';
  } else if (isTeam1) {
    result = team1Score > team2Score ? 'W' : 'L';
  } else {
    result = team2Score > team1Score ? 'W' : 'L';
  }

  return {
    opponent,
    teamScore,
    opponentScore,
    teamQBs,
    opponentQBs,
    result
  };
}