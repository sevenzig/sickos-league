// Core data types for the Bad QB League

export interface Team {
  name: string;
  rosters: string[]; // Array of NFL team names (4 QBs per team)
}

export interface WeeklyLineup {
  teamName: string;
  week: number;
  activeQBs: string[]; // Exactly 2 NFL team names
}

export interface GameStats {
  teamName: string;
  week: number;
  qbStats: {
    [qbTeam: string]: {
      passYards: number;
      touchdowns: number;
      completionPercent: number;
      turnovers: number;
      events: string[]; // Array of event names
    };
  };
  calculatedScore: number;
}

export interface Matchup {
  week: number;
  team1: string;
  team2: string;
  team1Score: number;
  team2Score: number;
  winner: string | null;
}

export interface TeamRecord {
  teamName: string;
  wins: number;
  losses: number;
  totalPoints: number;
  weeklyResults: string[]; // Array of 'W' or 'L' for each week
}

export interface LeagueData {
  teams: Team[];
  lineups: WeeklyLineup[];
  gameStats: GameStats[];
  matchups: Matchup[];
  currentWeek: number;
  records: TeamRecord[];
}

// Scoring event types
export interface ScoringEvent {
  name: string;
  points: number;
  description: string;
}

// NFL team names for reference
export const NFL_TEAMS = [
  'Arizona', 'Atlanta', 'Baltimore', 'Buffalo', 'Carolina', 'Chicago', 'Cincinnati', 'Cleveland',
  'Dallas', 'Denver', 'Detroit', 'Green Bay', 'Houston', 'Indianapolis', 'Jacksonville', 'Kansas City',
  'Las Vegas', 'LA Chargers', 'LA Rams', 'Miami', 'Minnesota', 'New England', 'New Orleans', 'NY Giants',
  'NY Jets', 'Philadelphia', 'Pittsburgh', 'San Francisco', 'Seattle', 'Tampa Bay', 'Tennessee', 'Washington'
] as const;

export type NFLTeam = typeof NFL_TEAMS[number];
