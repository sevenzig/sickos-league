import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { MultiLeagueApi, FantasyTeam, LeagueMatchup } from '../utils/multiLeagueApi';
import { db } from '../utils/db';
import { getWeeklyQBPerformancesFromDb } from '../services/database';
import { matchupScoreKey, useMatchupScores } from '../hooks/useMatchupScores';
import LeagueHeader from '../components/league/LeagueHeader';
import WeekNavigation from '../components/navigation/WeekNavigation';
import MatchupCard from '../components/matchup-cards/2-team/MatchupCard';
import MatchupModal from '../components/matchup-modals/2-team/MatchupModal';

interface LineupRow {
  fantasy_team_id: string;
  week: number;
  active_nfl_teams: string[];
  is_locked: boolean;
}

// Phase 5.3: full-season schedule page - week-by-week matchups with score drill-down.
const LeagueSchedule: React.FC = () => {
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

  const [selectedMatchup, setSelectedMatchup] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isWeekLocked = useCallback(
    (week: number) => schedule.some(m => m.week === week && m.week_locked),
    [schedule]
  );

  const currentWeek = useMemo(() => {
    const completedWeeks = schedule.filter(m => m.is_complete).map(m => m.week);
    return completedWeeks.length > 0 ? Math.min(18, Math.max(...completedWeeks) + 1) : 1;
  }, [schedule]);

  useEffect(() => {
    if (isDataLoaded && !hasManuallyNavigated) {
      setSelectedWeek(currentWeek);
    }
  }, [isDataLoaded, currentWeek, hasManuallyNavigated]);

  useEffect(() => {
    const load = async () => {
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
        setError(err instanceof Error ? err.message : 'Failed to load schedule');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [leagueId]);

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

  const lineupNamesFor = useCallback(
    (fantasyTeamId: string, week: number): string[] => {
      const lineup = lineups.find(l => l.fantasy_team_id === fantasyTeamId && l.week === week);
      if (!lineup) return [];
      return lineup.active_nfl_teams.map(id => nflTeamNames[id]).filter(Boolean);
    },
    [lineups, nflTeamNames]
  );

  const weekMatchups = useMemo(() => {
    return schedule
      .filter(m => m.week === selectedWeek)
      .map(m => ({
        team1: m.fantasy_team1_name,
        team2: m.fantasy_team2_name,
        week: m.week,
      }));
  }, [schedule, selectedWeek]);

  const matchupScores = useMatchupScores(schedule, selectedWeek, weekStats, lineupNamesFor);

  const openMatchupModal = useCallback((matchup: { team1: string; team2: string }, week: number) => {
    const key = matchupScoreKey(matchup.team1, matchup.team2, week);
    const matchupData = matchupScores[key];
    if (!matchupData) return;
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
  }, [matchupScores]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedMatchup(null);
  }, []);

  const handleWeekChange = (week: number) => {
    setSelectedWeek(week);
    setHasManuallyNavigated(true);
  };

  const handleGoToCurrentWeek = () => {
    setSelectedWeek(currentWeek);
    setHasManuallyNavigated(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LeagueHeader leagueId={leagueId!} active="schedule" />

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          <WeekNavigation
            selectedWeek={selectedWeek}
            currentWeek={currentWeek}
            onWeekChange={handleWeekChange}
            onGoToCurrentWeek={handleGoToCurrentWeek}
          />

          {isDataLoaded && (
            weekMatchups.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {weekMatchups.map((matchup) => {
                  const key = matchupScoreKey(matchup.team1, matchup.team2, matchup.week);
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
              <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 text-center text-slate-400">
                {schedule.length === 0
                  ? 'No schedule yet. Finish the draft, then the commissioner can generate the season schedule.'
                  : `No matchups scheduled for Week ${selectedWeek}`}
              </div>
            )
          )}
        </div>
      </div>

      <MatchupModal
        isOpen={isModalOpen}
        onClose={closeModal}
        matchupData={selectedMatchup}
      />
    </div>
  );
};

export default LeagueSchedule;
