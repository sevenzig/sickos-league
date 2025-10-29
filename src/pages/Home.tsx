import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

// Memoized MatchupCard component to prevent unnecessary re-renders
const MatchupCard = React.memo(({
  matchup,
  matchupData,
  selectedWeek,
  leagueData,
  isWeekLocked,
  openMatchupModal
}: {
  matchup: any;
  matchupData: any;
  selectedWeek: number;
  leagueData: any;
  isWeekLocked: (week: number) => boolean;
  openMatchupModal: (matchup: any, week: number) => void;
}) => {
  const team1Score = matchupData?.team1Score || 0;
  const team2Score = matchupData?.team2Score || 0;
  const team1Breakdown = matchupData?.team1Breakdown || [];
  const team2Breakdown = matchupData?.team2Breakdown || [];
  const hasData = !!matchupData &&
    (team1Breakdown.length > 0 || team2Breakdown.length > 0) &&
    (team1Breakdown.some((item: any) => item.breakdown !== null && item.breakdown !== undefined) ||
     team2Breakdown.some((item: any) => item.breakdown !== null && item.breakdown !== undefined));

  // Determine winner/loser
  const team1Wins = hasData && team1Score > team2Score;
  const team2Wins = hasData && team2Score > team1Score;
  const isTie = hasData && team1Score === team2Score;

  // Check if week is final (locked or past current week)
  const isWeekFinal = selectedWeek < leagueData.currentWeek || isWeekLocked(selectedWeek);

  const handleClick = React.useCallback(() => {
    openMatchupModal(matchup, selectedWeek);
  }, [matchup, selectedWeek, openMatchupModal]);

  return (
    <div
      className="bg-gradient-to-br from-[#1a2942] to-[#0f1d31] rounded-2xl border border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden cursor-pointer hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)] hover:scale-[1.02] transition-all duration-200"
      onClick={handleClick}
    >
      {/* TOP BAR */}
      <div className="bg-black/30 px-5 py-2.5 flex justify-between items-center">
        <div className="text-[#64748b] text-[11px] uppercase tracking-[1px] font-semibold">
          Week {matchup.week}
        </div>
        {isWeekFinal && (
          <div className="bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.5px]">
            Final
          </div>
        )}
      </div>

      {/* SCORE STRIP */}
      <div className="flex bg-black/20">
        {/* Team 1 Score Half */}
        <div className={`flex-1 px-5 py-6 text-center relative ${
          hasData && team2Wins ? 'bg-gradient-to-b from-rose-500/15 to-rose-500/8 border-t-2 border-rose-500/30' :
          hasData && team1Wins ? 'bg-gradient-to-b from-emerald-500/15 to-emerald-500/7 border-t-2 border-emerald-500/35' :
          'bg-gradient-to-b from-slate-800/20 to-slate-800/10 border-t-2 border-slate-700/20'
        }`}>
          {team1Wins && (
            <div className="absolute top-2 right-2 text-xl">🏆</div>
          )}
          <div className="text-slate-200 text-sm font-semibold mb-1">{matchup.team1}</div>
          <div className={`text-6xl font-black leading-none mb-3 tabular-nums ${
            hasData && team1Score < 0 ? 'text-rose-400' :
            hasData && team1Score > 0 ? 'text-emerald-400' :
            'text-slate-200'
          }`}>{team1Score}</div>
        </div>

        {/* Center Divider */}
        <div className="w-px bg-white/10"></div>

        {/* Team 2 Score Half */}
        <div className={`flex-1 px-5 py-6 text-center relative ${
          hasData && team1Wins ? 'bg-gradient-to-b from-rose-500/15 to-rose-500/8 border-t-2 border-rose-500/30' :
          hasData && team2Wins ? 'bg-gradient-to-b from-emerald-500/15 to-emerald-500/7 border-t-2 border-emerald-500/35' :
          'bg-gradient-to-b from-slate-800/20 to-slate-800/10 border-t-2 border-slate-700/20'
        }`}>
          {team2Wins && (
            <div className="absolute top-2 right-2 text-xl">🏆</div>
          )}
          <div className="text-slate-200 text-sm font-semibold mb-1">{matchup.team2}</div>
          <div className={`text-6xl font-black leading-none mb-3 tabular-nums ${
            hasData && team2Score < 0 ? 'text-rose-400' :
            hasData && team2Score > 0 ? 'text-emerald-400' :
            'text-slate-200'
          }`}>{team2Score}</div>
        </div>
      </div>

      {/* BOTTOM SECTION */}
      <div className="flex relative py-6">
        {/* Bottom Divider */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>

        {/* VS Badge */}
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#1a2942] text-[#64748b] px-3.5 py-1.5 rounded-lg text-xs font-bold z-10 border border-white/10">
          VS
        </div>

        {/* Team 1 Side */}
        <div
          className="flex-1 px-6 flex flex-col items-center gap-4 relative"
          style={team1Wins ? { background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.06) 0%, transparent 70%)' } : undefined}
        >
          <div className="flex gap-4 items-center">
            {hasData ? (
              team1Breakdown.map(({ qb, breakdown }: { qb: string; breakdown: any }, idx: number) => (
                <div key={qb} className="flex flex-col items-center gap-1.5 relative group">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-lg flex items-center justify-center overflow-hidden p-1.5">
                    <TeamLogo teamName={qb} size="xs" className="w-10 h-10 md:w-12 md:h-12" />
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${
                    breakdown && breakdown.finalScore > 0 ? 'text-emerald-400' :
                    breakdown && breakdown.finalScore < 0 ? 'text-rose-400' :
                    'text-slate-400'
                  }`}>
                    {breakdown ? breakdown.finalScore : '--'}
                  </div>
                </div>
              ))
            ) : team1Breakdown.length > 0 ? (
              team1Breakdown.map(({ qb }: { qb: string }, idx: number) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-lg border-2 border-dashed border-slate-600/50 flex items-center justify-center overflow-hidden p-1.5">
                    <TeamLogo teamName={qb} size="xs" className="w-10 h-10 md:w-12 md:h-12" />
                  </div>
                  <div className="text-xs text-slate-500">--</div>
                </div>
              ))
            ) : (
              [1, 2].map((_, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-600 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center">
                    <div className="text-gray-400 text-xs">?</div>
                  </div>
                  <div className="text-xs text-gray-400">--</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Team 2 Side */}
        <div
          className="flex-1 px-6 flex flex-col items-center gap-4 relative"
          style={team2Wins ? { background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.06) 0%, transparent 70%)' } : undefined}
        >
          <div className="flex gap-4 items-center">
            {hasData ? (
              team2Breakdown.map(({ qb, breakdown }: { qb: string; breakdown: any }, idx: number) => (
                <div key={qb} className="flex flex-col items-center gap-1.5 relative group">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-lg flex items-center justify-center overflow-hidden p-1.5">
                    <TeamLogo teamName={qb} size="xs" className="w-10 h-10 md:w-12 md:h-12" />
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${
                    breakdown && breakdown.finalScore > 0 ? 'text-emerald-400' :
                    breakdown && breakdown.finalScore < 0 ? 'text-rose-400' :
                    'text-slate-400'
                  }`}>
                    {breakdown ? breakdown.finalScore : '--'}
                  </div>
                </div>
              ))
            ) : team2Breakdown.length > 0 ? (
              team2Breakdown.map(({ qb }: { qb: string }, idx: number) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-lg border-2 border-dashed border-slate-600/50 flex items-center justify-center overflow-hidden p-1.5">
                    <TeamLogo teamName={qb} size="xs" className="w-10 h-10 md:w-12 md:h-12" />
                  </div>
                  <div className="text-xs text-slate-500">--</div>
                </div>
              ))
            ) : (
              [1, 2].map((_, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-600 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center">
                    <div className="text-gray-400 text-xs">?</div>
                  </div>
                  <div className="text-xs text-gray-400">--</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

MatchupCard.displayName = 'MatchupCard';

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
  
  // Unified week initialization logic
  useEffect(() => {
    // Wait for data to be loaded before initializing week
    if (!isDataLoaded || hasInitialized) return;

    if (leagueData.matchups && leagueData.matchups.length > 0) {
      const currentWeekMatchups = leagueData.matchups.filter(m => m.week === leagueData.currentWeek);
      const newSelectedWeek = currentWeekMatchups.length > 0 ? leagueData.currentWeek : Math.max(1, leagueData.currentWeek - 1);

      console.log(`🔄 Initial data load - setting selected week to ${newSelectedWeek}`);
      setSelectedWeek(newSelectedWeek);
      setHasInitialized(true);
    }
  }, [isDataLoaded, leagueData.matchups, leagueData.currentWeek, hasInitialized]);

  // Auto-switch to current week when matchups become available (only if user hasn't manually navigated)
  useEffect(() => {
    // Wait for data to be loaded and initialization to complete
    if (!isDataLoaded || !hasInitialized || hasManuallyNavigated) return;

    const currentWeekMatchups = leagueData.matchups.filter(m => m.week === leagueData.currentWeek);

    // Only auto-switch if we're on the previous week and current week matchups are now available
    const isOnPreviousWeek = selectedWeek === leagueData.currentWeek - 1;
    const hasCurrentWeekMatchups = currentWeekMatchups.length > 0;

    if (hasCurrentWeekMatchups && isOnPreviousWeek) {
      console.log(`🔄 Auto-switching to Week ${leagueData.currentWeek} - matchups are now available`);
      setSelectedWeek(leagueData.currentWeek);
    }
  }, [isDataLoaded, hasInitialized, leagueData.matchups, leagueData.currentWeek, selectedWeek, hasManuallyNavigated]);

  // Memoize expensive calculations
  const weekMatchups = useMemo(() =>
    leagueData.matchups.filter(m => m.week === selectedWeek),
    [leagueData.matchups, selectedWeek]
  );

  const weekLineups = useMemo(() =>
    leagueData.lineups.filter(l => l.week === selectedWeek),
    [leagueData.lineups, selectedWeek]
  );

  const weeksWithMatchups = useMemo(() =>
    [...new Set(leagueData.matchups.map(m => m.week))],
    [leagueData.matchups]
  );

  const teams = useMemo(() =>
    leagueData.teams.map(team => team.name),
    [leagueData.teams]
  );

  const weeks = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => i + 1),
    []
  );

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

  // Calculate standings and weekly results when data changes (independent of selectedWeek)
  useEffect(() => {
    const calculateGlobalData = async () => {
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
        // Batch all calculations in parallel to avoid blocking the UI
        const [standingsData, weeklyResultsData, ...teamRecordsPromises] = await Promise.all([
          calculateStandingsFromSupabase(leagueData.matchups, leagueData.lineups, leagueData.teams),
          calculateWeeklyResultsFromSupabase(leagueData.matchups, leagueData.lineups, leagueData.teams),
          // Calculate all team records in parallel
          ...leagueData.teams.map(team =>
            getCurrentRecordFromSupabase(team.name, leagueData.matchups, leagueData.lineups)
              .catch(error => {
                console.error(`Error calculating record for ${team.name}:`, error);
                return '0-0';
              })
          )
        ]);

        setStandings(standingsData);
        setWeeklyResults(weeklyResultsData);

        // Build team records object
        const teamRecordsData: { [teamName: string]: string } = {};
        leagueData.teams.forEach((team, index) => {
          teamRecordsData[team.name] = teamRecordsPromises[index];
        });
        setTeamRecords(teamRecordsData);

        // Calculate team week results and matchup details in batches to avoid overwhelming the browser
        const teamWeekResultsData: { [key: string]: any } = {};
        const teamWeekMatchupDetailsData: { [key: string]: any } = {};

        // Process teams in smaller batches to prevent browser freeze
        const BATCH_SIZE = 3; // Process 3 teams at a time
        for (let i = 0; i < leagueData.teams.length; i += BATCH_SIZE) {
          const teamBatch = leagueData.teams.slice(i, i + BATCH_SIZE);

          const batchPromises = teamBatch.flatMap(team =>
            weeksWithMatchups.map(async week => {
              const key = `${team.name}-${week}`;
              try {
                const [result, matchupDetails] = await Promise.all([
                  getTeamWeekResultFromSupabase(team.name, week, leagueData.matchups, leagueData.lineups),
                  getTeamWeekMatchupDetailsFromSupabase(team.name, week, leagueData.matchups, leagueData.lineups)
                ]);
                return { key, result, matchupDetails };
              } catch (error) {
                console.error(`Error calculating week data for ${team.name} week ${week}:`, error);
                return { key, result: null, matchupDetails: null };
              }
            })
          );

          // Process this batch
          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(({ key, result, matchupDetails }) => {
            teamWeekResultsData[key] = result;
            teamWeekMatchupDetailsData[key] = matchupDetails;
          });

          // Small delay between batches to prevent browser freeze
          if (i + BATCH_SIZE < leagueData.teams.length) {
            await new Promise(resolve => setTimeout(resolve, 10));
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

    calculateGlobalData();
  }, [isDataLoaded, leagueData.matchups, leagueData.lineups, leagueData.teams, weeksWithMatchups]);

  // Calculate matchup scores for selected week only
  useEffect(() => {
    const calculateWeekMatchups = async () => {
      if (!isDataLoaded || weekMatchups.length === 0) {
        return;
      }

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
    };

    calculateWeekMatchups();
  }, [isDataLoaded, weekMatchups, leagueData.lineups]);


  // Modal helper functions (memoized to prevent re-renders)
  const openMatchupModal = useCallback(async (matchup: any, week: number) => {
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
  }, [leagueData.lineups]);

  const openWLTModal = useCallback(async (teamName: string, week: number) => {
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
  }, [leagueData.matchups, leagueData.lineups, openMatchupModal]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedMatchup(null);
  }, []);

  // Position calculation for portal tooltip (memoized)
  const calculateTooltipPosition = useCallback((rect: DOMRect, isNearBottom: boolean) => {
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
  }, []);


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

              return (
                <MatchupCard
                  key={key}
                  matchup={matchup}
                  matchupData={matchupData}
                  selectedWeek={selectedWeek}
                  leagueData={leagueData}
                  isWeekLocked={isWeekLocked}
                  openMatchupModal={openMatchupModal}
                />
              );
            })}
          </div>
        ) : loading ? (
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="text-slate-400">Loading matchup data...</p>
            </div>
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
