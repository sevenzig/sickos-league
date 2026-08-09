import React, { useState, useEffect, useCallback } from 'react';
import { MultiLeagueApi, FantasyTeam, FantasyLineup, LeagueRosterEntry } from '../../utils/multiLeagueApi';
import TeamLogo from '../TeamLogo';
import { Panel, Button, Badge, Select, Alert } from '@/components/ui';

interface CommissionerLineupsProps {
  leagueId: string;
  startersPerWeek: number;
}

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

  const lineupStatus = (teamId: string): { label: string; variant: 'success' | 'primary' | 'warning' } => {
    const lineup = lineupsByTeam[teamId];
    if (lineup?.is_locked) return { label: 'Locked', variant: 'success' };
    if (lineup && lineup.active_nfl_teams.length === startersPerWeek) return { label: 'Complete', variant: 'primary' };
    return { label: 'Missing', variant: 'warning' };
  };

  return (
    <Panel>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-heading text-slate-50">Weekly Lineups</h2>
          <p className="text-label text-slate-400 mt-1">
            Lineup status for every team; finalize locks all lineups and the week.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(Number(e.target.value))}
            className="w-32"
          >
            {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
              <option key={week} value={week}>Week {week}</option>
            ))}
          </Select>
          {weekLocked ? (
            <Badge variant="success">Week Finalized</Badge>
          ) : (
            <Button onClick={finalizeWeek} disabled={finalizing || loading}>
              {finalizing ? 'Finalizing...' : 'Finalize Week'}
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {statusMessage && <Alert variant="success" className="mb-4">{statusMessage}</Alert>}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
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
              <div key={team.id} className="bg-slate-900/60 rounded-md border border-slate-700/50 flex flex-col">
                <div className="flex items-center justify-between p-3 border-b border-slate-700/30">
                  <span className="text-label font-semibold text-slate-200 truncate" title={team.team_name}>
                    {team.team_name}
                  </span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                {roster.length === 0 ? (
                  <p className="text-caption text-slate-500 text-center p-4">No roster yet</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 p-3 flex-1">
                    {roster.map(entry => {
                      const isSelected = selection.includes(entry.nfl_team_id);
                      return (
                        <button
                          key={entry.nfl_team_id}
                          onClick={() => toggleTeamSelection(team.id, entry.nfl_team_id)}
                          className={`
                            flex flex-col items-center justify-center rounded-md p-2 border transition-all duration-150
                            ${isSelected
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : 'bg-slate-800/50 text-slate-300 border-slate-600/40 hover:bg-slate-700/60'
                            }
                          `}
                        >
                          <TeamLogo teamName={entry.nfl_team_name} className="w-8 h-8" />
                          <span className="text-caption font-medium text-center leading-tight truncate w-full mt-1">
                            {entry.nfl_team_name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {dirty && (
                  <div className="p-3 pt-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => saveOverride(team.id)}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save (override)'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};

export default CommissionerLineups;
