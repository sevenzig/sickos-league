import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiLeagueApi, FantasyTeam } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';

interface MemberManagementProps {
  leagueId: string; // full league UUID
  ownerUserId?: string;
  draftStatus: 'pending' | 'in_progress' | 'complete';
}

// Phase 5.1: commissioner member management - remove a member before the
// draft (their team slot reopens) or hand the league to another manager.
const MemberManagement: React.FC<MemberManagementProps> = ({ leagueId, ownerUserId, draftStatus }) => {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    try {
      setLoading(true);
      const data = await MultiLeagueApi.getLeagueFantasyTeams(leagueId);
      setTeams(data.filter(t => t.manager_user_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const handleRemove = async (team: FantasyTeam) => {
    if (!team.manager_user_id) return;
    const who = team.manager_email || team.team_name;
    if (!window.confirm(`Remove ${who} from the league? Their team slot will reopen for a new manager.`)) return;

    try {
      setBusyUserId(team.manager_user_id);
      setError(null);
      await MultiLeagueApi.removeLeagueMember(leagueId, team.manager_user_id);
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleTransfer = async (team: FantasyTeam) => {
    if (!team.manager_user_id) return;
    const who = team.manager_email || team.team_name;
    if (!window.confirm(`Make ${who} the commissioner? You will lose access to this admin panel.`)) return;

    try {
      setBusyUserId(team.manager_user_id);
      setError(null);
      await MultiLeagueApi.transferCommissioner(leagueId, team.manager_user_id);
      // The current user is no longer the owner - the admin panel would
      // redirect anyway, so go straight to the league home.
      navigate(getLeagueUrl(leagueId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transfer commissioner');
      setBusyUserId(null);
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <h2 className="text-xl font-semibold text-white mb-1">Members</h2>
      <p className="text-slate-400 text-sm mb-4">
        Remove a member before the draft, or transfer the commissioner role to another manager.
      </p>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <ul className="space-y-2">
          {teams.map(team => {
            const isOwner = team.manager_user_id === ownerUserId;
            const busy = busyUserId === team.manager_user_id;
            return (
              <li
                key={team.id}
                className="flex items-center gap-3 bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{team.team_name}</div>
                  {team.manager_email && (
                    <div className="text-slate-500 text-xs truncate">{team.manager_email}</div>
                  )}
                </div>
                {isOwner ? (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-900/50 text-blue-300">
                    Commissioner
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTransfer(team)}
                      disabled={busy}
                      className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-md transition-colors"
                    >
                      Make Commissioner
                    </button>
                    <button
                      onClick={() => handleRemove(team)}
                      disabled={busy || draftStatus !== 'pending'}
                      title={draftStatus !== 'pending' ? 'Members can only be removed before the draft' : ''}
                      className="px-3 py-1.5 text-sm bg-red-900/40 hover:bg-red-900/70 disabled:opacity-50 disabled:cursor-not-allowed text-red-300 rounded-md transition-colors"
                    >
                      {busy ? 'Working...' : 'Remove'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default MemberManagement;
