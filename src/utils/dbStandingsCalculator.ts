import { Matchup, Team, WeeklyLineup, TeamRecord } from '../types';
import { compareStandings, type StandingsTiebreaker } from './season';
import { getWeeklyQBPerformancesFromDb } from '../services/database';
import { CURRENT_SEASON } from './currentSeason';

/**
 * Calculate team score for a specific week based on lineup selections and database data
 */
export async function calculateTeamScoreForWeekFromDb(
  teamName: string,
  week: number,
  lineups: WeeklyLineup[],
  season: number = CURRENT_SEASON
): Promise<{ totalScore: number; qbBreakdown: any[] }> {
  const teamLineup = lineups.find(l => l.teamName === teamName && l.week === week);
  if (!teamLineup) {
    return { totalScore: 0, qbBreakdown: [] };
  }

  const qbPerformances = await getWeeklyQBPerformancesFromDb(week, season);
  if (!qbPerformances || qbPerformances.length === 0) {
    const qbBreakdown = teamLineup.activeQBs.map(qb => ({ qb, breakdown: null }));
    return { totalScore: 0, qbBreakdown };
  }

  let totalScore = 0;
  const qbBreakdown: any[] = [];

  teamLineup.activeQBs.forEach(qb => {
    const teamPerformance = qbPerformances.find(team => team.team === qb);
    if (teamPerformance) {
      totalScore += teamPerformance.finalScore;
      qbBreakdown.push({ qb, breakdown: teamPerformance });
    }
  });

  return { totalScore, qbBreakdown };
}

export async function calculateMatchupScoreFromDb(
  matchup: Matchup,
  lineups: WeeklyLineup[],
  season: number = CURRENT_SEASON
): Promise<{ team1Score: number; team2Score: number; team1Breakdown: any[]; team2Breakdown: any[] }> {
  const { totalScore: team1Score, qbBreakdown: team1Breakdown } = await calculateTeamScoreForWeekFromDb(
    matchup.team1,
    matchup.week,
    lineups,
    season
  );

  const { totalScore: team2Score, qbBreakdown: team2Breakdown } = await calculateTeamScoreForWeekFromDb(
    matchup.team2,
    matchup.week,
    lineups,
    season
  );

  return { team1Score, team2Score, team1Breakdown, team2Breakdown };
}

export async function calculateStandingsFromDb(
  matchups: Matchup[],
  lineups: WeeklyLineup[],
  teams: Team[],
  tiebreaker: StandingsTiebreaker = 'record_then_points',
  season: number = CURRENT_SEASON
): Promise<TeamRecord[]> {
  const records: { [teamName: string]: { wins: number; losses: number; ties: number; totalPoints: number } } = {};

  teams.forEach(team => {
    records[team.name] = { wins: 0, losses: 0, ties: 0, totalPoints: 0 };
  });

  for (const matchup of matchups) {
    const qbPerformances = await getWeeklyQBPerformancesFromDb(matchup.week, season);
    if (!qbPerformances || qbPerformances.length === 0) continue;

    const team1Lineup = lineups.find(l => l.teamName === matchup.team1 && l.week === matchup.week);
    const team2Lineup = lineups.find(l => l.teamName === matchup.team2 && l.week === matchup.week);
    if (!team1Lineup || !team2Lineup) continue;

    const { team1Score, team2Score } = await calculateMatchupScoreFromDb(matchup, lineups, season);
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

    records[matchup.team1].totalPoints += team1Score;
    records[matchup.team2].totalPoints += team2Score;
  }

  return Object.entries(records)
    .map(([teamName, record]) => ({
      teamName,
      wins: record.wins,
      losses: record.losses,
      ties: record.ties,
      totalPoints: record.totalPoints,
      weeklyResults: [],
    }))
    .sort((a, b) => compareStandings(
      { wins: a.wins, totalPoints: a.totalPoints, teamName: a.teamName },
      { wins: b.wins, totalPoints: b.totalPoints, teamName: b.teamName },
      tiebreaker
    ));
}

export async function calculateWeeklyResultsFromDb(
  matchups: Matchup[],
  lineups: WeeklyLineup[],
  teams: Team[],
  season: number = CURRENT_SEASON
): Promise<{ [teamName: string]: string[] }> {
  const weeklyResults: { [teamName: string]: string[] } = {};

  teams.forEach(team => {
    weeklyResults[team.name] = [];
  });

  for (let week = 1; week <= 18; week++) {
    const qbPerformances = await getWeeklyQBPerformancesFromDb(week, season);
    if (!qbPerformances || qbPerformances.length === 0) {
      teams.forEach(team => {
        weeklyResults[team.name].push('');
      });
      continue;
    }

    const weekMatchups = matchups.filter(m => m.week === week);
    teams.forEach(team => {
      weeklyResults[team.name].push('');
    });

    for (const matchup of weekMatchups) {
      const team1Lineup = lineups.find(l => l.teamName === matchup.team1 && l.week === week);
      const team2Lineup = lineups.find(l => l.teamName === matchup.team2 && l.week === week);
      if (!team1Lineup || !team2Lineup) continue;

      const { team1Score, team2Score } = await calculateMatchupScoreFromDb(matchup, lineups, season);

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
    }
  }

  return weeklyResults;
}

export async function getTeamWeekResultFromDb(
  teamName: string,
  week: number,
  matchups: Matchup[],
  lineups: WeeklyLineup[],
  season: number = CURRENT_SEASON
): Promise<'W' | 'L' | 'T' | null> {
  const matchup = matchups.find(m =>
    m.week === week &&
    (m.team1 === teamName || m.team2 === teamName)
  );

  if (!matchup) return null;

  const qbPerformances = await getWeeklyQBPerformancesFromDb(week, season);
  if (!qbPerformances || qbPerformances.length === 0) return null;

  const team1Lineup = lineups.find(l => l.teamName === matchup.team1 && l.week === week);
  const team2Lineup = lineups.find(l => l.teamName === matchup.team2 && l.week === week);
  if (!team1Lineup || !team2Lineup) return null;

  const { team1Score, team2Score } = await calculateMatchupScoreFromDb(matchup, lineups, season);

  if (team1Score === team2Score) return 'T';
  if (matchup.team1 === teamName) return team1Score > team2Score ? 'W' : 'L';
  return team2Score > team1Score ? 'W' : 'L';
}

export async function getCurrentRecordFromDb(
  teamName: string,
  matchups: Matchup[],
  lineups: WeeklyLineup[],
  season: number = CURRENT_SEASON
): Promise<string> {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  for (const matchup of matchups) {
    if (matchup.team1 === teamName || matchup.team2 === teamName) {
      const result = await getTeamWeekResultFromDb(teamName, matchup.week, matchups, lineups, season);
      if (result === 'W') wins++;
      else if (result === 'L') losses++;
      else if (result === 'T') ties++;
    }
  }

  return `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`;
}

export async function getTeamWeekMatchupDetailsFromDb(
  teamName: string,
  week: number,
  matchups: Matchup[],
  lineups: WeeklyLineup[],
  season: number = CURRENT_SEASON
): Promise<{
  opponent: string;
  teamScore: number;
  opponentScore: number;
  teamQBs: string[];
  opponentQBs: string[];
  result: 'W' | 'L' | 'T' | null;
} | null> {
  const matchup = matchups.find(m =>
    m.week === week &&
    (m.team1 === teamName || m.team2 === teamName)
  );

  if (!matchup) return null;

  const qbPerformances = await getWeeklyQBPerformancesFromDb(week, season);
  if (!qbPerformances || qbPerformances.length === 0) return null;

  const team1Lineup = lineups.find(l => l.teamName === matchup.team1 && l.week === week);
  const team2Lineup = lineups.find(l => l.teamName === matchup.team2 && l.week === week);
  if (!team1Lineup || !team2Lineup) return null;

  const { team1Score, team2Score } = await calculateMatchupScoreFromDb(matchup, lineups, season);

  const isTeam1 = matchup.team1 === teamName;
  const opponent = isTeam1 ? matchup.team2 : matchup.team1;
  const teamScore = isTeam1 ? team1Score : team2Score;
  const opponentScore = isTeam1 ? team2Score : team1Score;
  const teamQBs = isTeam1 ? team1Lineup.activeQBs : team2Lineup.activeQBs;
  const opponentQBs = isTeam1 ? team2Lineup.activeQBs : team1Lineup.activeQBs;

  let result: 'W' | 'L' | 'T' | null = null;
  if (team1Score === team2Score) {
    result = 'T';
  } else if (isTeam1) {
    result = team1Score > team2Score ? 'W' : 'L';
  } else {
    result = team2Score > team1Score ? 'W' : 'L';
  }

  return { opponent, teamScore, opponentScore, teamQBs, opponentQBs, result };
}
