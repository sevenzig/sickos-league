import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiLeagueApi, FantasyTeam } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';
import { Panel, Button, Badge, Alert } from '@/components/ui';

interface MemberManagementProps {
  leagueId: string;
  ownerUserId?: string;
  draftStatus: 'pending' | 'in_progress' | 'complete';
}

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
      navigate(getLeagueUrl(leagueId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transfer commissioner');
      setBusyUserId(null);
    }
  };

  return (
    <Panel>
      <h2 className="text-heading text-slate-50 mb-1">Members</h2>
      <p className="text-label text-slate-400 mb-4">
        Remove a member before the draft, or transfer the commissioner role to another manager.
      </p>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        </div>
      ) : (
        <ul className="space-y-2">
          {teams.map(team => {
            const isOwner = team.manager_user_id === ownerUserId;
            const busy = busyUserId === team.manager_user_id;
            return (
              <li
                key={team.id}
                className="flex items-center gap-3 bg-slate-900/50 border border-slate-700/50 rounded-md px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-label font-medium text-white truncate">{team.team_name}</div>
                  {team.manager_email && (
                    <div className="text-caption text-slate-500 truncate">{team.manager_email}</div>
                  )}
                </div>
                {isOwner ? (
                  <Badge variant="primary">Commissioner</Badge>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleTransfer(team)}
                      disabled={busy}
                    >
                      Make Commissioner
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleRemove(team)}
                      disabled={busy || draftStatus !== 'pending'}
                      title={draftStatus !== 'pending' ? 'Members can only be removed before the draft' : ''}
                    >
                      {busy ? 'Working...' : 'Remove'}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
};

export default MemberManagement;
