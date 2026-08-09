import React, { useState, useEffect } from 'react';
import { MultiLeagueApi, FantasyTeam } from '../../utils/multiLeagueApi';
import { Panel, Badge, Alert } from '@/components/ui';

interface TeamManagementProps {
  leagueId: string;
  isOwner: boolean;
  maxTeams?: number;
  ownerId?: string;
}

interface TeamSlot {
  slotNumber: number;
  fantasyTeam?: FantasyTeam;
}

const TeamManagement: React.FC<TeamManagementProps> = ({
  leagueId,
  isOwner,
  maxTeams = 8,
  ownerId
}) => {
  const [teamSlots, setTeamSlots] = useState<TeamSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTeamData();
  }, [leagueId]);

  const loadTeamData = async () => {
    try {
      setLoading(true);
      setError(null);

      let fantasyTeams: FantasyTeam[] = [];
      try {
        fantasyTeams = await MultiLeagueApi.getLeagueFantasyTeams(leagueId);
      } catch (teamsError) {
        console.warn('Could not load fantasy teams:', teamsError);
      }

      const slots: TeamSlot[] = [];
      const sortedTeams = [...fantasyTeams].sort((a, b) => {
        if (ownerId) {
          if (a.manager_user_id === ownerId && b.manager_user_id !== ownerId) return -1;
          if (b.manager_user_id === ownerId && a.manager_user_id !== ownerId) return 1;
        }
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });

      sortedTeams.forEach((team, index) => {
        slots.push({ slotNumber: index + 1, fantasyTeam: team });
      });

      for (let i = fantasyTeams.length; i < maxTeams; i++) {
        slots.push({ slotNumber: i + 1 });
      }

      setTeamSlots(slots);
    } catch (err) {
      console.error('Error loading team data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  const filledSlots = teamSlots.filter(slot => slot.fantasyTeam).length;
  const remainingSlots = maxTeams - filledSlots;

  if (loading) {
    return (
      <Panel>
        <div className="animate-pulse">
          <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel padding="none">
      <div className="p-6 border-b border-slate-700/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-heading text-slate-100">Team Management</h3>
            <p className="text-label text-slate-400 mt-1">
              {filledSlots}/{maxTeams} slots filled · {remainingSlots} remaining
            </p>
          </div>
          <Badge variant={filledSlots === maxTeams ? 'success' : 'warning'}>
            {filledSlots === maxTeams ? 'Full' : 'Open'}
          </Badge>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-6">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <div className="p-6">
        <div className="space-y-3">
          {teamSlots.map((slot) => (
            <div
              key={slot.slotNumber}
              className={`border rounded-md p-4 transition-colors ${
                slot.fantasyTeam
                  ? 'border-green-600/30 bg-green-600/5'
                  : 'border-slate-600 bg-slate-800/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-caption font-bold flex-shrink-0 ${
                    slot.fantasyTeam ? 'bg-green-600 text-white' : 'bg-slate-600 text-slate-300'
                  }`}>
                    {slot.slotNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    {slot.fantasyTeam ? (
                      <div>
                        <h4 className="text-label font-medium text-slate-200">{slot.fantasyTeam.team_name}</h4>
                        <p className="text-caption text-slate-400">
                          {slot.fantasyTeam.manager_email?.split('@')[0] || 'Unknown Manager'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <h4 className="text-label font-medium text-slate-400">Empty Slot</h4>
                        <p className="text-caption text-slate-500">Waiting for a player to join</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {slot.fantasyTeam ? (
                    <Badge variant="success">Filled</Badge>
                  ) : (
                    <Badge variant="default">Open</Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {isOwner && (
          <div className="mt-6 p-4 bg-blue-600/10 border border-blue-600/20 rounded-md">
            <h4 className="text-label font-medium text-blue-300 mb-2">How it works</h4>
            <ul className="text-caption text-slate-400 space-y-1">
              <li>• Share the join link and password from League Settings below</li>
              <li>• Players sign in, enter the password once, and pick a team name</li>
              <li>• Filled slots show the team and manager</li>
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
};

export default TeamManagement;
