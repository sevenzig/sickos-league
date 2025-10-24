import { LeagueData, Team, TeamRecord } from '../types';
import { week1GameStats } from './week1Data';

// Initial team rosters from actual league
const initialTeams: Team[] = [
  { name: 'Paul Johnson', rosters: ['Cleveland', 'Miami', 'Houston', 'Buffalo'] },
  { name: 'Max Athorn', rosters: ['NY Giants', 'New England', 'Denver', 'Cincinnati'] },
  { name: 'Anthony Meehl', rosters: ['Pittsburgh', 'LA Chargers', 'Carolina', 'Washington'] },
  { name: 'Eric Johnson', rosters: ['Tennessee', 'LA Rams', 'San Francisco', 'Detroit'] },
  { name: 'Scott Thurston', rosters: ['NY Jets', 'Minnesota', 'Dallas', 'Philadelphia'] },
  { name: 'Jacob Frush', rosters: ['New Orleans', 'Chicago', 'Jacksonville', 'Baltimore'] },
  { name: 'Paul Nikstad', rosters: ['Las Vegas', 'Seattle', 'Green Bay', 'Kansas City'] },
  { name: 'Devin Jones', rosters: ['Indianapolis', 'Atlanta', 'Arizona', 'Tampa Bay'] }
];

// Records will be calculated dynamically from lineups and CSV data
const initialRecords: TeamRecord[] = [];

// Lineups with actual QB choices from weeks 1-7
const initialLineups = [
  // Week 1
  { teamName: 'Paul Johnson', week: 1, activeQBs: ['Cleveland', 'Miami'] },
  { teamName: 'Max Athorn', week: 1, activeQBs: ['NY Giants', 'New England'] },
  { teamName: 'Jacob Frush', week: 1, activeQBs: ['New Orleans', 'Chicago'] },
  { teamName: 'Devin Jones', week: 1, activeQBs: ['Indianapolis', 'Atlanta'] },
  { teamName: 'Eric Johnson', week: 1, activeQBs: ['Tennessee', 'LA Rams'] },
  { teamName: 'Scott Thurston', week: 1, activeQBs: ['NY Jets', 'Minnesota'] },
  { teamName: 'Paul Nikstad', week: 1, activeQBs: ['Las Vegas', 'Green Bay'] },
  { teamName: 'Anthony Meehl', week: 1, activeQBs: ['Pittsburgh', 'LA Chargers'] },
  
  // Week 2
  { teamName: 'Paul Johnson', week: 2, activeQBs: ['Miami', 'Houston'] },
  { teamName: 'Max Athorn', week: 2, activeQBs: ['NY Giants', 'New England'] },
  { teamName: 'Jacob Frush', week: 2, activeQBs: ['New Orleans', 'Jacksonville'] },
  { teamName: 'Devin Jones', week: 2, activeQBs: ['Indianapolis', 'Tampa Bay'] },
  { teamName: 'Eric Johnson', week: 2, activeQBs: ['Tennessee', 'San Francisco'] },
  { teamName: 'Scott Thurston', week: 2, activeQBs: ['Minnesota', 'Dallas'] },
  { teamName: 'Paul Nikstad', week: 2, activeQBs: ['Seattle', 'Kansas City'] },
  { teamName: 'Anthony Meehl', week: 2, activeQBs: ['Pittsburgh', 'Carolina'] },
  
  // Week 3
  { teamName: 'Paul Johnson', week: 3, activeQBs: ['Cleveland', 'Miami'] },
  { teamName: 'Max Athorn', week: 3, activeQBs: ['NY Giants', 'Cincinnati'] },
  { teamName: 'Jacob Frush', week: 3, activeQBs: ['New Orleans', 'Baltimore'] },
  { teamName: 'Devin Jones', week: 3, activeQBs: ['Indianapolis', 'Arizona'] },
  { teamName: 'Eric Johnson', week: 3, activeQBs: ['Tennessee', 'LA Rams'] },
  { teamName: 'Scott Thurston', week: 3, activeQBs: ['NY Jets', 'Minnesota'] },
  { teamName: 'Paul Nikstad', week: 3, activeQBs: ['Las Vegas', 'Seattle'] },
  { teamName: 'Anthony Meehl', week: 3, activeQBs: ['Carolina', 'Washington'] },
  
  // Week 4
  { teamName: 'Paul Johnson', week: 4, activeQBs: ['Cleveland', 'Miami'] },
  { teamName: 'Max Athorn', week: 4, activeQBs: ['NY Giants', 'Cincinnati'] },
  { teamName: 'Jacob Frush', week: 4, activeQBs: ['New Orleans', 'Jacksonville'] },
  { teamName: 'Devin Jones', week: 4, activeQBs: ['Atlanta', 'Tampa Bay'] },
  { teamName: 'Eric Johnson', week: 4, activeQBs: ['Tennessee', 'Detroit'] },
  { teamName: 'Scott Thurston', week: 4, activeQBs: ['Philadelphia', 'Dallas'] },
  { teamName: 'Paul Nikstad', week: 4, activeQBs: ['Green Bay', 'Kansas City'] },
  { teamName: 'Anthony Meehl', week: 4, activeQBs: ['Pittsburgh', 'Washington'] },
  
  // Week 5
  { teamName: 'Paul Johnson', week: 5, activeQBs: ['Cleveland', 'Buffalo'] },
  { teamName: 'Max Athorn', week: 5, activeQBs: ['Denver', 'Cincinnati'] },
  { teamName: 'Jacob Frush', week: 5, activeQBs: ['New Orleans', 'Baltimore'] },
  { teamName: 'Devin Jones', week: 5, activeQBs: ['Arizona', 'Tampa Bay'] },
  { teamName: 'Eric Johnson', week: 5, activeQBs: ['Tennessee', 'San Francisco'] },
  { teamName: 'Scott Thurston', week: 5, activeQBs: ['NY Jets', 'Minnesota'] },
  { teamName: 'Paul Nikstad', week: 5, activeQBs: ['Las Vegas', 'Seattle'] },
  { teamName: 'Anthony Meehl', week: 5, activeQBs: ['Carolina', 'Washington'] },
  
  // Week 6
  { teamName: 'Paul Johnson', week: 6, activeQBs: ['Cleveland', 'Miami'] },
  { teamName: 'Max Athorn', week: 6, activeQBs: ['NY Giants', 'Cincinnati'] },
  { teamName: 'Jacob Frush', week: 6, activeQBs: ['Baltimore', 'Chicago'] },
  { teamName: 'Devin Jones', week: 6, activeQBs: ['Atlanta', 'Arizona'] },
  { teamName: 'Eric Johnson', week: 6, activeQBs: ['Tennessee', 'San Francisco'] },
  { teamName: 'Scott Thurston', week: 6, activeQBs: ['NY Jets', 'Dallas'] },
  { teamName: 'Paul Nikstad', week: 6, activeQBs: ['Las Vegas', 'Kansas City'] },
  { teamName: 'Anthony Meehl', week: 6, activeQBs: ['Pittsburgh', 'Washington'] },
  
  // Week 7
  { teamName: 'Paul Johnson', week: 7, activeQBs: ['Cleveland', 'Houston'] },
  { teamName: 'Max Athorn', week: 7, activeQBs: ['NY Giants', 'Cincinnati'] },
  { teamName: 'Jacob Frush', week: 7, activeQBs: ['New Orleans', 'Jacksonville'] },
  { teamName: 'Devin Jones', week: 7, activeQBs: ['Atlanta', 'Arizona'] },
  { teamName: 'Eric Johnson', week: 7, activeQBs: ['Tennessee', 'LA Rams'] },
  { teamName: 'Scott Thurston', week: 7, activeQBs: ['NY Jets', 'Philadelphia'] },
  { teamName: 'Paul Nikstad', week: 7, activeQBs: ['Las Vegas', 'Seattle'] },
  { teamName: 'Anthony Meehl', week: 7, activeQBs: ['Pittsburgh', 'Carolina'] }
];

// Matchups - scores will be calculated dynamically from CSV data and lineups
const initialMatchups = [
  // Week 1
  { week: 1, team1: 'Paul Nikstad', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 1, team1: 'Anthony Meehl', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 1, team1: 'Eric Johnson', team2: 'Paul Johnson', team1Score: 0, team2Score: 0, winner: null },
  { week: 1, team1: 'Max Athorn', team2: 'Scott Thurston', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 2
  { week: 2, team1: 'Paul Nikstad', team2: 'Anthony Meehl', team1Score: 0, team2Score: 0, winner: null },
  { week: 2, team1: 'Max Athorn', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 2, team1: 'Paul Johnson', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 2, team1: 'Eric Johnson', team2: 'Scott Thurston', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 3
  { week: 3, team1: 'Max Athorn', team2: 'Paul Nikstad', team1Score: 0, team2Score: 0, winner: null },
  { week: 3, team1: 'Eric Johnson', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 3, team1: 'Scott Thurston', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 3, team1: 'Paul Johnson', team2: 'Anthony Meehl', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 4
  { week: 4, team1: 'Eric Johnson', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 4, team1: 'Jacob Frush', team2: 'Anthony Meehl', team1Score: 0, team2Score: 0, winner: null },
  { week: 4, team1: 'Paul Johnson', team2: 'Max Athorn', team1Score: 0, team2Score: 0, winner: null },
  { week: 4, team1: 'Scott Thurston', team2: 'Paul Nikstad', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 5
  { week: 5, team1: 'Scott Thurston', team2: 'Paul Johnson', team1Score: 0, team2Score: 0, winner: null },
  { week: 5, team1: 'Eric Johnson', team2: 'Anthony Meehl', team1Score: 0, team2Score: 0, winner: null },
  { week: 5, team1: 'Jacob Frush', team2: 'Max Athorn', team1Score: 0, team2Score: 0, winner: null },
  { week: 5, team1: 'Devin Jones', team2: 'Paul Nikstad', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 6
  { week: 6, team1: 'Devin Jones', team2: 'Paul Johnson', team1Score: 0, team2Score: 0, winner: null },
  { week: 6, team1: 'Eric Johnson', team2: 'Paul Nikstad', team1Score: 0, team2Score: 0, winner: null },
  { week: 6, team1: 'Anthony Meehl', team2: 'Max Athorn', team1Score: 0, team2Score: 0, winner: null },
  { week: 6, team1: 'Jacob Frush', team2: 'Scott Thurston', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 7
  { week: 7, team1: 'Eric Johnson', team2: 'Max Athorn', team1Score: 0, team2Score: 0, winner: null },
  { week: 7, team1: 'Anthony Meehl', team2: 'Scott Thurston', team1Score: 0, team2Score: 0, winner: null },
  { week: 7, team1: 'Paul Nikstad', team2: 'Paul Johnson', team1Score: 0, team2Score: 0, winner: null },
  { week: 7, team1: 'Devin Jones', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 8 (same as Week 1)
  { week: 8, team1: 'Paul Nikstad', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 8, team1: 'Anthony Meehl', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 8, team1: 'Eric Johnson', team2: 'Paul Johnson', team1Score: 0, team2Score: 0, winner: null },
  { week: 8, team1: 'Max Athorn', team2: 'Scott Thurston', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 9 (same as Week 2)
  { week: 9, team1: 'Paul Nikstad', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 9, team1: 'Anthony Meehl', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 9, team1: 'Eric Johnson', team2: 'Paul Johnson', team1Score: 0, team2Score: 0, winner: null },
  { week: 9, team1: 'Max Athorn', team2: 'Scott Thurston', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 10 (same as Week 3)
  { week: 10, team1: 'Max Athorn', team2: 'Paul Nikstad', team1Score: 0, team2Score: 0, winner: null },
  { week: 10, team1: 'Eric Johnson', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 10, team1: 'Scott Thurston', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 10, team1: 'Paul Johnson', team2: 'Anthony Meehl', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 11 (same as Week 4)
  { week: 11, team1: 'Eric Johnson', team2: 'Anthony Meehl', team1Score: 0, team2Score: 0, winner: null },
  { week: 11, team1: 'Jacob Frush', team2: 'Max Athorn', team1Score: 0, team2Score: 0, winner: null },
  { week: 11, team1: 'Paul Johnson', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 11, team1: 'Scott Thurston', team2: 'Paul Nikstad', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 12 (same as Week 5)
  { week: 12, team1: 'Paul Johnson', team2: 'Max Athorn', team1Score: 0, team2Score: 0, winner: null },
  { week: 12, team1: 'Anthony Meehl', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 12, team1: 'Eric Johnson', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 12, team1: 'Scott Thurston', team2: 'Paul Nikstad', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 13 (same as Week 6)
  { week: 13, team1: 'Paul Johnson', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 13, team1: 'Max Athorn', team2: 'Anthony Meehl', team1Score: 0, team2Score: 0, winner: null },
  { week: 13, team1: 'Eric Johnson', team2: 'Scott Thurston', team1Score: 0, team2Score: 0, winner: null },
  { week: 13, team1: 'Paul Nikstad', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 14 (same as Week 7)
  { week: 14, team1: 'Paul Johnson', team2: 'Anthony Meehl', team1Score: 0, team2Score: 0, winner: null },
  { week: 14, team1: 'Max Athorn', team2: 'Eric Johnson', team1Score: 0, team2Score: 0, winner: null },
  { week: 14, team1: 'Jacob Frush', team2: 'Scott Thurston', team1Score: 0, team2Score: 0, winner: null },
  { week: 14, team1: 'Paul Nikstad', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 15 (same as Week 1)
  { week: 15, team1: 'Paul Nikstad', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 15, team1: 'Anthony Meehl', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 15, team1: 'Eric Johnson', team2: 'Paul Johnson', team1Score: 0, team2Score: 0, winner: null },
  { week: 15, team1: 'Max Athorn', team2: 'Scott Thurston', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 16 (same as Week 2)
  { week: 16, team1: 'Paul Nikstad', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 16, team1: 'Anthony Meehl', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 16, team1: 'Eric Johnson', team2: 'Paul Johnson', team1Score: 0, team2Score: 0, winner: null },
  { week: 16, team1: 'Max Athorn', team2: 'Scott Thurston', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 17 (same as Week 3)
  { week: 17, team1: 'Max Athorn', team2: 'Paul Nikstad', team1Score: 0, team2Score: 0, winner: null },
  { week: 17, team1: 'Eric Johnson', team2: 'Jacob Frush', team1Score: 0, team2Score: 0, winner: null },
  { week: 17, team1: 'Scott Thurston', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 17, team1: 'Paul Johnson', team2: 'Anthony Meehl', team1Score: 0, team2Score: 0, winner: null },
  
  // Week 18 (same as Week 4)
  { week: 18, team1: 'Eric Johnson', team2: 'Anthony Meehl', team1Score: 0, team2Score: 0, winner: null },
  { week: 18, team1: 'Jacob Frush', team2: 'Max Athorn', team1Score: 0, team2Score: 0, winner: null },
  { week: 18, team1: 'Paul Johnson', team2: 'Devin Jones', team1Score: 0, team2Score: 0, winner: null },
  { week: 18, team1: 'Scott Thurston', team2: 'Paul Nikstad', team1Score: 0, team2Score: 0, winner: null }
];

export const initialLeagueData: LeagueData = {
  teams: initialTeams,
  lineups: initialLineups,
  gameStats: week1GameStats, // Week 1 scoring data
  matchups: initialMatchups,
  currentWeek: 8, // Will be auto-calculated based on available CSV data
  records: initialRecords,
  lockedWeeks: [] // Will be auto-calculated based on CSV data + complete lineups
};
