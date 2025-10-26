import React, { useState, useEffect } from 'react';
import { useLeagueData } from '../context/LeagueContext';
import TeamLogo from '../components/TeamLogo';
import { 
  calculateStandings, 
  calculateWeeklyResults, 
  getTeamWeekResult, 
  getCurrentRecord,
  calculateMatchupScore,
  getTeamWeekMatchupDetails
} from '../utils/standingsCalculator';
import { getWeeklyCSVData } from '../data/scoringData';

const Home: React.FC = () => {
  const { leagueData, updateLeagueData, isWeekLocked } = useLeagueData();
  const [selectedWeek, setSelectedWeek] = useState(() => {
    // If no data loaded yet, default to week 1
    if (!leagueData.matchups || leagueData.matchups.length === 0) {
      return 1;
    }
    
    // Show current week if matchups exist, otherwise show previous week
    const currentWeekMatchups = leagueData.matchups.filter(m => m.week === leagueData.currentWeek);
    return currentWeekMatchups.length > 0 ? leagueData.currentWeek : Math.max(1, leagueData.currentWeek - 1);
  });

  // Update selected week when data loads (only on initial load, not on manual navigation)
  const [hasInitialized, setHasInitialized] = useState(false);
  const [hasManuallyNavigated, setHasManuallyNavigated] = useState(false);
  
  useEffect(() => {
    if (leagueData.matchups && leagueData.matchups.length > 0 && !hasInitialized) {
      const currentWeekMatchups = leagueData.matchups.filter(m => m.week === leagueData.currentWeek);
      const newSelectedWeek = currentWeekMatchups.length > 0 ? leagueData.currentWeek : Math.max(1, leagueData.currentWeek - 1);
      
      console.log(`🔄 Initial data load - setting selected week to ${newSelectedWeek}`);
      setSelectedWeek(newSelectedWeek);
      setHasInitialized(true);
    }
  }, [leagueData.matchups, leagueData.currentWeek, hasInitialized]);

  // Auto-switch to current week when matchups become available (only if user hasn't manually navigated)
  useEffect(() => {
    if (!hasInitialized || hasManuallyNavigated) return; // Don't run if user has manually navigated
    
    const currentWeekMatchups = leagueData.matchups.filter(m => m.week === leagueData.currentWeek);
    console.log(`📊 Week switching logic:`, {
      currentWeek: leagueData.currentWeek,
      selectedWeek,
      currentWeekMatchups: currentWeekMatchups.length,
      hasManuallyNavigated,
      shouldSwitch: currentWeekMatchups.length > 0 && selectedWeek === leagueData.currentWeek - 1 && !hasManuallyNavigated
    });
    
    // Only auto-switch if we're on the previous week and current week matchups are now available
    // AND there's actual scoring data for the current week
    // AND we haven't manually navigated to a different week
    const hasCurrentWeekData = getWeeklyCSVData(leagueData.currentWeek) !== '';
    const isOnPreviousWeek = selectedWeek === leagueData.currentWeek - 1;
    const hasCurrentWeekMatchups = currentWeekMatchups.length > 0;
    
    if (hasCurrentWeekMatchups && isOnPreviousWeek && hasCurrentWeekData && !hasManuallyNavigated) {
      // Current week matchups are now available, switch to showing them
      console.log(`🔄 Auto-switching to Week ${leagueData.currentWeek} - matchups are now available`);
      setSelectedWeek(leagueData.currentWeek);
    }
  }, [leagueData.matchups, leagueData.currentWeek, selectedWeek, hasInitialized, hasManuallyNavigated]);

  // Get matchups for selected week
  const weekMatchups = leagueData.matchups.filter(m => m.week === selectedWeek);
  
  // Get lineups for selected week
  const weekLineups = leagueData.lineups.filter(l => l.week === selectedWeek);

  // Calculate standings using the centralized utility
  const standings = calculateStandings(leagueData.matchups, leagueData.lineups, leagueData.teams);

  // W/L/T Chart functions
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  const teams = leagueData.teams.map(team => team.name);


  return (
    <div className="space-y-6">
      {/* Week Navigation */}
      <div className="bg-dark-surface rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-semibold">Week {selectedWeek}</h2>
            {selectedWeek === leagueData.currentWeek && (
              <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full font-medium">
                Current Week
              </span>
            )}
            {selectedWeek < leagueData.currentWeek && (
              <span className="px-2 py-1 bg-gray-600 text-white text-xs rounded-full font-medium">
                Previous Results
              </span>
            )}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => {
                setSelectedWeek(Math.max(1, selectedWeek - 1));
                setHasManuallyNavigated(true);
              }}
              className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
            >
              Previous
            </button>
            <button
              onClick={() => {
                setSelectedWeek(Math.min(18, selectedWeek + 1));
                setHasManuallyNavigated(true);
              }}
              className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
            >
              Next
            </button>
            {selectedWeek !== leagueData.currentWeek && (
              <button
                onClick={() => {
                  setSelectedWeek(leagueData.currentWeek);
                  setHasManuallyNavigated(false); // Reset manual navigation flag
                }}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              >
                Current Week
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Matchups - Top row with 4 columns */}
      <div className="space-y-4">
        {weekMatchups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {weekMatchups.map((matchup, index) => {
              const { team1Score, team2Score, team1Breakdown, team2Breakdown } = calculateMatchupScore(matchup, leagueData.lineups);
              const csvData = getWeeklyCSVData(selectedWeek);
              const hasData = !!csvData;
              
              return (
                <div key={index} className="bg-dark-card rounded-lg p-4">
                  {/* Row 1: User 1 vs User 2 */}
                  <div className="flex items-center justify-center mb-4">
                    <TeamLogo teamName={matchup.team1} size="md" showName={true} />
                    <div className="mx-4 text-gray-400 text-lg font-medium">vs</div>
                    <TeamLogo teamName={matchup.team2} size="md" showName={true} />
                  </div>

                  {/* Row 2: Team cards and total scores */}
                  <div className="flex items-center justify-between mb-4">
                    {/* User 1 teams */}
                    <div className="flex items-center space-x-2">
                      {hasData ? (
                        team1Breakdown.map(({ qb, breakdown }) => (
                          <div 
                            key={qb} 
                            className="w-16 h-16 bg-gray-700 rounded flex flex-col items-center justify-center cursor-help hover:bg-gray-600 transition-colors relative group"
                            title={`${qb} - ${breakdown.finalScore} points`}
                          >
                            <TeamLogo teamName={qb} size="sm" className="mb-1" />
                            <span className="text-xs font-bold text-blue-400">{breakdown.finalScore}</span>
                            
                            {/* Enhanced tooltip with scoring breakdown */}
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                              <div className="bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg border border-gray-600 min-w-max">
                                <div className="font-semibold mb-2">{qb} - {breakdown.finalScore} pts</div>
                                <div className="space-y-1">
                                  <div className="whitespace-nowrap">Pass Yards: {breakdown.passYards} → {breakdown.passYardsScore} pts</div>
                                  <div className="whitespace-nowrap">Touchdowns: {breakdown.touchdowns} → {breakdown.touchdownsScore} pts</div>
                                  <div className="whitespace-nowrap">Completion %: {breakdown.completionPercent}% → {breakdown.completionScore} pts</div>
                                  <div className="whitespace-nowrap">Turnovers: {breakdown.interceptions + breakdown.fumbles} → {breakdown.turnoverScore} pts</div>
                                  {breakdown.defensiveTD > 0 && <div className="whitespace-nowrap">Def TD: {breakdown.defensiveTD} → +{breakdown.defensiveTD * 20} pts</div>}
                                  {breakdown.safety > 0 && <div className="whitespace-nowrap">Safety: {breakdown.safety} → +{breakdown.safety * 15} pts</div>}
                                  {breakdown.gameEndingFumble > 0 && <div className="whitespace-nowrap">GEF: {breakdown.gameEndingFumble} → +{breakdown.gameEndingFumble * 50} pts</div>}
                                  {breakdown.gameWinningDrive > 0 && <div className="whitespace-nowrap">GWD: {breakdown.gameWinningDrive} → {breakdown.gameWinningDrive * -12} pts</div>}
                                  {breakdown.benching > 0 && <div className="whitespace-nowrap">Benching: {breakdown.benching} → +{breakdown.benching * 35} pts</div>}
                                  <div className="border-t border-gray-600 pt-1 mt-2">
                                    <div className="font-semibold">Final: {breakdown.finalScore} pts</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : team1Breakdown.length > 0 ? (
                        // Show actual QB logos when lineups are set but no CSV data
                        <div className="flex space-x-2">
                          {team1Breakdown.map(({ qb }, index) => (
                            <div 
                              key={index}
                              className="w-16 h-16 bg-gray-600 rounded flex flex-col items-center justify-center border-2 border-dashed border-gray-500"
                              title="Scores not available yet"
                            >
                              <TeamLogo teamName={qb} size="sm" className="mb-1" />
                              <span className="text-xs text-gray-400">--</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        // Show empty placeholder squares when no lineups are set (2 QBs per team)
                        <div className="flex space-x-2">
                          {[1, 2].map((_, index) => (
                            <div 
                              key={index}
                              className="w-16 h-16 bg-gray-600 rounded flex flex-col items-center justify-center border-2 border-dashed border-gray-500"
                              title="Lineup not set yet"
                            >
                              <div className="text-gray-400 text-xs">?</div>
                              <span className="text-xs text-gray-400">--</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Total scores in center */}
                    <div className="flex items-center space-x-4">
                      <div className={`text-2xl font-bold text-center min-w-[60px] ${
                        hasData && team1Score > team2Score ? 'text-green-400' : 
                        hasData && team1Score < team2Score ? 'text-red-400' : 'text-white'
                      }`}>{team1Score}</div>
                      <div className={`text-2xl font-bold text-center min-w-[60px] ${
                        hasData && team2Score > team1Score ? 'text-green-400' : 
                        hasData && team2Score < team1Score ? 'text-red-400' : 'text-white'
                      }`}>{team2Score}</div>
                    </div>

                    {/* User 2 teams */}
                    <div className="flex items-center space-x-2">
                      {hasData ? (
                        team2Breakdown.map(({ qb, breakdown }) => (
                          <div 
                            key={qb} 
                            className="w-16 h-16 bg-gray-700 rounded flex flex-col items-center justify-center cursor-help hover:bg-gray-600 transition-colors relative group"
                            title={`${qb} - ${breakdown.finalScore} points`}
                          >
                            <TeamLogo teamName={qb} size="sm" className="mb-1" />
                            <span className="text-xs font-bold text-blue-400">{breakdown.finalScore}</span>
                            
                            {/* Enhanced tooltip with scoring breakdown */}
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                              <div className="bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg border border-gray-600 min-w-max">
                                <div className="font-semibold mb-2">{qb} - {breakdown.finalScore} pts</div>
                                <div className="space-y-1">
                                  <div className="whitespace-nowrap">Pass Yards: {breakdown.passYards} → {breakdown.passYardsScore} pts</div>
                                  <div className="whitespace-nowrap">Touchdowns: {breakdown.touchdowns} → {breakdown.touchdownsScore} pts</div>
                                  <div className="whitespace-nowrap">Completion %: {breakdown.completionPercent}% → {breakdown.completionScore} pts</div>
                                  <div className="whitespace-nowrap">Turnovers: {breakdown.interceptions + breakdown.fumbles} → {breakdown.turnoverScore} pts</div>
                                  {breakdown.defensiveTD > 0 && <div className="whitespace-nowrap">Def TD: {breakdown.defensiveTD} → +{breakdown.defensiveTD * 20} pts</div>}
                                  {breakdown.safety > 0 && <div className="whitespace-nowrap">Safety: {breakdown.safety} → +{breakdown.safety * 15} pts</div>}
                                  {breakdown.gameEndingFumble > 0 && <div className="whitespace-nowrap">GEF: {breakdown.gameEndingFumble} → +{breakdown.gameEndingFumble * 50} pts</div>}
                                  {breakdown.gameWinningDrive > 0 && <div className="whitespace-nowrap">GWD: {breakdown.gameWinningDrive} → {breakdown.gameWinningDrive * -12} pts</div>}
                                  {breakdown.benching > 0 && <div className="whitespace-nowrap">Benching: {breakdown.benching} → +{breakdown.benching * 35} pts</div>}
                                  <div className="border-t border-gray-600 pt-1 mt-2">
                                    <div className="font-semibold">Final: {breakdown.finalScore} pts</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : team2Breakdown.length > 0 ? (
                        // Show actual QB logos when lineups are set but no CSV data
                        <div className="flex space-x-2">
                          {team2Breakdown.map(({ qb }, index) => (
                            <div 
                              key={index}
                              className="w-16 h-16 bg-gray-600 rounded flex flex-col items-center justify-center border-2 border-dashed border-gray-500"
                              title="Scores not available yet"
                            >
                              <TeamLogo teamName={qb} size="sm" className="mb-1" />
                              <span className="text-xs text-gray-400">--</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        // Show empty placeholder squares when no lineups are set (2 QBs per team)
                        <div className="flex space-x-2">
                          {[1, 2].map((_, index) => (
                            <div 
                              key={index}
                              className="w-16 h-16 bg-gray-600 rounded flex flex-col items-center justify-center border-2 border-dashed border-gray-500"
                              title="Lineup not set yet"
                            >
                              <div className="text-gray-400 text-xs">?</div>
                              <span className="text-xs text-gray-400">--</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Winner */}
                  {hasData && team1Score !== team2Score && (
                    <div className="text-center">
                      <span className="inline-block px-4 py-2 bg-green-600 text-white rounded-full text-sm font-semibold">
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
            {weekMatchups.length === 0 
              ? `No matchups scheduled for Week ${selectedWeek}`
              : "No lineups set yet for this week"
            }
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
                    const record = getCurrentRecord(teamName, leagueData.matchups, leagueData.lineups);
                    return (
                      <tr key={teamName} className="hover:bg-gray-700">
                        <td className="px-3 py-2 text-sm font-medium">
                          <TeamLogo teamName={teamName} size="sm" showName={true} />
                        </td>
                        {weeks.map((week, weekIndex) => {
                          const result = getTeamWeekResult(teamName, week, leagueData.matchups, leagueData.lineups);
                          const matchupDetails = getTeamWeekMatchupDetails(teamName, week, leagueData.matchups, leagueData.lineups);
                          const teamIndex = teams.indexOf(teamName);
                          const isNearBottom = teamIndex >= teams.length - 3; // Last 3 rows show tooltip above
                          return (
                            <td key={week} className="px-1 py-2 text-center">
                              {result && (
                                <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold mx-auto cursor-help hover:ring-2 hover:ring-blue-400 transition-all relative group ${
                                  result === 'W' 
                                    ? 'bg-green-600 text-white' 
                                    : result === 'L' 
                                    ? 'bg-red-600 text-white' 
                                    : 'bg-yellow-500 text-black'
                                }`}>
                                  {result}
                                  
                                  {/* Matchup tooltip */}
                                  {matchupDetails && (
                                    <div className={`absolute left-1/2 transform -translate-x-1/2 hidden group-hover:block z-[9999] ${
                                      isNearBottom 
                                        ? 'bottom-full mb-2' 
                                        : 'top-full mt-2'
                                    }`}>
                                      <div className="bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg border border-gray-600">
                                        <div className="flex items-center space-x-4">
                                          {/* Hovered team (always left side) */}
                                          <div className="text-center">
                                            <div className="w-8 h-8 mx-auto mb-1">
                                              <TeamLogo teamName={teamName} size="sm" />
                                            </div>
                                            <div className="flex space-x-0.5 mb-1">
                                              {matchupDetails.teamQBs.map(qb => (
                                                <div key={qb} className="w-5 h-5">
                                                  <TeamLogo teamName={qb} size="xs" />
                                                </div>
                                              ))}
                                            </div>
                                            <div className={`font-bold text-lg ${
                                              matchupDetails.teamScore > matchupDetails.opponentScore 
                                                ? 'text-green-400' 
                                                : matchupDetails.teamScore < matchupDetails.opponentScore 
                                                ? 'text-red-400' 
                                                : 'text-white'
                                            }`}>
                                              {matchupDetails.teamScore}
                                            </div>
                                          </div>
                                          
                                          {/* Opponent (always right side) */}
                                          <div className="text-center">
                                            <div className="w-8 h-8 mx-auto mb-1">
                                              <TeamLogo teamName={matchupDetails.opponent} size="sm" />
                                            </div>
                                            <div className="flex space-x-0.5 mb-1">
                                              {matchupDetails.opponentQBs.map(qb => (
                                                <div key={qb} className="w-5 h-5">
                                                  <TeamLogo teamName={qb} size="xs" />
                                                </div>
                                              ))}
                                            </div>
                                            <div className={`font-bold text-lg ${
                                              matchupDetails.opponentScore > matchupDetails.teamScore 
                                                ? 'text-green-400' 
                                                : matchupDetails.opponentScore < matchupDetails.teamScore 
                                                ? 'text-red-400' 
                                                : 'text-white'
                                            }`}>
                                              {matchupDetails.opponentScore}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
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
