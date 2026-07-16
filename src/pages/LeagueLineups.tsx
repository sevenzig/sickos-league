import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MultiLeagueApi, FantasyTeam, RosterEntry, FantasyLineup, LeagueMatchup } from '../utils/multiLeagueApi';
import WeekNavigation from '../components/navigation/WeekNavigation';
import TeamLogo from '../components/TeamLogo';
import TeamIdentityEditor from '../components/league/TeamIdentityEditor';
import LeagueHeader from '../components/league/LeagueHeader';

interface LeagueInfo {
  id: string;
  name: string;
  teams_started_per_week: number;
}

// Self-serve weekly lineup page (Phase 3.1): the caller's own rostered NFL
// teams, pick exactly teams_started_per_week, save + lock. Opponent's lineup
// is only revealed by the server once the week locks.
const LeagueLineups: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();

  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [myTeam, setMyTeam] = useState<FantasyTeam | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [schedule, setSchedule] = useState<LeagueMatchup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedWeek, setSelectedWeek] = useState(1);
  const [currentWeek, setCurrentWeek] = useState(1);

  // Per-week state
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [weekLocked, setWeekLocked] = useState(false);
  const [myLineupLocked, setMyLineupLocked] = useState(false);
  const [opponentLineup, setOpponentLineup] = useState<FantasyLineup | null>(null);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Initial load: league, my team, my roster, full schedule
  useEffect(() => {
    const load = async () => {
      if (!leagueId || !user) return;
      try {
        setLoading(true);
        setError(null);

        const details = await MultiLeagueApi.getLeagueDetails(leagueId);
        if (!details) throw new Error('League not found');
        setLeague(details);

        const teams = await MultiLeagueApi.getLeagueFantasyTeams(details.id);
        const mine = teams.find(t => t.manager_user_id === user.id) || null;
        setMyTeam(mine);

        if (mine) {
          const rosterEntries = await MultiLeagueApi.getTeamRoster(mine.id);
          setRoster(rosterEntries);
        }

        let leagueSchedule: LeagueMatchup[] = [];
        try {
          leagueSchedule = await MultiLeagueApi.getLeagueSchedule(details.id);
        } catch {
          // Schedule may not be generated yet; page still works for lineups
        }
        setSchedule(leagueSchedule);

        // Current week = earliest unlocked week in the schedule (fallback 1)
        const unlockedWeeks = leagueSchedule
          .filter(m => !m.week_locked)
          .map(m => m.week);
        const week = unlockedWeeks.length > 0 ? Math.min(...unlockedWeeks) : 1;
        setCurrentWeek(week);
        setSelectedWeek(week);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load league data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [leagueId, user]);

  // Per-week load: my saved lineup, lock state, opponent
  const loadWeek = useCallback(async (week: number) => {
    if (!league || !myTeam) return;
    setStatusMessage(null);
    try {
      const [status, lineups] = await Promise.all([
        MultiLeagueApi.getWeekStatus(league.id, week),
        MultiLeagueApi.getFantasyLineups(league.id, week),
      ]);
      setWeekLocked(status?.is_locked ?? false);

      const mine = lineups.find(l => l.fantasy_team_id === myTeam.id) || null;
      setSelectedTeams(mine?.active_nfl_teams ?? []);
      setMyLineupLocked(mine?.is_locked ?? false);

      const matchup = schedule.find(
        m => m.week === week &&
          (m.fantasy_team1_id === myTeam.id || m.fantasy_team2_id === myTeam.id)
      );
      if (matchup) {
        const oppId = matchup.fantasy_team1_id === myTeam.id
          ? matchup.fantasy_team2_id : matchup.fantasy_team1_id;
        const oppName = matchup.fantasy_team1_id === myTeam.id
          ? matchup.fantasy_team2_name : matchup.fantasy_team1_name;
        setOpponentName(oppName);
        setOpponentLineup(lineups.find(l => l.fantasy_team_id === oppId) || null);
      } else {
        setOpponentName(null);
        setOpponentLineup(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load week data');
    }
  }, [league, myTeam, schedule]);

  useEffect(() => {
    loadWeek(selectedWeek);
  }, [selectedWeek, loadWeek]);

  const startersNeeded = league?.teams_started_per_week ?? 1;
  const canEdit = !weekLocked && !myLineupLocked;
  const isComplete = selectedTeams.length === startersNeeded;

  const toggleTeam = (nflTeamId: string) => {
    if (!canEdit) return;
    setSelectedTeams(prev => {
      if (prev.includes(nflTeamId)) {
        return prev.filter(id => id !== nflTeamId);
      }
      if (prev.length >= startersNeeded) return prev;
      return [...prev, nflTeamId];
    });
  };

  const saveLineup = async () => {
    if (!myTeam || !isComplete) return;
    try {
      setSaving(true);
      setError(null);
      await MultiLeagueApi.setFantasyLineup(myTeam.id, selectedWeek, selectedTeams);
      setStatusMessage('Lineup saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lineup');
    } finally {
      setSaving(false);
    }
  };

  const lockLineup = async () => {
    if (!myTeam || !isComplete) return;
    if (!window.confirm(`Lock your Week ${selectedWeek} lineup? You won't be able to change it.`)) return;
    try {
      setLocking(true);
      setError(null);
      await MultiLeagueApi.setFantasyLineup(myTeam.id, selectedWeek, selectedTeams);
      await MultiLeagueApi.lockFantasyLineup(myTeam.id, selectedWeek);
      setMyLineupLocked(true);
      setStatusMessage('Lineup locked in');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lock lineup');
    } finally {
      setLocking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading lineups...</p>
        </div>
      </div>
    );
  }

  if (error && !league) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 max-w-md text-center">
          <h3 className="text-red-400 font-medium mb-2">Error Loading Lineups</h3>
          <p className="text-slate-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!myTeam) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md text-center">
          <h3 className="text-white font-medium mb-2">No Team Found</h3>
          <p className="text-slate-400">You don't manage a fantasy team in this league.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 px-4 py-8">
      <LeagueHeader leagueId={leagueId!} active="lineups" />

      <WeekNavigation
        selectedWeek={selectedWeek}
        currentWeek={currentWeek}
        onWeekChange={setSelectedWeek}
        onGoToCurrentWeek={() => setSelectedWeek(currentWeek)}
      />

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {statusMessage && (
        <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
          <p className="text-green-400 font-medium">{statusMessage}</p>
        </div>
      )}

      {/* My lineup card */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <TeamIdentityEditor
              team={myTeam}
              onUpdated={changes => setMyTeam(prev => (prev ? { ...prev, ...changes } : prev))}
            />
            <p className="text-sm text-slate-400 mt-1">
              Pick {startersNeeded} of your {roster.length} rostered teams to start
            </p>
          </div>
          <div className="flex items-center gap-3">
            {weekLocked || myLineupLocked ? (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                {weekLocked ? 'Week Locked' : 'Lineup Locked'}
              </span>
            ) : (
              <span className={`text-xs px-2 py-1 rounded-lg font-bold tabular-nums ${
                isComplete ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
              }`}>
                {selectedTeams.length}/{startersNeeded}
              </span>
            )}
            {canEdit && (
              <>
                <button
                  onClick={saveLineup}
                  disabled={!isComplete || saving}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all duration-200"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={lockLineup}
                  disabled={!isComplete || locking}
                  className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all duration-200"
                >
                  {locking ? 'Locking...' : 'Lock Lineup'}
                </button>
              </>
            )}
          </div>
        </div>

        {roster.length === 0 ? (
          <p className="text-slate-400 text-center py-8">
            Your roster is empty — teams are assigned during the draft.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {roster.map(entry => {
              const isSelected = selectedTeams.includes(entry.nfl_team_id);
              const canSelect = !isSelected && selectedTeams.length < startersNeeded;

              return (
                <button
                  key={entry.nfl_team_id}
                  onClick={() => toggleTeam(entry.nfl_team_id)}
                  disabled={!canEdit || (!isSelected && !canSelect)}
                  className={`
                    relative aspect-square rounded-xl transition-all duration-200
                    flex flex-col items-center justify-center
                    p-2 sm:p-3 border
                    ${isSelected
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30 shadow-lg shadow-emerald-500/10'
                      : canEdit && canSelect
                      ? 'bg-slate-800/50 text-slate-200 border-slate-600/40 hover:bg-slate-700/60 hover:border-slate-500/50 hover:shadow-lg'
                      : 'bg-slate-800/20 text-slate-500 border-slate-700/20 cursor-not-allowed opacity-60'
                    }
                  `}
                >
                  <div className="flex-shrink-0 mb-1">
                    <TeamLogo teamName={entry.nfl_team_name} className="w-10 h-10 sm:w-12 sm:h-12" />
                  </div>
                  <div className="h-6 sm:h-7 flex items-center justify-center overflow-hidden">
                    <span className="text-xs sm:text-sm font-semibold text-center leading-tight truncate px-1">
                      {entry.nfl_team_name}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
                      <div className="bg-emerald-500 rounded-full p-0.5 sm:p-1 shadow-lg">
                        <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Opponent card */}
      {opponentName && (
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-50">
              Week {selectedWeek} Opponent: <span className="text-blue-400">{opponentName}</span>
            </h3>
            {opponentLineup?.is_locked && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                Locked
              </span>
            )}
          </div>
          {weekLocked && opponentLineup && opponentLineup.active_nfl_team_names.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {opponentLineup.active_nfl_team_names.map(name => (
                <div key={name} className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-600/40 rounded-lg">
                  <TeamLogo teamName={name} size="sm" />
                  <span className="text-sm font-medium text-slate-200">{name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">
              {weekLocked
                ? 'Opponent has no lineup for this week.'
                : "Opponent's lineup is hidden until the week locks."}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LeagueLineups;
