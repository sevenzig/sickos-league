import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { MultiLeagueApi, FantasyTeam, LeagueMatchup } from '../utils/multiLeagueApi';
import { db } from '../utils/db';
import { getWeeklyQBPerformancesFromDb } from '../services/database';
import WeekNavigation from '../components/navigation/WeekNavigation';
import LeagueHeader from '../components/league/LeagueHeader';
import MatchupCard from '../components/matchup-cards/2-team/MatchupCard';
import MatchupModal from '../components/matchup-modals/2-team/MatchupModal';
import LeagueStandings from '../components/tables/LeagueStandings';
import SeasonWLTChart from '../components/tables/SeasonWLTChart';

interface LineupRow {
  fantasy_team_id: string;
  week: number;
  active_nfl_teams: string[];
  is_locked: boolean;
}

const LeagueView: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [hasManuallyNavigated, setHasManuallyNavigated] = useState(false);

  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeam[]>([]);
  const [schedule, setSchedule] = useState<LeagueMatchup[]>([]);
  const [lineups, setLineups] = useState<LineupRow[]>([]);
  const [nflTeamNames, setNflTeamNames] = useState<Record<string, string>>({});
  const [weekStats, setWeekStats] = useState<any[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A week is locked when its weeks row is locked (surfaced per matchup by get_league_schedule)
  const isWeekLocked = useCallback(
    (week: number) => schedule.some(m => m.week === week && m.week_locked),
    [schedule]
  );

  // Current week = first week after the latest finalized one
  const currentWeek = useMemo(() => {
    const completedWeeks = schedule.filter(m => m.is_complete).map(m => m.week);
    return completedWeeks.length > 0 ? Math.min(18, Math.max(...completedWeeks) + 1) : 1;
  }, [schedule]);

  // Update selected week when data loads (only on initial load, not on manual navigation)
  useEffect(() => {
    if (isDataLoaded && !hasManuallyNavigated) {
      setSelectedWeek(currentWeek);
    }
  }, [isDataLoaded, currentWeek, hasManuallyNavigated]);

  // Load league data
  useEffect(() => {
    const loadLeagueData = async () => {
      if (!leagueId) return;

      try {
        setLoading(true);
        setError(null);

        const fullLeagueId = await MultiLeagueApi.resolveLeagueId(leagueId);

        const [teams, leagueSchedule, nflTeamsResult] = await Promise.all([
          MultiLeagueApi.getLeagueFantasyTeams(fullLeagueId),
          MultiLeagueApi.getLeagueSchedule(fullLeagueId).catch(err => {
            console.error('Error loading schedule (might not be generated yet):', err);
            return [] as LeagueMatchup[];
          }),
          db.from('teams').select('uuid_id, name'),
        ]);

        if (nflTeamsResult.error) throw new Error(nflTeamsResult.error.message);
        const nameByUuid: Record<string, string> = {};
        (nflTeamsResult.data || []).forEach((t: any) => {
          nameByUuid[t.uuid_id] = t.name;
        });

        // All lineups for the league's fantasy teams (RLS: members only)
        let lineupRows: LineupRow[] = [];
        if (teams.length > 0) {
          const { data, error: lineupError } = await db
            .from('fantasy_lineups')
            .select('fantasy_team_id, week, active_nfl_teams, is_locked')
            .in('fantasy_team_id', teams.map(t => t.id));
          if (lineupError) {
            console.error('Error loading lineups:', lineupError);
          } else {
            lineupRows = data || [];
          }
        }

        setFantasyTeams(teams);
        setSchedule(leagueSchedule);
        setLineups(lineupRows);
        setNflTeamNames(nameByUuid);
        setIsDataLoaded(true);
      } catch (err) {
        console.error('Error loading league data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load league data');
      } finally {
        setLoading(false);
      }
    };

    loadLeagueData();
  }, [leagueId]);

  // Load game stats for the selected week (cached in services/database)
  useEffect(() => {
    if (!isDataLoaded) return;
    let cancelled = false;
    getWeeklyQBPerformancesFromDb(selectedWeek).then(stats => {
      if (!cancelled) setWeekStats(stats);
    });
    return () => {
      cancelled = true;
    };
  }, [isDataLoaded, selectedWeek]);

  const teams = useMemo(() => fantasyTeams.map(t => t.team_name), [fantasyTeams]);

  // Lineup NFL team names for a fantasy team + week
  const lineupNamesFor = useCallback(
    (fantasyTeamId: string, week: number): string[] => {
      const lineup = lineups.find(l => l.fantasy_team_id === fantasyTeamId && l.week === week);
      if (!lineup) return [];
      return lineup.active_nfl_teams.map(id => nflTeamNames[id]).filter(Boolean);
    },
    [lineups, nflTeamNames]
  );

  // Matchups for the selected week, in the shape the cards expect
  const weekMatchups = useMemo(() => {
    return schedule
      .filter(m => m.week === selectedWeek)
      .map(m => ({
        team1: m.fantasy_team1_name,
        team2: m.fantasy_team2_name,
        week: m.week,
      }));
  }, [schedule, selectedWeek]);

  // Scores + per-QB breakdowns for the selected week.
  // Lineups are only revealed once the week is locked (standard fantasy convention);
  // persisted scores are used when the matchup is finalized, otherwise live sums.
  const matchupScores = useMemo(() => {
    const scores: Record<string, any> = {};
    const perfByTeam: Record<string, any> = {};
    weekStats.forEach(p => {
      perfByTeam[p.team] = p;
    });

    schedule
      .filter(m => m.week === selectedWeek)
      .forEach(m => {
        const key = `${m.fantasy_team1_name}-${m.fantasy_team2_name}-${m.week}`;
        const locked = m.week_locked;

        const team1Names = locked ? lineupNamesFor(m.fantasy_team1_id, m.week) : [];
        const team2Names = locked ? lineupNamesFor(m.fantasy_team2_id, m.week) : [];

        const team1Breakdown = team1Names.map(name => ({ qb: name, breakdown: perfByTeam[name] ?? null }));
        const team2Breakdown = team2Names.map(name => ({ qb: name, breakdown: perfByTeam[name] ?? null }));

        const liveSum = (breakdown: { breakdown: any }[]) =>
          breakdown.reduce((sum, b) => sum + (b.breakdown?.finalScore ?? 0), 0);

        scores[key] = {
          team1Score: m.is_complete && m.team1_score != null ? Number(m.team1_score) : liveSum(team1Breakdown),
          team2Score: m.is_complete && m.team2_score != null ? Number(m.team2_score) : liveSum(team2Breakdown),
          team1Breakdown,
          team2Breakdown,
        };
      });

    return scores;
  }, [schedule, selectedWeek, weekStats, lineupNamesFor]);

  // Season records + W/L/T chart data from finalized matchups
  const { teamRecords, teamWeekResults, teamWeekMatchupDetails } = useMemo(() => {
    const tallies: Record<string, { wins: number; losses: number; ties: number }> = {};
    const results: Record<string, string> = {};
    const details: Record<string, any> = {};

    teams.forEach(team => {
      tallies[team] = { wins: 0, losses: 0, ties: 0 };
    });

    schedule.forEach(m => {
      if (!m.is_complete || m.team1_score == null || m.team2_score == null) return;
      const s1 = Number(m.team1_score);
      const s2 = Number(m.team2_score);
      const team1QBs = lineupNamesFor(m.fantasy_team1_id, m.week);
      const team2QBs = lineupNamesFor(m.fantasy_team2_id, m.week);

      const sides = [
        { name: m.fantasy_team1_name, score: s1, oppName: m.fantasy_team2_name, oppScore: s2, qbs: team1QBs, oppQBs: team2QBs },
        { name: m.fantasy_team2_name, score: s2, oppName: m.fantasy_team1_name, oppScore: s1, qbs: team2QBs, oppQBs: team1QBs },
      ];

      sides.forEach(side => {
        const result = side.score === side.oppScore ? 'T' : side.score > side.oppScore ? 'W' : 'L';
        if (!tallies[side.name]) tallies[side.name] = { wins: 0, losses: 0, ties: 0 };
        if (result === 'W') tallies[side.name].wins++;
        else if (result === 'L') tallies[side.name].losses++;
        else tallies[side.name].ties++;

        const key = `${side.name}-${m.week}`;
        results[key] = result;
        details[key] = {
          opponent: side.oppName,
          teamScore: side.score,
          opponentScore: side.oppScore,
          teamQBs: side.qbs,
          opponentQBs: side.oppQBs,
          result,
        };
      });
    });

    const records: Record<string, string> = {};
    Object.entries(tallies).forEach(([team, t]) => {
      records[team] = `${t.wins}-${t.losses}${t.ties > 0 ? `-${t.ties}` : ''}`;
    });

    return { teamRecords: records, teamWeekResults: results, teamWeekMatchupDetails: details };
  }, [schedule, teams, lineupNamesFor]);

  const weeks = useMemo(() => Array.from({ length: 18 }, (_, i) => i + 1), []);

  // Modal state
  const [selectedMatchup, setSelectedMatchup] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openMatchupModal = useCallback((matchup: any, week: number) => {
    const key = `${matchup.team1}-${matchup.team2}-${week}`;
    const matchupData = matchupScores[key];

    if (matchupData) {
      setSelectedMatchup({
        week,
        team1: matchup.team1,
        team2: matchup.team2,
        team1Score: matchupData.team1Score,
        team2Score: matchupData.team2Score,
        team1Breakdown: matchupData.team1Breakdown,
        team2Breakdown: matchupData.team2Breakdown,
      });
      setIsModalOpen(true);
    }
  }, [matchupScores]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedMatchup(null);
  }, []);

  // Clicking a W/L/T cell jumps to that week's matchups
  const openWLTModal = useCallback((_teamName: string, week: number) => {
    setSelectedWeek(week);
    setHasManuallyNavigated(true);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading league data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-medium mb-2">Error Loading League</h3>
            <p className="text-slate-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const handleWeekChange = (week: number) => {
    setSelectedWeek(week);
    setHasManuallyNavigated(true);
  };

  const handleGoToCurrentWeek = () => {
    setSelectedWeek(currentWeek);
    setHasManuallyNavigated(false);
  };

  return (
    <div className="space-y-8">
      {/* League header: name, tabs, draft callout (Phase 5.3) */}
      <LeagueHeader leagueId={leagueId!} active="home" />

      {/* Week Navigation */}
      <WeekNavigation
        selectedWeek={selectedWeek}
        currentWeek={currentWeek}
        onWeekChange={handleWeekChange}
        onGoToCurrentWeek={handleGoToCurrentWeek}
      />

      {/* Show loading state while data loads */}
      {!isDataLoaded && (
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <p className="text-slate-400">Loading league data...</p>
          </div>
        </div>
      )}

      {/* Matchups - Top row with 4 columns */}
      {isDataLoaded && (
        <div className="space-y-8">
        {weekMatchups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-6">
            {weekMatchups.map((matchup) => {
              const key = `${matchup.team1}-${matchup.team2}-${matchup.week}`;
              const matchupData = matchupScores[key];

              return (
                <MatchupCard
                  key={key}
                  matchup={matchup}
                  matchupData={matchupData}
                  selectedWeek={selectedWeek}
                  leagueData={{ teams, matchups: weekMatchups, lineups, currentWeek }}
                  isWeekLocked={isWeekLocked}
                  openMatchupModal={openMatchupModal}
                />
              );
            })}
          </div>
        ) : (
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-6 text-center text-slate-400">
            {schedule.length === 0
              ? 'No schedule yet. Finish the draft, then the commissioner can generate the season schedule.'
              : `No matchups scheduled for Week ${selectedWeek}`}
          </div>
        )}
        </div>
      )}

      {/* Bottom row - League Standings and W/L/T Chart side by side */}
      {isDataLoaded && (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* League Standings - Left side (1/3 width) */}
        <LeagueStandings leagueId={leagueId!} teams={teams} />

        {/* Season W/L/T Chart - Right side (2/3 width) */}
        <SeasonWLTChart
          leagueId={leagueId!}
          teams={teams}
          weeks={weeks}
          teamWeekResults={teamWeekResults}
          teamRecords={teamRecords}
          teamWeekMatchupDetails={teamWeekMatchupDetails}
          openWLTModal={openWLTModal}
        />
      </div>
      )}

      {/* Matchup Modal */}
      <MatchupModal
        isOpen={isModalOpen}
        onClose={closeModal}
        matchupData={selectedMatchup}
      />
    </div>
  );
};

export default LeagueView;
