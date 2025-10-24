import React, { useState } from 'react';
import { useLeagueData } from '../context/LeagueContext';
import TeamLogo from '../components/TeamLogo';
import { calculateTeamRecords } from '../utils/scoring';
import { getWeeklyCSVData } from '../data/scoringData';
import { parseWeeklyCSV } from '../utils/csvParser';

const Home: React.FC = () => {
  const { leagueData, updateLeagueData } = useLeagueData();
  const [selectedWeek, setSelectedWeek] = useState(leagueData.currentWeek - 1);


  // Get matchups for selected week
  const weekMatchups = leagueData.matchups.filter(m => m.week === selectedWeek);
  
  // Get lineups for selected week
  const weekLineups = leagueData.lineups.filter(l => l.week === selectedWeek);

  // Helper function to get team score and breakdown for a QB
  const getTeamScoreAndBreakdown = (qb: string) => {
    try {
      const csvData = getWeeklyCSVData(selectedWeek);
      if (!csvData) {
        console.log(`No CSV data available for week ${selectedWeek}`);
        return { score: 0, breakdown: null };
      }
      
      const weeklyData = parseWeeklyCSV(csvData, selectedWeek);
      const teamPerformance = weeklyData.qbPerformances.find(team => team.team === qb);
      
      if (teamPerformance) {
        console.log(`Found performance for ${qb}:`, teamPerformance);
        return { score: teamPerformance.finalScore, breakdown: teamPerformance };
      } else {
        console.log(`No performance data found for ${qb}. Available teams:`, weeklyData.qbPerformances.map(t => t.team));
        return { score: 0, breakdown: null };
      }
    } catch (error) {
      console.error(`Error getting score for ${qb}:`, error);
      return { score: 0, breakdown: null };
    }
  };

  // Calculate matchup scores dynamically from CSV data and lineups
  const calculateMatchupScores = (matchup: any) => {
    const team1Lineup = weekLineups.find(l => l.teamName === matchup.team1);
    const team2Lineup = weekLineups.find(l => l.teamName === matchup.team2);
    
    let team1Score = 0;
    let team2Score = 0;
    let team1Breakdown: any[] = [];
    let team2Breakdown: any[] = [];
    
    // Check if CSV data is available for this week
    const csvData = getWeeklyCSVData(selectedWeek);
    if (!csvData) {
      return { team1Score: 0, team2Score: 0, team1Breakdown: [], team2Breakdown: [] };
    }
    
    // Calculate team 1 score
    if (team1Lineup) {
      team1Lineup.activeQBs.forEach(qb => {
        const { score, breakdown } = getTeamScoreAndBreakdown(qb);
        team1Score += score;
        if (breakdown) {
          team1Breakdown.push({ qb, breakdown });
        }
      });
    }
    
    // Calculate team 2 score
    if (team2Lineup) {
      team2Lineup.activeQBs.forEach(qb => {
        const { score, breakdown } = getTeamScoreAndBreakdown(qb);
        team2Score += score;
        if (breakdown) {
          team2Breakdown.push({ qb, breakdown });
        }
      });
    }
    
    return { team1Score, team2Score, team1Breakdown, team2Breakdown };
  };

  // Helper function to calculate team records using dynamic scoring
  const calculateDynamicTeamRecords = () => {
    const records: { [teamName: string]: { wins: number; losses: number; ties: number; totalPoints: number } } = {};

    // Initialize records for all teams
    leagueData.teams.forEach(team => {
      records[team.name] = {
        wins: 0,
        losses: 0,
        ties: 0,
        totalPoints: 0
      };
    });

    // Process each matchup using dynamic scoring
    leagueData.matchups.forEach(matchup => {
      const { team1Score, team2Score } = calculateMatchupScores(matchup);
      
      // Only count if there are actual scores
      if (team1Score > 0 || team2Score > 0) {
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
      }
    });

    // Convert to array format
    return Object.entries(records).map(([teamName, record]) => ({
      teamName,
      wins: record.wins,
      losses: record.losses,
      ties: record.ties,
      totalPoints: record.totalPoints
    }));
  };

  // Calculate standings dynamically from matchups using dynamic scoring
  const calculatedRecords = calculateDynamicTeamRecords();
  const standings = calculatedRecords.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    return b.totalPoints - a.totalPoints;
  });

  // W/L/T Chart functions
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  const teams = leagueData.teams.map(team => team.name);

  // Helper function to get team score and breakdown for a QB (for W/L/T chart)
  const getTeamScoreAndBreakdownForWeek = (qb: string, week: number) => {
    try {
      const csvData = getWeeklyCSVData(week);
      if (!csvData) {
        return { score: 0, breakdown: null };
      }
      
      const weeklyData = parseWeeklyCSV(csvData, week);
      const teamPerformance = weeklyData.qbPerformances.find(team => team.team === qb);
      
      if (teamPerformance) {
        return { score: teamPerformance.finalScore, breakdown: teamPerformance };
      } else {
        return { score: 0, breakdown: null };
      }
    } catch (error) {
      return { score: 0, breakdown: null };
    }
  };

  // Calculate matchup scores for W/L/T chart
  const calculateMatchupScoresForWeek = (matchup: any, week: number) => {
    const team1Lineup = leagueData.lineups.find(l => l.teamName === matchup.team1 && l.week === week);
    const team2Lineup = leagueData.lineups.find(l => l.teamName === matchup.team2 && l.week === week);
    
    let team1Score = 0;
    let team2Score = 0;
    
    // Check if CSV data is available for this week
    const csvData = getWeeklyCSVData(week);
    if (!csvData) {
      return { team1Score: 0, team2Score: 0 };
    }
    
    // Calculate team 1 score
    if (team1Lineup) {
      team1Lineup.activeQBs.forEach(qb => {
        const { score } = getTeamScoreAndBreakdownForWeek(qb, week);
        team1Score += score;
      });
    }
    
    // Calculate team 2 score
    if (team2Lineup) {
      team2Lineup.activeQBs.forEach(qb => {
        const { score } = getTeamScoreAndBreakdownForWeek(qb, week);
        team2Score += score;
      });
    }
    
    return { team1Score, team2Score };
  };

  // Helper function to get result for a team in a specific week
  const getTeamWeekResult = (teamName: string, week: number): 'W' | 'L' | 'T' | null => {
    const matchup = leagueData.matchups.find(m => 
      m.week === week && 
      (m.team1 === teamName || m.team2 === teamName)
    );

    if (!matchup) return null;

    // Calculate scores dynamically
    const { team1Score, team2Score } = calculateMatchupScoresForWeek(matchup, week);

    // Only show result if there are actual scores
    if (team1Score === 0 && team2Score === 0) {
      return null; // No data available
    }

    if (team1Score === team2Score) {
      return 'T'; // Tie
    }

    if (matchup.team1 === teamName) {
      return team1Score > team2Score ? 'W' : 'L';
    } else {
      return team2Score > team1Score ? 'W' : 'L';
    }
  };

  // Helper function to calculate current record for a team from matchups
  const getCurrentRecord = (teamName: string): string => {
    let wins = 0;
    let losses = 0;
    let ties = 0;

    // Count wins/losses/ties from all matchups using dynamic scoring
    leagueData.matchups.forEach(matchup => {
      if (matchup.team1 === teamName || matchup.team2 === teamName) {
        const { team1Score, team2Score } = calculateMatchupScoresForWeek(matchup, matchup.week);
        
        // Only count if there are actual scores
        if (team1Score > 0 || team2Score > 0) {
          if (team1Score === team2Score) {
            ties++;
          } else if (matchup.team1 === teamName) {
            if (team1Score > team2Score) {
              wins++;
            } else {
              losses++;
            }
          } else {
            if (team2Score > team1Score) {
              wins++;
            } else {
              losses++;
            }
          }
        }
      }
    });

    return `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Week Navigation */}
      <div className="bg-dark-surface rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Week {selectedWeek}</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
              className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setSelectedWeek(Math.min(18, selectedWeek + 1))}
              className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Matchups - Top row with 4 columns */}
      <div className="space-y-4">
        {weekMatchups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {weekMatchups.map((matchup, index) => {
              const { team1Score, team2Score, team1Breakdown, team2Breakdown } = calculateMatchupScores(matchup);
              const csvData = getWeeklyCSVData(selectedWeek);
              const hasData = !!csvData;
              
              return (
                <div key={index} className="bg-dark-card rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-3">
                        <TeamLogo teamName={matchup.team1} size="md" showName={true} />
                        <div className="text-3xl font-bold text-center min-w-[60px]">{team1Score}</div>
                      </div>
                      {hasData ? (
                        <div className="flex justify-center space-x-2">
                          {team1Breakdown.map(({ qb, breakdown }) => (
                            <div 
                              key={qb} 
                              className="w-16 h-16 bg-gray-700 rounded flex flex-col items-center justify-center cursor-help hover:bg-gray-600 transition-colors relative group"
                              title={`${qb} - ${breakdown.finalScore} points`}
                            >
                              <TeamLogo teamName={qb} size="sm" className="mb-1" />
                              <span className="text-xs font-bold text-blue-400">{breakdown.finalScore}</span>
                              
                              {/* Enhanced tooltip with scoring breakdown */}
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                                <div className="bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg border border-gray-600 max-w-xs">
                                  <div className="font-semibold mb-2">{qb} - {breakdown.finalScore} pts</div>
                                  <div className="space-y-1">
                                    <div>Pass Yards: {breakdown.passYards} → {breakdown.passYardsScore} pts</div>
                                    <div>Touchdowns: {breakdown.touchdowns} → {breakdown.touchdownsScore} pts</div>
                                    <div>Completion %: {breakdown.completionPercent}% → {breakdown.completionScore} pts</div>
                                    <div>Turnovers: {breakdown.interceptions + breakdown.fumbles} → {breakdown.turnoverScore} pts</div>
                                    {breakdown.defensiveTD > 0 && <div>Def TD: {breakdown.defensiveTD} → +{breakdown.defensiveTD * 20} pts</div>}
                                    {breakdown.safety > 0 && <div>Safety: {breakdown.safety} → +{breakdown.safety * 15} pts</div>}
                                    {breakdown.gameEndingFumble > 0 && <div>GEF: {breakdown.gameEndingFumble} → +{breakdown.gameEndingFumble * 50} pts</div>}
                                    {breakdown.gameWinningDrive > 0 && <div>GWD: {breakdown.gameWinningDrive} → {breakdown.gameWinningDrive * -12} pts</div>}
                                    {breakdown.benching > 0 && <div>Benching: {breakdown.benching} → +{breakdown.benching * 35} pts</div>}
                                    <div className="border-t border-gray-600 pt-1 mt-2">
                                      <div className="font-semibold">Final: {breakdown.finalScore} pts</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-gray-400 text-sm py-4">
                          Scores not available yet
                        </div>
                      )}
                    </div>
                    
                    <div className="mx-6 text-gray-400 text-lg font-medium">vs</div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-3xl font-bold text-center min-w-[60px]">{team2Score}</div>
                        <TeamLogo teamName={matchup.team2} size="md" showName={true} />
                      </div>
                      {hasData ? (
                        <div className="flex justify-center space-x-2">
                          {team2Breakdown.map(({ qb, breakdown }) => (
                            <div 
                              key={qb} 
                              className="w-16 h-16 bg-gray-700 rounded flex flex-col items-center justify-center cursor-help hover:bg-gray-600 transition-colors relative group"
                              title={`${qb} - ${breakdown.finalScore} points`}
                            >
                              <TeamLogo teamName={qb} size="sm" className="mb-1" />
                              <span className="text-xs font-bold text-blue-400">{breakdown.finalScore}</span>
                              
                              {/* Enhanced tooltip with scoring breakdown */}
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                                <div className="bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg border border-gray-600 max-w-xs">
                                  <div className="font-semibold mb-2">{qb} - {breakdown.finalScore} pts</div>
                                  <div className="space-y-1">
                                    <div>Pass Yards: {breakdown.passYards} → {breakdown.passYardsScore} pts</div>
                                    <div>Touchdowns: {breakdown.touchdowns} → {breakdown.touchdownsScore} pts</div>
                                    <div>Completion %: {breakdown.completionPercent}% → {breakdown.completionScore} pts</div>
                                    <div>Turnovers: {breakdown.interceptions + breakdown.fumbles} → {breakdown.turnoverScore} pts</div>
                                    {breakdown.defensiveTD > 0 && <div>Def TD: {breakdown.defensiveTD} → +{breakdown.defensiveTD * 20} pts</div>}
                                    {breakdown.safety > 0 && <div>Safety: {breakdown.safety} → +{breakdown.safety * 15} pts</div>}
                                    {breakdown.gameEndingFumble > 0 && <div>GEF: {breakdown.gameEndingFumble} → +{breakdown.gameEndingFumble * 50} pts</div>}
                                    {breakdown.gameWinningDrive > 0 && <div>GWD: {breakdown.gameWinningDrive} → {breakdown.gameWinningDrive * -12} pts</div>}
                                    {breakdown.benching > 0 && <div>Benching: {breakdown.benching} → +{breakdown.benching * 35} pts</div>}
                                    <div className="border-t border-gray-600 pt-1 mt-2">
                                      <div className="font-semibold">Final: {breakdown.finalScore} pts</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-gray-400 text-sm py-4">
                          Scores not available yet
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {hasData && team1Score !== team2Score && (
                    <div className="mt-3 text-center">
                      <span className="inline-block px-3 py-1 bg-green-600 text-white rounded-full text-sm">
                        Winner: {team1Score > team2Score ? matchup.team1 : matchup.team2}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-dark-card rounded-lg p-8 text-center text-gray-400">
            No matchups scheduled for Week {selectedWeek}
          </div>
        )}
      </div>

      {/* Bottom row - League Standings and W/L/T Chart side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* League Standings - Left side (1/3 width) */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">League Standings</h3>
          <div className="bg-dark-card rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-300">Rank</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-300">Team</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-300">Record</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-300">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-600">
                  {standings.map((team, index) => (
                    <tr key={team.teamName} className="hover:bg-gray-700">
                      <td className="px-3 py-2 text-sm">{index + 1}</td>
                      <td className="px-3 py-2 text-sm font-medium">
                        <TeamLogo teamName={team.teamName} size="sm" showName={true} />
                      </td>
                      <td className="px-3 py-2 text-sm">{team.wins}-{team.losses}</td>
                      <td className="px-3 py-2 text-sm">{team.totalPoints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Season W/L/T Chart - Right side (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Season W/L/T Chart</h3>
            {/* Legend */}
            <div className="flex space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-600 rounded"></div>
                <span className="text-gray-300">Win</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-600 rounded"></div>
                <span className="text-gray-300">Loss</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span className="text-gray-300">Tie</span>
              </div>
            </div>
          </div>
          <div className="bg-dark-card rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-300 w-32">Team</th>
                    {weeks.map(week => (
                      <th key={week} className="px-1 py-2 text-center text-xs font-medium text-gray-300 w-8">
                        {week}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-300 w-16">Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-600">
                  {teams.map(teamName => {
                    const record = getCurrentRecord(teamName);
                    return (
                      <tr key={teamName} className="hover:bg-gray-700">
                        <td className="px-3 py-2 text-sm font-medium">
                          <TeamLogo teamName={teamName} size="sm" showName={true} />
                        </td>
                        {weeks.map(week => {
                          const result = getTeamWeekResult(teamName, week);
                          return (
                            <td key={week} className="px-1 py-2 text-center">
                              {result && (
                                <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold mx-auto ${
                                  result === 'W' 
                                    ? 'bg-green-600 text-white' 
                                    : result === 'L' 
                                    ? 'bg-red-600 text-white' 
                                    : 'bg-yellow-500 text-black'
                                }`}>
                                  {result}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center text-sm font-medium">{record}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
