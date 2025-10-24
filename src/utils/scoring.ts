import { ScoringEvent } from '../types';

// Scoring events with their point values
export const SCORING_EVENTS: ScoringEvent[] = [
  { name: 'Game-ending F Up', points: 50, description: 'Quarterback makes a game-ending mistake' },
  { name: 'Benching', points: 35, description: 'Quarterback gets benched during the game' },
  { name: 'Defensive TD', points: 20, description: 'Defense scores a touchdown' },
  { name: 'QB Safety', points: 15, description: 'Quarterback gets sacked in end zone' },
  { name: 'No Pass 25+ Yards', points: 10, description: 'No pass completion over 25 yards' },
  { name: 'Interception', points: 5, description: 'Quarterback throws an interception' },
  { name: 'Fumble', points: 4, description: 'Quarterback fumbles the ball' },
  { name: '≥75 Rush Yards', points: -8, description: 'Quarterback rushes for 75+ yards' },
  { name: 'Game-Winning Drive', points: -12, description: 'Quarterback leads game-winning drive' },
  { name: 'GWD by Field Goal', points: -6, description: 'Game-winning drive ends in field goal' }
];

export interface QBStats {
  passYards: number;
  touchdowns: number;
  completionPercent: number;
  turnovers: number;
  events: string[];
}

/**
 * Calculate score based on QB stats using the Bad QB League scoring system
 * Higher scores are better (poor performance = more points)
 */
export function calculateScore(stats: QBStats): number {
  let score = 0;

  // Pass Yards scoring
  if (stats.passYards <= 100) {
    score += 25;
  } else if (stats.passYards <= 150) {
    score += 12;
  } else if (stats.passYards <= 200) {
    score += 6;
  } else if (stats.passYards <= 299) {
    score += 0;
  } else if (stats.passYards <= 349) {
    score -= 6;
  } else if (stats.passYards <= 399) {
    score -= 9;
  } else {
    score -= 12;
  }

  // Touchdowns scoring
  if (stats.touchdowns === 0) {
    score += 10;
  } else if (stats.touchdowns === 1 || stats.touchdowns === 2) {
    score += 0;
  } else if (stats.touchdowns === 3) {
    score -= 5;
  } else if (stats.touchdowns === 4) {
    score -= 10;
  } else {
    score -= 20;
  }

  // Completion % scoring
  if (stats.completionPercent <= 30) {
    score += 25;
  } else if (stats.completionPercent <= 40) {
    score += 15;
  } else if (stats.completionPercent <= 50) {
    score += 5;
  } else {
    score += 0;
  }

  // Turnovers scoring
  if (stats.turnovers === 3) {
    score += 12;
  } else if (stats.turnovers === 4) {
    score += 16;
  } else if (stats.turnovers === 5) {
    score += 24;
  } else if (stats.turnovers >= 6) {
    score += 50;
  }

  // Events scoring
  stats.events.forEach(eventName => {
    const event = SCORING_EVENTS.find(e => e.name === eventName);
    if (event) {
      score += event.points;
    }
  });

  return score;
}

/**
 * Calculate total score for a team's active QBs (2 QBs combined)
 */
export function calculateTeamScore(qbStats: QBStats[]): number {
  return qbStats.reduce((total, stats) => total + calculateScore(stats), 0);
}

/**
 * Get scoring breakdown for display purposes
 */
export function getScoringBreakdown(stats: QBStats) {
  const breakdown = {
    passYards: 0,
    touchdowns: 0,
    completionPercent: 0,
    turnovers: 0,
    events: 0,
    total: 0
  };

  // Pass Yards
  if (stats.passYards <= 100) {
    breakdown.passYards = 25;
  } else if (stats.passYards <= 150) {
    breakdown.passYards = 12;
  } else if (stats.passYards <= 200) {
    breakdown.passYards = 6;
  } else if (stats.passYards <= 299) {
    breakdown.passYards = 0;
  } else if (stats.passYards <= 349) {
    breakdown.passYards = -6;
  } else if (stats.passYards <= 399) {
    breakdown.passYards = -9;
  } else {
    breakdown.passYards = -12;
  }

  // Touchdowns
  if (stats.touchdowns === 0) {
    breakdown.touchdowns = 10;
  } else if (stats.touchdowns === 1 || stats.touchdowns === 2) {
    breakdown.touchdowns = 0;
  } else if (stats.touchdowns === 3) {
    breakdown.touchdowns = -5;
  } else if (stats.touchdowns === 4) {
    breakdown.touchdowns = -10;
  } else {
    breakdown.touchdowns = -20;
  }

  // Completion %
  if (stats.completionPercent <= 30) {
    breakdown.completionPercent = 25;
  } else if (stats.completionPercent <= 40) {
    breakdown.completionPercent = 15;
  } else if (stats.completionPercent <= 50) {
    breakdown.completionPercent = 5;
  } else {
    breakdown.completionPercent = 0;
  }

  // Turnovers
  if (stats.turnovers === 3) {
    breakdown.turnovers = 12;
  } else if (stats.turnovers === 4) {
    breakdown.turnovers = 16;
  } else if (stats.turnovers === 5) {
    breakdown.turnovers = 24;
  } else if (stats.turnovers >= 6) {
    breakdown.turnovers = 50;
  }

  // Events
  stats.events.forEach(eventName => {
    const event = SCORING_EVENTS.find(e => e.name === eventName);
    if (event) {
      breakdown.events += event.points;
    }
  });

  breakdown.total = breakdown.passYards + breakdown.touchdowns + breakdown.completionPercent + breakdown.turnovers + breakdown.events;

  return breakdown;
}

/**
 * Calculate team records from matchups
 */
export function calculateTeamRecords(matchups: any[], teams: any[]): any[] {
  const records: { [teamName: string]: { wins: number; losses: number; ties: number; totalPoints: number; weeklyResults: string[] } } = {};

  // Initialize records for all teams
  teams.forEach(team => {
    records[team.name] = {
      wins: 0,
      losses: 0,
      ties: 0,
      totalPoints: 0,
      weeklyResults: []
    };
  });

  // Process each matchup
  matchups.forEach(matchup => {
    // Only count if the matchup has been played
    if (matchup.team1Score > 0 || matchup.team2Score > 0 || matchup.winner) {
      const isTie = matchup.team1Score === matchup.team2Score;
      const team1Won = matchup.team1Score > matchup.team2Score;
      
      if (isTie) {
        records[matchup.team1].ties++;
        records[matchup.team2].ties++;
        records[matchup.team1].weeklyResults.push('T');
        records[matchup.team2].weeklyResults.push('T');
      } else if (team1Won) {
        records[matchup.team1].wins++;
        records[matchup.team2].losses++;
        records[matchup.team1].weeklyResults.push('W');
        records[matchup.team2].weeklyResults.push('L');
      } else {
        records[matchup.team1].losses++;
        records[matchup.team2].wins++;
        records[matchup.team1].weeklyResults.push('L');
        records[matchup.team2].weeklyResults.push('W');
      }

      // Add points to total
      records[matchup.team1].totalPoints += matchup.team1Score;
      records[matchup.team2].totalPoints += matchup.team2Score;
    }
  });

  // Convert to array format
  return Object.entries(records).map(([teamName, record]) => ({
    teamName,
    wins: record.wins,
    losses: record.losses,
    ties: record.ties,
    totalPoints: record.totalPoints,
    weeklyResults: record.weeklyResults
  }));
}