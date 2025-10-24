// CSV parsing utilities for weekly scoring data

export interface QBPerformance {
  team: string;
  passYards: number;
  touchdowns: number;
  completionPercent: number;
  turnovers: number;
  events: string[];
  finalScore: number;
  // Additional stats from CSV
  passCompletions: number;
  passAttempts: number;
  interceptions: number;
  sacks: number;
  sackYards: number;
  qbr: number;
  rushYards: number;
  rushTouchdowns: number;
  longestPlay: number;
  fumbles: number;
  fumblesLost: number;
  defensiveTD: number;
  safety: number;
  gameEndingFumble: number;
  gameWinningDrive: number;
  benching: number;
  netPassYards: number;
  totalTouchdowns: number;
  // Scoring breakdown
  passYardsScore: number;
  touchdownsScore: number;
  completionScore: number;
  turnoverScore: number;
  eventScore: number;
}

// Map team abbreviations to full names
const teamNameMap: { [key: string]: string } = {
  'CAR': 'Carolina',
  'JAX': 'Jacksonville', 
  'CIN': 'Cincinnati',
  'CLE': 'Cleveland',
  'MIA': 'Miami',
  'IND': 'Indianapolis',
  'LV': 'Las Vegas',
  'NE': 'New England',
  'HOU': 'Houston',
  'LAR': 'LA Rams',
  'TB': 'Tampa Bay',
  'ATL': 'Atlanta',
  'PIT': 'Pittsburgh',
  'NYJ': 'NY Jets',
  'TEN': 'Tennessee',
  'DEN': 'Denver',
  'ARI': 'Arizona',
  'NO': 'New Orleans',
  'NYG': 'NY Giants',
  'WSH': 'Washington',
  'BAL': 'Baltimore',
  'BUF': 'Buffalo',
  'DET': 'Detroit',
  'GB': 'Green Bay',
  'SF': 'San Francisco',
  'SEA': 'Seattle',
  'MIN': 'Minnesota',
  'CHI': 'Chicago',
  'KC': 'Kansas City',
  'LAC': 'LA Chargers',
  'DAL': 'Dallas',
  'PHI': 'Philadelphia'
};

export interface WeeklyScoringData {
  week: number;
  qbPerformances: QBPerformance[];
}

/**
 * Parse CSV data for a specific week
 */
export function parseWeeklyCSV(csvData: string, week: number): WeeklyScoringData {
  const lines = csvData.trim().split('\n');
  const headers = lines[0].split(',');
  
  // Find column indices
  const teamIndex = headers.indexOf('TeamID');
  const passCompletionsIndex = headers.indexOf('PComp');
  const passAttemptsIndex = headers.indexOf('PAtt');
  const passYardsIndex = headers.indexOf('PYds');
  const touchdownsIndex = headers.indexOf('PTds');
  const interceptionsIndex = headers.indexOf('Ints');
  const sacksIndex = headers.indexOf('Sack');
  const sackYardsIndex = headers.indexOf('SYds');
  const qbrIndex = headers.indexOf('Qbr');
  const rushYardsIndex = headers.indexOf('RYds');
  const rushTouchdownsIndex = headers.indexOf('RTds');
  const longestPlayIndex = headers.indexOf('Long');
  const fumblesIndex = headers.indexOf('Fumb');
  const fumblesLostIndex = headers.indexOf('FumL');
  const defensiveTDIndex = headers.indexOf('DefTD');
  const safetyIndex = headers.indexOf('Saf');
  const gameEndingFumbleIndex = headers.indexOf('Gefu');
  const gameWinningDriveIndex = headers.indexOf('Gwd');
  const benchingIndex = headers.indexOf('Bnch');
  const completionIndex = headers.indexOf('PComPct');
  const netPassYardsIndex = headers.indexOf('NetPYds');
  const totalTouchdownsIndex = headers.indexOf('TTds');
  const finalScoreIndex = headers.indexOf('ZFinal');
  // Scoring breakdown indices
  const passYardsScoreIndex = headers.indexOf('ZPYds');
  const touchdownsScoreIndex = headers.indexOf('ZTTds');
  const completionScoreIndex = headers.indexOf('ZPComp');
  const turnoverScoreIndex = headers.indexOf('ZTTos');
  const eventScoreIndex = headers.indexOf('ZFinal');
  
  const qbPerformances: QBPerformance[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;
    
    const team = values[teamIndex];
    const passCompletions = parseInt(values[passCompletionsIndex]) || 0;
    const passAttempts = parseInt(values[passAttemptsIndex]) || 0;
    const passYards = parseInt(values[passYardsIndex]) || 0;
    const touchdowns = parseInt(values[touchdownsIndex]) || 0;
    const interceptions = parseInt(values[interceptionsIndex]) || 0;
    const sacks = parseInt(values[sacksIndex]) || 0;
    const sackYards = parseInt(values[sackYardsIndex]) || 0;
    const qbr = parseFloat(values[qbrIndex]) || 0;
    const rushYards = parseInt(values[rushYardsIndex]) || 0;
    const rushTouchdowns = parseInt(values[rushTouchdownsIndex]) || 0;
    const longestPlay = parseInt(values[longestPlayIndex]) || 0;
    const fumbles = parseInt(values[fumblesIndex]) || 0;
    const fumblesLost = parseInt(values[fumblesLostIndex]) || 0;
    const defensiveTD = parseInt(values[defensiveTDIndex]) || 0;
    const safety = parseInt(values[safetyIndex]) || 0;
    const gameEndingFumble = parseInt(values[gameEndingFumbleIndex]) || 0;
    const gameWinningDrive = parseInt(values[gameWinningDriveIndex]) || 0;
    const benching = parseInt(values[benchingIndex]) || 0;
    const completionPercent = parseFloat(values[completionIndex]) || 0;
    const netPassYards = parseInt(values[netPassYardsIndex]) || 0;
    const totalTouchdowns = parseInt(values[totalTouchdownsIndex]) || 0;
    const finalScore = parseInt(values[finalScoreIndex]) || 0;
    
    // Scoring breakdown
    const passYardsScore = parseInt(values[passYardsScoreIndex]) || 0;
    const touchdownsScore = parseInt(values[touchdownsScoreIndex]) || 0;
    const completionScore = parseInt(values[completionScoreIndex]) || 0;
    const turnoverScore = parseInt(values[turnoverScoreIndex]) || 0;
    const eventScore = parseInt(values[eventScoreIndex]) || 0;
    
    // Calculate events based on performance
    const events: string[] = [];
    
    // Add events based on performance thresholds
    if (completionPercent <= 30) events.push('Poor Completion %');
    if (passYards <= 100) events.push('Low Pass Yards');
    if (touchdowns === 0) events.push('No Touchdowns');
    if (interceptions >= 3) events.push('Multiple Interceptions');
    if (fumbles >= 2) events.push('Multiple Fumbles');
    if (defensiveTD > 0) events.push('Defensive TD');
    if (safety > 0) events.push('Safety');
    if (gameEndingFumble > 0) events.push('Game-ending Fumble');
    if (gameWinningDrive > 0) events.push('Game-winning Drive');
    if (benching > 0) events.push('Benching');
    
    qbPerformances.push({
      team: teamNameMap[team] || team,
      passYards,
      touchdowns,
      completionPercent,
      turnovers: interceptions + fumbles,
      events,
      finalScore,
      // Additional stats
      passCompletions,
      passAttempts,
      interceptions,
      sacks,
      sackYards,
      qbr,
      rushYards,
      rushTouchdowns,
      longestPlay,
      fumbles,
      fumblesLost,
      defensiveTD,
      safety,
      gameEndingFumble,
      gameWinningDrive,
      benching,
      netPassYards,
      totalTouchdowns,
      // Scoring breakdown
      passYardsScore,
      touchdownsScore,
      completionScore,
      turnoverScore,
      eventScore
    });
  }
  
  return {
    week,
    qbPerformances
  };
}

/**
 * Get QB performance for a specific team in a specific week
 */
export function getQBPerformance(
  csvData: string, 
  week: number, 
  team: string
): QBPerformance | null {
  const weeklyData = parseWeeklyCSV(csvData, week);
  return weeklyData.qbPerformances.find(qb => qb.team === team) || null;
}

/**
 * Calculate team score based on selected QBs
 */
export function calculateTeamScoreFromCSV(
  csvData: string,
  week: number,
  selectedQBs: string[]
): { totalScore: number; qbBreakdown: { [qb: string]: QBPerformance } } {
  const weeklyData = parseWeeklyCSV(csvData, week);
  const qbBreakdown: { [qb: string]: QBPerformance } = {};
  let totalScore = 0;
  
  selectedQBs.forEach(qb => {
    const performance = weeklyData.qbPerformances.find(p => p.team === qb);
    if (performance) {
      qbBreakdown[qb] = performance;
      totalScore += performance.finalScore;
    }
  });
  
  return { totalScore, qbBreakdown };
}
