import { GameStats } from '../types';
import { calculateScore, QBStats } from '../utils/scoring';

// Week 1 QB performance data parsed from CSV
const week1QBData = [
  // Cleveland (Paul Johnson's QB)
  { team: 'Cleveland', passYards: 290, touchdowns: 1, completionPercent: 68.89, turnovers: 2, events: [] },
  // Miami (Paul Johnson's QB) 
  { team: 'Miami', passYards: 146, touchdowns: 1, completionPercent: 61.29, turnovers: 3, events: ['Fumble', 'Benching'] },
  // NY Giants (Max Athorn's QB)
  { team: 'NY Giants', passYards: 168, touchdowns: 0, completionPercent: 45.95, turnovers: 1, events: ['Fumble'] },
  // New England (Max Athorn's QB)
  { team: 'New England', passYards: 287, touchdowns: 1, completionPercent: 65.22, turnovers: 1, events: ['Fumble'] },
  // Pittsburgh (Anthony Meehl's QB)
  { team: 'Pittsburgh', passYards: 244, touchdowns: 4, completionPercent: 73.33, turnovers: 0, events: [] },
  // LA Chargers (Anthony Meehl's QB)
  { team: 'LA Chargers', passYards: 318, touchdowns: 3, completionPercent: 73.53, turnovers: 0, events: [] },
  // Tennessee (Eric Johnson's QB)
  { team: 'Tennessee', passYards: 112, touchdowns: 0, completionPercent: 42.86, turnovers: 1, events: ['Fumble'] },
  // LA Rams (Eric Johnson's QB)
  { team: 'LA Rams', passYards: 245, touchdowns: 1, completionPercent: 72.41, turnovers: 0, events: ['Fumble'] },
  // NY Jets (Scott Thurston's QB)
  { team: 'NY Jets', passYards: 218, touchdowns: 1, completionPercent: 72.73, turnovers: 0, events: [] },
  // Minnesota (Scott Thurston's QB)
  { team: 'Minnesota', passYards: 143, touchdowns: 2, completionPercent: 65, turnovers: 1, events: ['Defensive TD'] },
  // New Orleans (Jacob Frush's QB)
  { team: 'New Orleans', passYards: 214, touchdowns: 0, completionPercent: 58.7, turnovers: 0, events: [] },
  // Chicago (Jacob Frush's QB)
  { team: 'Chicago', passYards: 210, touchdowns: 1, completionPercent: 60, turnovers: 0, events: [] },
  // Las Vegas (Paul Nikstad's QB)
  { team: 'Las Vegas', passYards: 362, touchdowns: 1, completionPercent: 70.59, turnovers: 1, events: [] },
  // Green Bay (Paul Nikstad's QB)
  { team: 'Green Bay', passYards: 188, touchdowns: 2, completionPercent: 72.73, turnovers: 0, events: [] },
  // Indianapolis (Devin Jones's QB)
  { team: 'Indianapolis', passYards: 272, touchdowns: 1, completionPercent: 75.86, turnovers: 0, events: [] },
  // Atlanta (Devin Jones's QB)
  { team: 'Atlanta', passYards: 298, touchdowns: 1, completionPercent: 64.29, turnovers: 1, events: ['Fumble'] }
];

// Convert QB data to GameStats format
export const week1GameStats: GameStats[] = [
  // Paul Johnson (Cleveland + Miami)
  {
    teamName: 'Paul Johnson',
    week: 1,
    qbStats: {
      'Cleveland': {
        passYards: 290,
        touchdowns: 1,
        completionPercent: 68.89,
        turnovers: 2,
        events: []
      },
      'Miami': {
        passYards: 146,
        touchdowns: 1,
        completionPercent: 61.29,
        turnovers: 3,
        events: ['Fumble', 'Benching']
      }
    },
    calculatedScore: 0 // Will be calculated
  },
  // Max Athorn (NY Giants + New England)
  {
    teamName: 'Max Athorn',
    week: 1,
    qbStats: {
      'NY Giants': {
        passYards: 168,
        touchdowns: 0,
        completionPercent: 45.95,
        turnovers: 1,
        events: ['Fumble']
      },
      'New England': {
        passYards: 287,
        touchdowns: 1,
        completionPercent: 65.22,
        turnovers: 1,
        events: ['Fumble']
      }
    },
    calculatedScore: 0 // Will be calculated
  },
  // Anthony Meehl (Pittsburgh + LA Chargers)
  {
    teamName: 'Anthony Meehl',
    week: 1,
    qbStats: {
      'Pittsburgh': {
        passYards: 244,
        touchdowns: 4,
        completionPercent: 73.33,
        turnovers: 0,
        events: []
      },
      'LA Chargers': {
        passYards: 318,
        touchdowns: 3,
        completionPercent: 73.53,
        turnovers: 0,
        events: []
      }
    },
    calculatedScore: 0 // Will be calculated
  },
  // Eric Johnson (Tennessee + LA Rams)
  {
    teamName: 'Eric Johnson',
    week: 1,
    qbStats: {
      'Tennessee': {
        passYards: 112,
        touchdowns: 0,
        completionPercent: 42.86,
        turnovers: 1,
        events: ['Fumble']
      },
      'LA Rams': {
        passYards: 245,
        touchdowns: 1,
        completionPercent: 72.41,
        turnovers: 0,
        events: ['Fumble']
      }
    },
    calculatedScore: 0 // Will be calculated
  },
  // Scott Thurston (NY Jets + Minnesota)
  {
    teamName: 'Scott Thurston',
    week: 1,
    qbStats: {
      'NY Jets': {
        passYards: 218,
        touchdowns: 1,
        completionPercent: 72.73,
        turnovers: 0,
        events: []
      },
      'Minnesota': {
        passYards: 143,
        touchdowns: 2,
        completionPercent: 65,
        turnovers: 1,
        events: ['Defensive TD']
      }
    },
    calculatedScore: 0 // Will be calculated
  },
  // Jacob Frush (New Orleans + Chicago)
  {
    teamName: 'Jacob Frush',
    week: 1,
    qbStats: {
      'New Orleans': {
        passYards: 214,
        touchdowns: 0,
        completionPercent: 58.7,
        turnovers: 0,
        events: []
      },
      'Chicago': {
        passYards: 210,
        touchdowns: 1,
        completionPercent: 60,
        turnovers: 0,
        events: []
      }
    },
    calculatedScore: 0 // Will be calculated
  },
  // Paul Nikstad (Las Vegas + Green Bay)
  {
    teamName: 'Paul Nikstad',
    week: 1,
    qbStats: {
      'Las Vegas': {
        passYards: 362,
        touchdowns: 1,
        completionPercent: 70.59,
        turnovers: 1,
        events: []
      },
      'Green Bay': {
        passYards: 188,
        touchdowns: 2,
        completionPercent: 72.73,
        turnovers: 0,
        events: []
      }
    },
    calculatedScore: 0 // Will be calculated
  },
  // Devin Jones (Indianapolis + Atlanta)
  {
    teamName: 'Devin Jones',
    week: 1,
    qbStats: {
      'Indianapolis': {
        passYards: 272,
        touchdowns: 1,
        completionPercent: 75.86,
        turnovers: 0,
        events: []
      },
      'Atlanta': {
        passYards: 298,
        touchdowns: 1,
        completionPercent: 64.29,
        turnovers: 1,
        events: ['Fumble']
      }
    },
    calculatedScore: 0 // Will be calculated
  }
];

// Calculate scores for all teams
week1GameStats.forEach(gameStat => {
  const qbStatsArray = Object.values(gameStat.qbStats);
  gameStat.calculatedScore = qbStatsArray.reduce((total, qbStats) => {
    return total + calculateScore(qbStats);
  }, 0);
});
