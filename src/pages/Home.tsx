import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLeagueData } from '../context/LeagueContext';
import TeamLogo from '../components/TeamLogo';
import MatchupModal from '../components/MatchupModal';
import { 
  calculateStandingsFromSupabase, 
  calculateWeeklyResultsFromSupabase, 
  getTeamWeekResultFromSupabase, 
  getCurrentRecordFromSupabase,
  calculateMatchupScoreFromSupabase,
  getTeamWeekMatchupDetailsFromSupabase
} from '../utils/supabaseStandingsCalculator';
import { getDetailedScoringBreakdown } from '../utils/scoring';

const Home: React.FC = () => {
  const { leagueData, updateLeagueData, isWeekLocked, isDataLoaded } = useLeagueData();
  const [selectedWeek, setSelectedWeek] = useState(1);

  // Update selected week when data loads (only on initial load, not on manual navigation)
  const [hasInitialized, setHasInitialized] = useState(false);
  const [hasManuallyNavigated, setHasManuallyNavigated] = useState(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMatchup, setSelectedMatchup] = useState<{
    week: number;
    team1: string;
    team2: string;
    team1Score: number;
    team2Score: number;
    team1Breakdown: Array<{ qb: string; breakdown: any }>;
    team2Breakdown: Array<{ qb: string; breakdown: any }>;
  } | null>(null);

  // Tooltip hover state
  const [hoveredCell, setHoveredCell] = useState<{
    teamName: string;
    week: number;
    rect: DOMRect;
  } | null>(null);
  
  useEffect(() => {
    // Wait for data to be loaded before initializing week
    if (!isDataLoaded) return;
    
    if (leagueData.matchups && leagueData.matchups.length > 0 && !hasInitialized) {
      const currentWeekMatchups = leagueData.matchups.filter(m => m.week === leagueData.currentWeek);
      const newSelectedWeek = currentWeekMatchups.length > 0 ? leagueData.currentWeek : Math.max(1, leagueData.currentWeek - 1);
      
      console.log(`🔄 Initial data load - setting selected week to ${newSelectedWeek}`);
      setSelectedWeek(newSelectedWeek);
      setHasInitialized(true);
    }
  }, [isDataLoaded, leagueData.matchups, leagueData.currentWeek, hasInitialized]);

  // Auto-switch to current week when matchups become available (only if user hasn't manually navigated)
  useEffect(() => {
    // Wait for data to be loaded
    if (!isDataLoaded) return;
    
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
    const hasCurrentWeekData = true; // Always true now that we're using Supabase
    const isOnPreviousWeek = selectedWeek === leagueData.currentWeek - 1;
    const hasCurrentWeekMatchups = currentWeekMatchups.length > 0;
    
    if (hasCurrentWeekMatchups && isOnPreviousWeek && hasCurrentWeekData && !hasManuallyNavigated) {
      // Current week matchups are now available, switch to showing them
      console.log(`🔄 Auto-switching to Week ${leagueData.currentWeek} - matchups are now available`);
      setSelectedWeek(leagueData.currentWeek);
    }
  }, [isDataLoaded, leagueData.matchups, leagueData.currentWeek, selectedWeek, hasInitialized, hasManuallyNavigated]);

  // Get matchups for selected week
  const weekMatchups = leagueData.matchups.filter(m => m.week === selectedWeek);
  
  // Get lineups for selected week
  const weekLineups = leagueData.lineups.filter(l => l.week === selectedWeek);

  // Calculate standings using the centralized utility
  const [standings, setStandings] = useState<any[]>([]);
  const [weeklyResults, setWeeklyResults] = useState<{ [teamName: string]: string[] }>({});
  const [loading, setLoading] = useState(true);
  const [matchupScores, setMatchupScores] = useState<{ [key: string]: any }>({});
  const [teamRecords, setTeamRecords] = useState<{ [teamName: string]: string }>({});
  const [teamWeekResults, setTeamWeekResults] = useState<{ [key: string]: any }>({});
  const [teamWeekMatchupDetails, setTeamWeekMatchupDetails] = useState<{ [key: string]: any }>({});

  // Debug logging for data loading flow
  useEffect(() => {
    console.log('🏠 Home component state:', {
      isDataLoaded,
      teamsCount: leagueData.teams.length,
      matchupsCount: leagueData.matchups.length,
      lineupsCount: leagueData.lineups.length,
      selectedWeek,
      currentWeek: leagueData.currentWeek
    });
  }, [isDataLoaded, leagueData.teams.length, leagueData.matchups.length, leagueData.lineups.length, selectedWeek, leagueData.currentWeek]);

  // Calculate standings and weekly results when data changes
  useEffect(() => {
    const calculateData = async () => {
      // Don't run calculations until data is loaded
      if (!isDataLoaded) {
        console.log('⏳ Waiting for league data to load...');
        return;
      }
      
      // Additional safety check
      if (leagueData.matchups.length === 0 || leagueData.lineups.length === 0 || leagueData.teams.length === 0) {
        console.log('⚠️ League data is loaded but empty');
        return;
      }
      
      setLoading(true);
      try {
        // Calculate standings and weekly results
        const [standingsData, weeklyResultsData] = await Promise.all([
          calculateStandingsFromSupabase(leagueData.matchups, leagueData.lineups, leagueData.teams),
          calculateWeeklyResultsFromSupabase(leagueData.matchups, leagueData.lineups, leagueData.teams)
        ]);
        setStandings(standingsData);
        setWeeklyResults(weeklyResultsData);

        // Calculate matchup scores for selected week
        const matchupScoresData: { [key: string]: any } = {};
        for (const matchup of weekMatchups) {
          const key = `${matchup.team1}-${matchup.team2}-${matchup.week}`;
          try {
            matchupScoresData[key] = await calculateMatchupScoreFromSupabase(matchup, leagueData.lineups);
          } catch (error) {
            console.error(`Error calculating matchup score for ${key}:`, error);
          }
        }
        setMatchupScores(matchupScoresData);

        // Calculate team records
        const teamRecordsData: { [teamName: string]: string } = {};
        for (const team of leagueData.teams) {
          try {
            teamRecordsData[team.name] = await getCurrentRecordFromSupabase(team.name, leagueData.matchups, leagueData.lineups);
          } catch (error) {
            console.error(`Error calculating record for ${team.name}:`, error);
            teamRecordsData[team.name] = '0-0';
          }
        }
        setTeamRecords(teamRecordsData);

        // Calculate team week results and matchup details (only for weeks that have matchups)
        const teamWeekResultsData: { [key: string]: any } = {};
        const teamWeekMatchupDetailsData: { [key: string]: any } = {};
        
        // Get all unique weeks that have matchups
        const weeksWithMatchups = [...new Set(leagueData.matchups.map(m => m.week))];
        
        for (const team of leagueData.teams) {
          for (const week of weeksWithMatchups) {
            const key = `${team.name}-${week}`;
            try {
              const [result, matchupDetails] = await Promise.all([
                getTeamWeekResultFromSupabase(team.name, week, leagueData.matchups, leagueData.lineups),
                getTeamWeekMatchupDetailsFromSupabase(team.name, week, leagueData.matchups, leagueData.lineups)
              ]);
              teamWeekResultsData[key] = result;
              teamWeekMatchupDetailsData[key] = matchupDetails;
            } catch (error) {
              console.error(`Error calculating week data for ${team.name} week ${week}:`, error);
              teamWeekResultsData[key] = null;
              teamWeekMatchupDetailsData[key] = null;
            }
          }
        }
        setTeamWeekResults(teamWeekResultsData);
        setTeamWeekMatchupDetails(teamWeekMatchupDetailsData);

      } catch (error) {
        console.error('Error calculating standings:', error);
        setStandings([]);
        setWeeklyResults({});
      } finally {
        setLoading(false);
      }
    };

    calculateData();
  }, [isDataLoaded, leagueData.matchups, leagueData.lineups, leagueData.teams, selectedWeek, weekMatchups.length]);


  // Modal helper functions
  const openMatchupModal = async (matchup: any, week: number) => {
    try {
      const { team1Score, team2Score, team1Breakdown, team2Breakdown } = await calculateMatchupScoreFromSupabase(matchup, leagueData.lineups);
      setSelectedMatchup({
        week,
        team1: matchup.team1,
        team2: matchup.team2,
        team1Score,
        team2Score,
        team1Breakdown,
        team2Breakdown
      });
      setIsModalOpen(true);
    } catch (error) {
      console.error('Error calculating matchup score:', error);
    }
  };

  const openWLTModal = async (teamName: string, week: number) => {
    try {
      const matchupDetails = await getTeamWeekMatchupDetailsFromSupabase(teamName, week, leagueData.matchups, leagueData.lineups);
      if (!matchupDetails) return;

      const matchup = leagueData.matchups.find(m => 
        m.week === week && 
        (m.team1 === teamName || m.team2 === teamName)
      );
      if (!matchup) return;

      await openMatchupModal(matchup, week);
    } catch (error) {
      console.error('Error opening WLT modal:', error);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedMatchup(null);
  };

  // Position calculation for portal tooltip
  const calculateTooltipPosition = (rect: DOMRect, isNearBottom: boolean) => {
    const tooltipWidth = 200; // Approximate tooltip width
    const tooltipHeight = 100; // Approximate tooltip height
    const margin = 8; // Margin from the square
    
    let top: number;
    let left: number;
    
    // Calculate horizontal position (center on the square)
    left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    
    // Ensure tooltip doesn't go off screen horizontally
    if (left < margin) {
      left = margin;
    } else if (left + tooltipWidth > window.innerWidth - margin) {
      left = window.innerWidth - tooltipWidth - margin;
    }
    
    // Calculate vertical position
    if (isNearBottom) {
      // Show above the square
      top = rect.top - tooltipHeight - margin;
    } else {
      // Show below the square
      top = rect.bottom + margin;
    }
    
    return { top, left };
  };

  // W/L/T Chart functions
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  const teams = leagueData.teams.map(team => team.name);


  return (
    <div className="space-y-6">
      {/* Week Navigation */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] h-[74px] px-8 flex items-center">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink">
            <h2 className="text-xl sm:text-2xl font-black text-slate-50 tracking-tight truncate">Week {selectedWeek}</h2>
            {selectedWeek === leagueData.currentWeek ? (
              <span className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                Current Week
              </span>
            ) : (
              <button
                onClick={() => {
                  setSelectedWeek(leagueData.currentWeek);
                  setHasManuallyNavigated(false); // Reset manual navigation flag
                }}
                className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 rounded-lg transition-all duration-200 text-xs font-bold uppercase tracking-wider whitespace-nowrap"
              >
                Go to Current Week
              </button>
            )}
          </div>
          <div className="flex gap-2 sm:gap-3 flex-shrink-0">
            <button
              onClick={() => {
                setSelectedWeek(Math.max(1, selectedWeek - 1));
                setHasManuallyNavigated(true);
              }}
              className="px-3 sm:px-4 py-2 bg-slate-800/90 hover:bg-slate-700/50 text-slate-200 rounded-lg transition-all duration-200 font-medium text-sm sm:text-base whitespace-nowrap"
            >
              Previous
            </button>
            <button
              onClick={() => {
                setSelectedWeek(Math.min(18, selectedWeek + 1));
                setHasManuallyNavigated(true);
              }}
              className="px-3 sm:px-4 py-2 bg-slate-800/90 hover:bg-slate-700/50 text-slate-200 rounded-lg transition-all duration-200 font-medium text-sm sm:text-base whitespace-nowrap"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Show loading state while data loads */}
      {!isDataLoaded && (
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <p className="text-slate-400">Loading league data...</p>
          </div>
        </div>
      )}

      {/* Matchups - Top row with 4 columns */}
      {isDataLoaded && (
        <div className="space-y-6">
        {weekMatchups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 xl:gap-6">
            {weekMatchups.map((matchup, index) => {
              const key = `${matchup.team1}-${matchup.team2}-${matchup.week}`;
              const matchupData = matchupScores[key];
              const team1Score = matchupData?.team1Score || 0;
              const team2Score = matchupData?.team2Score || 0;
              const team1Breakdown = matchupData?.team1Breakdown || [];
              const team2Breakdown = matchupData?.team2Breakdown || [];
              const hasData = !!matchupData && 
                team1Breakdown.length > 0 && 
                team1Breakdown.some((item: any) => item.breakdown !== null && item.breakdown !== undefined) &&
                team2Breakdown.length > 0 && 
                team2Breakdown.some((item: any) => item.breakdown !== null && item.breakdown !== undefined);
              
              return (
                <div 
                  key={index} 
                  className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-5 lg:p-4 xl:p-6 cursor-pointer hover:bg-slate-700/20 hover:shadow-[0_15px_40px_-10px_rgba(0,0,0,0.6)] hover:scale-[1.02] transition-all duration-200"
                  onClick={() => openMatchupModal(matchup, selectedWeek)}
                >
                  {/* Row 1: Player Names */}
                  <div className="flex items-center justify-center mb-3 lg:mb-2 xl:mb-4">
                    <TeamLogo teamName={matchup.team1} size="md" showName={true} className="lg:text-xs xl:text-sm" />
                    <div className="mx-4 lg:mx-3 xl:mx-6 text-slate-400 text-base lg:text-sm xl:text-lg font-bold tracking-tight">VS</div>
                    <TeamLogo teamName={matchup.team2} size="md" showName={true} className="lg:text-xs xl:text-sm" />
                  </div>

                  {/* Row 2: Subtotal Scores */}
                  <div className="flex items-center justify-around mb-3 lg:mb-2 xl:mb-4">
                    {/* Team 1 Subtotal */}
                    <div className={`text-xl lg:text-lg xl:text-2xl font-black text-center tabular-nums ${
                      hasData && team1Score > team2Score ? 'text-emerald-400' : 
                      hasData && team1Score < team2Score ? 'text-rose-400' : 'text-slate-200'
                    } ${hasData && team1Score < 0 ? 'text-rose-400' : ''}`}>{team1Score}</div>
                    
                    {/* Team 2 Subtotal */}
                    <div className={`text-xl lg:text-lg xl:text-2xl font-black text-center tabular-nums ${
                      hasData && team2Score > team1Score ? 'text-emerald-400' : 
                      hasData && team2Score < team1Score ? 'text-rose-400' : 'text-slate-200'
                    } ${hasData && team2Score < 0 ? 'text-rose-400' : ''}`}>{team2Score}</div>
                  </div>

                  {/* Row 3: Team QB cards - Centered flow with divider */}
                  <div className="flex items-center justify-around mb-4 lg:mb-3 xl:mb-6">
                    {/* P1 Teams */}
                    <div className="flex items-center gap-3 lg:gap-2 xl:gap-4">
                      {hasData ? (
                        team1Breakdown.map(({ qb, breakdown }: { qb: string; breakdown: any }, index: number) => (
                          <div 
                            key={qb} 
                            className="w-14 h-14 lg:w-11 lg:h-11 xl:w-16 xl:h-16 bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/30 flex flex-col items-center justify-center cursor-help hover:bg-slate-700/20 transition-colors duration-150 relative group"
                            title={breakdown ? `${qb} - ${breakdown.finalScore} points` : `${qb} - No data`}
                          >
                            <TeamLogo teamName={qb} size="sm" className="mb-1 lg:mb-0 xl:mb-1" />
                            <span className={`text-xs lg:text-[10px] xl:text-xs font-bold tabular-nums ${
                              breakdown && breakdown.finalScore > 0 ? 'text-emerald-400' : 
                              breakdown && breakdown.finalScore < 0 ? 'text-rose-400' : 'text-slate-400'
                            }`}>{breakdown ? breakdown.finalScore : '--'}</span>
                            
                            {/* Enhanced tooltip with scoring breakdown */}
                            <div 
                              className="absolute left-1/2 transform -translate-x-1/2 hidden group-hover:block z-50 tooltip-container"
                              onMouseEnter={(e) => {
                                const tooltip = e.currentTarget;
                                const rect = tooltip.getBoundingClientRect();
                                
                                // Check if tooltip would be cut off at top
                                if (rect.top < 100) {
                                  tooltip.setAttribute('data-position', 'below');
                                } else {
                                  tooltip.setAttribute('data-position', 'above');
                                }
                              }}
                            >
                              <div className="bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg border border-gray-600 min-w-max">
                                <div className="font-semibold mb-2">{qb} - {breakdown ? breakdown.finalScore : 0} pts</div>
                                <div className="space-y-1">
                                  {breakdown ? (() => {
                                    // Convert QBPerformance to QBStats format for dynamic calculation
                                    const qbStats = {
                                      passYards: breakdown.passYards,
                                      touchdowns: breakdown.touchdowns,
                                      completionPercent: breakdown.completionPercent,
                                      turnovers: breakdown.turnovers,
                                      events: breakdown.events,
                                      longestPlay: breakdown.longestPlay,
                                      interceptions: breakdown.interceptions,
                                      fumbles: breakdown.fumbles,
                                      rushYards: breakdown.rushYards
                                    };
                                    const scoringBreakdown = getDetailedScoringBreakdown(qbStats);
                                    
                                    return (
                                      <>
                                        <div className="whitespace-nowrap">Pass Yards: {breakdown.passYards} → {scoringBreakdown.passYards} pts</div>
                                        <div className="whitespace-nowrap">Touchdowns: {breakdown.touchdowns} → {scoringBreakdown.touchdowns} pts</div>
                                        <div className="whitespace-nowrap">Completion %: {breakdown.completionPercent}% → {scoringBreakdown.completionPercent} pts</div>
                                        <div className="whitespace-nowrap">Turnovers: {breakdown.interceptions + breakdown.fumbles} → {scoringBreakdown.turnovers} pts</div>
                                        <div className="whitespace-nowrap">Interceptions: {breakdown.interceptions} → {scoringBreakdown.interceptions} pts</div>
                                        <div className="whitespace-nowrap">Fumbles: {breakdown.fumbles} → {scoringBreakdown.fumbles} pts</div>
                                        <div className="whitespace-nowrap">Longest Play: {breakdown.longestPlay} → {scoringBreakdown.longestPlay} pts</div>
                                        <div className="whitespace-nowrap">Rush Yards: {breakdown.rushYards} → {scoringBreakdown.rushYards} pts</div>
                                        <div className="whitespace-nowrap">Def TD: {breakdown.defensiveTD} → {breakdown.defensiveTD * 20} pts</div>
                                        <div className="whitespace-nowrap">Safety: {breakdown.safety} → {breakdown.safety * 15} pts</div>
                                        <div className="whitespace-nowrap">GEF: {breakdown.gameEndingFumble} → {breakdown.gameEndingFumble * 50} pts</div>
                                        <div className="whitespace-nowrap">GWD: {breakdown.gameWinningDrive} → {breakdown.gameWinningDrive * -12} pts</div>
                                        <div className="whitespace-nowrap">Benching: {breakdown.benching} → {breakdown.benching * 35} pts</div>
                                        <div className="border-t border-gray-600 pt-1 mt-2">
                                          <div className="font-semibold">Final: {breakdown.finalScore} pts</div>
                                        </div>
                                      </>
                                    );
                                  })() : (
                                    <div className="text-gray-400">No scoring data available</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : team1Breakdown.length > 0 ? (
                        // Show actual QB logos when lineups are set but no CSV data
                        team1Breakdown.map(({ qb }: { qb: string }, index: number) => (
                          <div 
                            key={index}
                            className="w-14 h-14 lg:w-11 lg:h-11 xl:w-16 xl:h-16 bg-slate-800/40 backdrop-blur-sm rounded-lg border-2 border-dashed border-slate-600/50 flex flex-col items-center justify-center"
                            title="Scores not available yet"
                          >
                            <TeamLogo teamName={qb} size="sm" className="mb-1 lg:mb-0 xl:mb-1" />
                            <span className="text-xs lg:text-[10px] xl:text-xs text-slate-500">--</span>
                          </div>
                        ))
                      ) : (
                        // Show empty placeholder squares when no lineups are set (2 QBs for P1)
                        [1, 2].map((_, index) => (
                          <div 
                            key={index}
                            className="w-14 h-14 lg:w-11 lg:h-11 xl:w-16 xl:h-16 bg-gray-600 rounded flex flex-col items-center justify-center border-2 border-dashed border-gray-500"
                            title="Lineup not set yet"
                          >
                            <div className="text-gray-400 text-xs lg:text-[10px] xl:text-xs">?</div>
                            <span className="text-xs lg:text-[10px] xl:text-xs text-gray-400">--</span>
                          </div>
                        ))
                      )}
                    </div>
                    
                    {/* Divider between P1 and P2 teams */}
                    <div className="w-px h-12 lg:h-10 xl:h-12 bg-slate-700/50 mx-2"></div>
                    
                    {/* P2 Teams */}
                    <div className="flex items-center gap-3 lg:gap-2 xl:gap-4">
                      {hasData ? (
                        team2Breakdown.map(({ qb, breakdown }: { qb: string; breakdown: any }) => (
                          <div 
                            key={qb} 
                            className="w-14 h-14 lg:w-11 lg:h-11 xl:w-16 xl:h-16 bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/30 flex flex-col items-center justify-center cursor-help hover:bg-slate-700/20 transition-colors duration-150 relative group"
                            title={breakdown ? `${qb} - ${breakdown.finalScore} points` : `${qb} - No data`}
                          >
                            <TeamLogo teamName={qb} size="sm" className="mb-1 lg:mb-0 xl:mb-1" />
                            <span className={`text-xs lg:text-[10px] xl:text-xs font-bold tabular-nums ${
                              breakdown && breakdown.finalScore > 0 ? 'text-emerald-400' : 
                              breakdown && breakdown.finalScore < 0 ? 'text-rose-400' : 'text-slate-400'
                            }`}>{breakdown ? breakdown.finalScore : '--'}</span>
                            
                            {/* Enhanced tooltip with scoring breakdown */}
                            <div 
                              className="absolute left-1/2 transform -translate-x-1/2 hidden group-hover:block z-50 tooltip-container"
                              onMouseEnter={(e) => {
                                const tooltip = e.currentTarget;
                                const rect = tooltip.getBoundingClientRect();
                                
                                // Check if tooltip would be cut off at top
                                if (rect.top < 100) {
                                  tooltip.setAttribute('data-position', 'below');
                                } else {
                                  tooltip.setAttribute('data-position', 'above');
                                }
                              }}
                            >
                              <div className="bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg border border-gray-600 min-w-max">
                                <div className="font-semibold mb-2">{qb} - {breakdown ? breakdown.finalScore : 0} pts</div>
                                <div className="space-y-1">
                                  {breakdown ? (() => {
                                    // Convert QBPerformance to QBStats format for dynamic calculation
                                    const qbStats = {
                                      passYards: breakdown.passYards,
                                      touchdowns: breakdown.touchdowns,
                                      completionPercent: breakdown.completionPercent,
                                      turnovers: breakdown.turnovers,
                                      events: breakdown.events,
                                      longestPlay: breakdown.longestPlay,
                                      interceptions: breakdown.interceptions,
                                      fumbles: breakdown.fumbles,
                                      rushYards: breakdown.rushYards
                                    };
                                    const scoringBreakdown = getDetailedScoringBreakdown(qbStats);
                                    
                                    return (
                                      <>
                                        <div className="whitespace-nowrap">Pass Yards: {breakdown.passYards} → {scoringBreakdown.passYards} pts</div>
                                        <div className="whitespace-nowrap">Touchdowns: {breakdown.touchdowns} → {scoringBreakdown.touchdowns} pts</div>
                                        <div className="whitespace-nowrap">Completion %: {breakdown.completionPercent}% → {scoringBreakdown.completionPercent} pts</div>
                                        <div className="whitespace-nowrap">Turnovers: {breakdown.interceptions + breakdown.fumbles} → {scoringBreakdown.turnovers} pts</div>
                                        <div className="whitespace-nowrap">Interceptions: {breakdown.interceptions} → {scoringBreakdown.interceptions} pts</div>
                                        <div className="whitespace-nowrap">Fumbles: {breakdown.fumbles} → {scoringBreakdown.fumbles} pts</div>
                                        <div className="whitespace-nowrap">Longest Play: {breakdown.longestPlay} → {scoringBreakdown.longestPlay} pts</div>
                                        <div className="whitespace-nowrap">Rush Yards: {breakdown.rushYards} → {scoringBreakdown.rushYards} pts</div>
                                        <div className="whitespace-nowrap">Def TD: {breakdown.defensiveTD} → {breakdown.defensiveTD * 20} pts</div>
                                        <div className="whitespace-nowrap">Safety: {breakdown.safety} → {breakdown.safety * 15} pts</div>
                                        <div className="whitespace-nowrap">GEF: {breakdown.gameEndingFumble} → {breakdown.gameEndingFumble * 50} pts</div>
                                        <div className="whitespace-nowrap">GWD: {breakdown.gameWinningDrive} → {breakdown.gameWinningDrive * -12} pts</div>
                                        <div className="whitespace-nowrap">Benching: {breakdown.benching} → {breakdown.benching * 35} pts</div>
                                        <div className="border-t border-gray-600 pt-1 mt-2">
                                          <div className="font-semibold">Final: {breakdown.finalScore} pts</div>
                                        </div>
                                      </>
                                    );
                                  })() : (
                                    <div className="text-gray-400">No scoring data available</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : team2Breakdown.length > 0 ? (
                        // Show actual QB logos when lineups are set but no CSV data
                        team2Breakdown.map(({ qb }: { qb: string }, index: number) => (
                          <div 
                            key={index}
                            className="w-14 h-14 lg:w-11 lg:h-11 xl:w-16 xl:h-16 bg-slate-800/40 backdrop-blur-sm rounded-lg border-2 border-dashed border-slate-600/50 flex flex-col items-center justify-center"
                            title="Scores not available yet"
                          >
                            <TeamLogo teamName={qb} size="sm" className="mb-1 lg:mb-0 xl:mb-1" />
                            <span className="text-xs lg:text-[10px] xl:text-xs text-slate-500">--</span>
                          </div>
                        ))
                      ) : (
                        // Show empty placeholder squares when no lineups are set (2 QBs for P2)
                        [1, 2].map((_, index) => (
                          <div 
                            key={index}
                            className="w-14 h-14 lg:w-11 lg:h-11 xl:w-16 xl:h-16 bg-gray-600 rounded flex flex-col items-center justify-center border-2 border-dashed border-gray-500"
                            title="Lineup not set yet"
                          >
                            <div className="text-gray-400 text-xs lg:text-[10px] xl:text-xs">?</div>
                            <span className="text-xs lg:text-[10px] xl:text-xs text-gray-400">--</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Row 4: Winner - Centered */}
                  {hasData && team1Score !== team2Score && (
                    <div className="flex items-center justify-center">
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 lg:px-2 lg:py-1 xl:px-4 xl:py-2 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 text-xs lg:text-[10px] xl:text-sm font-bold uppercase tracking-wider">
                        Winner: {team1Score > team2Score ? matchup.team1 : matchup.team2}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-8 text-center text-slate-400">
            {weekMatchups.length === 0 
              ? `No matchups scheduled for Week ${selectedWeek}`
              : "No lineups set yet for this week"
            }
          </div>
        )}
        </div>
      )}

      {/* Bottom row - League Standings and W/L/T Chart side by side */}
      {isDataLoaded && (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:gap-8">
        {/* League Standings - Left side (1/3 width) */}
        <div className="space-y-6">
          <h3 className="text-xl font-black text-slate-50 tracking-tight">League Standings</h3>
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                  <tr>
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Rank</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Team</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Record</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {standings.map((team, index) => (
                    <tr key={team.teamName} className={`hover:bg-slate-700/20 transition-colors duration-150 ${
                      index % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'
                    }`}>
                      <td className="px-4 py-4 text-sm font-bold text-slate-200 tabular-nums">{index + 1}</td>
                      <td className="px-4 py-4 text-sm font-medium text-slate-200">
                        <TeamLogo teamName={team.teamName} size="sm" showName={true} />
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-300 tabular-nums">{team.wins}-{team.losses}</td>
                      <td className="px-4 py-4 text-sm font-bold text-emerald-400 tabular-nums">{team.totalPoints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Season W/L/T Chart - Right side (2/3 width) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black text-slate-50 tracking-tight">Season W/L/T Chart</h3>
            {/* Legend */}
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-emerald-500 rounded-lg"></div>
                <span className="text-slate-300 font-medium">Win</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-rose-500 rounded-lg"></div>
                <span className="text-slate-300 font-medium">Loss</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded-lg"></div>
                <span className="text-slate-300 font-medium">Tie</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead className="bg-gradient-to-r from-slate-800 to-slate-800/80">
                  <tr>
                    <th className="px-3 py-3 lg:px-2 lg:py-2 xl:px-4 xl:py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-32 sticky left-0 bg-slate-800/95 backdrop-blur-sm z-10">Team</th>
                    {weeks.map(week => (
                      <th key={week} className="px-2 py-3 lg:px-1 lg:py-2 xl:px-2 xl:py-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider w-8">
                        {week}
                      </th>
                    ))}
                    <th className="px-4 py-3 lg:px-2 lg:py-2 xl:px-4 xl:py-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider w-16">Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {teams.map((teamName, teamIndex) => {
                    const record = teamRecords[teamName] || '0-0';
                    return (
                      <tr key={teamName} className={`hover:bg-slate-700/20 transition-colors duration-150 ${
                        teamIndex % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-800/40'
                      }`}>
                        <td className="px-3 py-3 lg:px-2 lg:py-2 xl:px-4 xl:py-4 text-sm font-medium text-slate-200 sticky left-0 bg-slate-800/95 backdrop-blur-sm z-10">
                          <TeamLogo teamName={teamName} size="sm" showName={true} className="lg:text-xs xl:text-sm" />
                        </td>
                        {weeks.map((week, weekIndex) => {
                          const key = `${teamName}-${week}`;
                          const result = teamWeekResults[key];
                          const matchupDetails = teamWeekMatchupDetails[key];
                          const isNearBottom = teamIndex >= teams.length - 3; // Last 3 rows show tooltip above
                          return (
                            <td key={week} className="px-2 py-3 lg:py-2 xl:py-4 text-center">
                              {result && (
                                <div 
                                  className={`w-7 h-7 lg:w-6 lg:h-6 xl:w-7 xl:h-7 rounded-lg flex items-center justify-center text-xs font-bold mx-auto cursor-pointer hover:ring-2 hover:ring-blue-400 hover:scale-110 transition-all duration-200 ${
                                    result === 'W' 
                                      ? 'bg-emerald-500 text-white hover:bg-emerald-400' 
                                      : result === 'L' 
                                      ? 'bg-rose-500 text-white hover:bg-rose-400' 
                                      : 'bg-yellow-500 text-black hover:bg-yellow-400'
                                  }`}
                                  onClick={() => openWLTModal(teamName, week)}
                                  onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredCell({ teamName, week, rect });
                                  }}
                                  onMouseLeave={() => setHoveredCell(null)}
                                >
                                  {result}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 lg:py-2 xl:py-4 text-center text-sm font-bold text-emerald-400 tabular-nums">{record}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Matchup Modal */}
      <MatchupModal 
        isOpen={isModalOpen}
        onClose={closeModal}
        matchupData={selectedMatchup}
      />

      {/* Portal Tooltip */}
      {hoveredCell && (() => {
        const key = `${hoveredCell.teamName}-${hoveredCell.week}`;
        const matchupDetails = teamWeekMatchupDetails[key];
        if (!matchupDetails) return null;
        
        const teamIndex = teams.indexOf(hoveredCell.teamName);
        const isNearBottom = teamIndex >= teams.length - 3;
        const position = calculateTooltipPosition(hoveredCell.rect, isNearBottom);
        
        return createPortal(
          <div 
            key={`tooltip-${hoveredCell.teamName}-${hoveredCell.week}`}
            className="fixed z-40 pointer-events-none"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
            }}
          >
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50 text-xs rounded-2xl p-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] border border-slate-700/50 backdrop-blur-xl">
              <div className="flex items-center gap-6">
                {/* Hovered team (always left side) */}
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-2">
                    <TeamLogo teamName={hoveredCell.teamName} size="sm" />
                  </div>
                  <div className="flex gap-1 mb-2">
                    {matchupDetails.teamQBs.map((qb: string) => (
                      <div key={qb} className="w-5 h-5">
                        <TeamLogo teamName={qb} size="xs" />
                      </div>
                    ))}
                  </div>
                  <div className={`font-black text-lg tabular-nums ${
                    matchupDetails.teamScore > matchupDetails.opponentScore 
                      ? 'text-emerald-400' 
                      : matchupDetails.teamScore < matchupDetails.opponentScore 
                      ? 'text-rose-400' 
                      : 'text-slate-200'
                  }`}>
                    {matchupDetails.teamScore}
                  </div>
                </div>
                
                {/* Opponent (always right side) */}
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-2">
                    <TeamLogo teamName={matchupDetails.opponent} size="sm" />
                  </div>
                  <div className="flex gap-1 mb-2">
                    {matchupDetails.opponentQBs.map((qb: string) => (
                      <div key={qb} className="w-5 h-5">
                        <TeamLogo teamName={qb} size="xs" />
                      </div>
                    ))}
                  </div>
                  <div className={`font-black text-lg tabular-nums ${
                    matchupDetails.opponentScore > matchupDetails.teamScore 
                      ? 'text-emerald-400' 
                      : matchupDetails.opponentScore < matchupDetails.teamScore 
                      ? 'text-rose-400' 
                      : 'text-slate-200'
                  }`}>
                    {matchupDetails.opponentScore}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
};

export default Home;
