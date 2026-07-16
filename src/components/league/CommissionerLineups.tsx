import React, { useState, useEffect, useCallback } from 'react';
import { MultiLeagueApi, FantasyTeam, FantasyLineup, LeagueRosterEntry } from '../../utils/multiLeagueApi';
import TeamLogo from '../TeamLogo';

interface CommissionerLineupsProps {
  leagueId: string; // full league UUID
  startersPerWeek: number;
}

// Phase 3.2: commissioner view of all teams' lineup status for a week, with
// owner override editing and a "Finalize Week" action (auto-fills missing
// lineups from lowest draft picks, then locks everything — Phase 3.3).
const CommissionerLineups: React.FC<CommissionerLineupsProps> = ({ leagueId, startersPerWeek }) => {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [rostersByTeam, setRostersByTeam] = useState<Record<string, LeagueRosterEntry[]>>({});
  const [lineupsByTeam, setLineupsByTeam] = useState<Record<string, FantasyLineup>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [weekLocked, setWeekLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadWeek = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [fantasyTeams, leagueRosters, lineups, status] = await Promise.all([
        MultiLeagueApi.getLeagueFantasyTeams(leagueId),
        MultiLeagueApi.getLeagueRosters(leagueId),
        MultiLeagueApi.getFantasyLineups(leagueId, selectedWeek),
        MultiLeagueApi.getWeekStatus(leagueId, selectedWeek),
      ]);

      setTeams(fantasyTeams);
      setWeekLocked(status?.is_locked ?? false);

      const rosters: Record<string, LeagueRosterEntry[]> = {};
      leagueRosters.forEach(entry => {
        (rosters[entry.fantasy_team_id] ||= []).push(entry);
      });
      setRostersByTeam(rosters);

      const byTeam: Record<string, FantasyLineup> = {};
      const initial: Record<string, string[]> = {};
      lineups.forEach(lineup => {
        byTeam[lineup.fantasy_team_id] = lineup;
        initial[lineup.fantasy_team_id] = lineup.active_nfl_teams;
      });
      setLineupsByTeam(byTeam);
      setSelections(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lineups');
    } finally {
      setLoading(false);
    }
  }, [leagueId, selectedWeek]);

  useEffect(() => {
    setStatusMessage(null);
    loadWeek();
  }, [loadWeek]);

  const toggleTeamSelection = (fantasyTeamId: string, nflTeamId: string) => {
    setSelections(prev => {
      const current = prev[fantasyTeamId] || [];
      const next = current.includes(nflTeamId)
        ? current.filter(id => id !== nflTeamId)
        : current.length < startersPerWeek
        ? [...current, nflTeamId]
        : current;
      return { ...prev, [fantasyTeamId]: next };
    });
  };

  const saveOverride = async (fantasyTeamId: string) => {
    const selection = selections[fantasyTeamId] || [];
    if (selection.length !== startersPerWeek) return;
    try {
      setSavingTeamId(fantasyTeamId);
      setError(null);
      await MultiLeagueApi.setFantasyLineup(fantasyTeamId, selectedWeek, selection);
      setStatusMessage('Lineup saved');
      await loadWeek();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lineup');
    } finally {
      setSavingTeamId(null);
    }
  };

  const finalizeWeek = async () => {
    const missing = teams.filter(t => {
      const lineup = lineupsByTeam[t.id];
      return !lineup || lineup.active_nfl_teams.length !== startersPerWeek;
    }).length;
    const warning = missing > 0
      ? `${missing} team(s) have no saved lineup and will auto-start their lowest draft picks. `
      : '';
    if (!window.confirm(`${warning}Finalize Week ${selectedWeek}? All lineups and the week will be locked.`)) return;

    try {
      setFinalizing(true);
      setError(null);
      const autoFilled = await MultiLeagueApi.finalizeWeekLineups(leagueId, selectedWeek);
      setStatusMessage(
        autoFilled > 0
          ? `Week ${selectedWeek} finalized — ${autoFilled} lineup(s) auto-filled`
          : `Week ${selectedWeek} finalized`
      );
      await loadWeek();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize week');
    } finally {
      setFinalizing(false);
    }
  };

  const lineupStatus = (teamId: string): { label: string; classes: string } => {
    const lineup = lineupsByTeam[teamId];
    if (lineup?.is_locked) {
      return { label: 'Locked', classes: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    }
    if (lineup && lineup.active_nfl_teams.length === startersPerWeek) {
      return { label: 'Complete', classes: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    }
    return { label: 'Missing', classes: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Weekly Lineups</h2>
          <p className="text-slate-400 text-sm mt-1">
            Lineup status for every team; finalize locks all lineups and the week.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(Number(e.target.value))}
            className="bg-slate-700 text-slate-200 border border-slate-600 rounded-md px-3 py-2 text-sm"
          >
            {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
              <option key={week} value={week}>Week {week}</option>
            ))}
          </select>
          {weekLocked ? (
            <span className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/30 text-sm font-medium">
              Week Finalized
            </span>
          ) : (
            <button
              onClick={finalizeWeek}
              disabled={finalizing || loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
            >
              {finalizing ? 'Finalizing...' : 'Finalize Week'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {statusMessage && (
        <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 mb-4">
          <p className="text-green-400 font-medium">{statusMessage}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {teams.map(team => {
            const roster = rostersByTeam[team.id] || [];
            const selection = selections[team.id] || [];
            const status = lineupStatus(team.id);
            const isSaving = savingTeamId === team.id;
            const dirty =
              selection.length === startersPerWeek &&
              JSON.stringify([...selection].sort()) !==
                JSON.stringify([...(lineupsByTeam[team.id]?.active_nfl_teams || [])].sort());

            return (
              <div key={team.id} className="bg-slate-900/60 rounded-xl border border-slate-700/50 flex flex-col">
                <div className="flex items-center justify-between p-3 border-b border-slate-700/30">
                  <span className="text-sm font-semibold text-slate-200 truncate" title={team.team_name}>
                    {team.team_name}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-lg font-bold border ${status.classes}`}>
                    {status.label}
                  </span>
                </div>

                {roster.length === 0 ? (
                  <p className="text-slate-500 text-xs text-center p-4">No roster yet</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 p-3 flex-1">
                    {roster.map(entry => {
                      const isSelected = selection.includes(entry.nfl_team_id);
                      return (
                        <button
                          key={entry.nfl_team_id}
                          onClick={() => toggleTeamSelection(team.id, entry.nfl_team_id)}
                          className={`
                            flex flex-col items-center justify-center rounded-lg p-2 border transition-all duration-150
                            ${isSelected
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : 'bg-slate-800/50 text-slate-300 border-slate-600/40 hover:bg-slate-700/60'
                            }
                          `}
                        >
                          <TeamLogo teamName={entry.nfl_team_name} className="w-8 h-8" />
                          <span className="text-[11px] font-medium text-center leading-tight truncate w-full mt-1">
                            {entry.nfl_team_name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {dirty && (
                  <div className="p-3 pt-0">
                    <button
                      onClick={() => saveOverride(team.id)}
                      disabled={isSaving}
                      className="w-full px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50 rounded-lg text-xs font-medium transition-all duration-200"
                    >
                      {isSaving ? 'Saving...' : 'Save (override)'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommissionerLineups;
