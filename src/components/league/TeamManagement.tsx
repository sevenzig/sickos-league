import React, { useState, useEffect } from 'react';
import { MultiLeagueApi, FantasyTeam } from '../../utils/multiLeagueApi';

interface TeamManagementProps {
  leagueId: string;
  isOwner: boolean;
  maxTeams?: number;
  ownerId?: string; // Pass the league owner ID to ensure they're in slot 1
}

interface TeamSlot {
  slotNumber: number;
  fantasyTeam?: FantasyTeam;
  inviteCode?: string;
  generatingInvite: boolean;
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

      // Load fantasy teams
      let fantasyTeams: FantasyTeam[] = [];
      try {
        fantasyTeams = await MultiLeagueApi.getLeagueFantasyTeams(leagueId);
      } catch (teamsError) {
        console.warn('Could not load fantasy teams:', teamsError);
        // For other errors, continue with empty teams array
      }

      // Load active invitations
      let invitations: any[] = [];
      try {
        invitations = await MultiLeagueApi.getLeagueInvitations(leagueId);
      } catch (inviteError) {
        console.warn('Could not load invitations:', inviteError);
        // If invite system not available, we'll continue without invitations
      }

      // Create slots array
      const slots: TeamSlot[] = [];

      // Sort teams so league owner/admin is always in slot 1
      const sortedTeams = [...fantasyTeams].sort((a, b) => {
        // If we have owner ID, prioritize the owner's team
        if (ownerId) {
          if (a.manager_user_id === ownerId && b.manager_user_id !== ownerId) return -1;
          if (b.manager_user_id === ownerId && a.manager_user_id !== ownerId) return 1;
        }
        // Fallback to creation order (earliest first)
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });

      // Fill slots with existing teams (admin/owner in slot 1)
      sortedTeams.forEach((team, index) => {
        slots.push({
          slotNumber: index + 1,
          fantasyTeam: team,
          generatingInvite: false
        });
      });

      // Fill remaining slots with empty slots
      for (let i = fantasyTeams.length; i < maxTeams; i++) {
        // Check if there's an active invitation for this slot
        const activeInvite = invitations.find(inv =>
          inv.is_valid && !inv.used_at
        );

        slots.push({
          slotNumber: i + 1,
          inviteCode: activeInvite?.code,
          generatingInvite: false
        });
      }

      setTeamSlots(slots);
    } catch (err) {
      console.error('Error loading team data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  const generateInviteForSlot = async (slotNumber: number) => {
    if (!isOwner) return;

    try {
      // Update loading state for this slot
      setTeamSlots(prev => prev.map(slot =>
        slot.slotNumber === slotNumber
          ? { ...slot, generatingInvite: true }
          : slot
      ));

      const inviteCode = await MultiLeagueApi.generateInviteCode(leagueId);

      // Update the slot with the new invite code
      setTeamSlots(prev => prev.map(slot =>
        slot.slotNumber === slotNumber
          ? { ...slot, inviteCode, generatingInvite: false }
          : slot
      ));

    } catch (err) {
      console.error('Error generating invite:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate invite');

      // Reset loading state
      setTeamSlots(prev => prev.map(slot =>
        slot.slotNumber === slotNumber
          ? { ...slot, generatingInvite: false }
          : slot
      ));
    }
  };

  const copyInviteLink = (inviteCode: string) => {
    const url = `${window.location.origin}/invite/${inviteCode}`;
    navigator.clipboard.writeText(url).then(() => {
      // Could add a toast notification here
    });
  };

  const filledSlots = teamSlots.filter(slot => slot.fantasyTeam).length;
  const remainingSlots = maxTeams - filledSlots;

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 bg-slate-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-700/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-100">Team Management</h3>
            <p className="text-slate-400 text-sm mt-1">
              {filledSlots}/{maxTeams} slots filled • {remainingSlots} remaining
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${filledSlots === maxTeams ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
            <span className="text-sm text-slate-300">
              {filledSlots === maxTeams ? 'Full' : 'Open'}
            </span>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-6 bg-red-600/10 border border-red-600/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="flex-1">
              <p className="text-red-400 text-sm font-medium mb-2">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Team Slots */}
      <div className="p-6">
        <div className="space-y-3">
          {teamSlots.map((slot) => (
            <div
              key={slot.slotNumber}
              className={`border rounded-lg p-4 transition-colors ${
                slot.fantasyTeam
                  ? 'border-green-600/30 bg-green-600/5'
                  : slot.inviteCode
                  ? 'border-blue-600/30 bg-blue-600/5'
                  : 'border-slate-600 bg-slate-800/20'
              }`}
            >
              <div className="flex items-center justify-between">
                {/* Slot Info */}
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      slot.fantasyTeam
                        ? 'bg-green-600 text-white'
                        : slot.inviteCode
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-600 text-slate-300'
                    }`}>
                      {slot.slotNumber}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    {slot.fantasyTeam ? (
                      // Filled slot
                      <div>
                        <h4 className="font-medium text-slate-200">{slot.fantasyTeam.team_name}</h4>
                        <p className="text-sm text-slate-400">
                          {slot.fantasyTeam.manager_email?.split('@')[0] || 'Unknown Manager'}
                        </p>
                      </div>
                    ) : slot.inviteCode ? (
                      // Slot with pending invite
                      <div>
                        <h4 className="font-medium text-blue-300">Invite Sent</h4>
                        <p className="text-sm text-slate-400">
                          Code: <span className="font-mono text-blue-400">{slot.inviteCode}</span>
                        </p>
                      </div>
                    ) : (
                      // Empty slot
                      <div>
                        <h4 className="font-medium text-slate-400">Empty Slot</h4>
                        <p className="text-sm text-slate-500">No team assigned</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                <div className="flex-shrink-0">
                  {slot.fantasyTeam ? (
                    // Team is filled - show status
                    <div className="flex items-center gap-2 px-3 py-1 bg-green-600/20 text-green-400 rounded text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Filled
                    </div>
                  ) : slot.inviteCode ? (
                    // Invite pending - show copy button
                    <button
                      onClick={() => copyInviteLink(slot.inviteCode!)}
                      className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
                    >
                      Copy Link
                    </button>
                  ) : isOwner ? (
                    // Empty slot - show generate invite button
                    <button
                      onClick={() => generateInviteForSlot(slot.slotNumber)}
                      disabled={slot.generatingInvite}
                      className="px-3 py-2 text-sm bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 text-white rounded-md transition-colors disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {slot.generatingInvite && (
                        <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
                      )}
                      {slot.generatingInvite ? 'Generating...' : 'Generate Invite'}
                    </button>
                  ) : (
                    // Not owner - show empty state
                    <div className="px-3 py-1 text-sm text-slate-500">
                      Waiting...
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Help Text */}
        {isOwner && (
          <div className="mt-6 p-4 bg-blue-600/10 border border-blue-600/20 rounded-lg">
            <h4 className="text-sm font-medium text-blue-300 mb-2">How it works</h4>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• Generate invite codes for empty slots</li>
              <li>• Share the invite link with players</li>
              <li>• Players choose their team name when joining</li>
              <li>• Once a slot is filled, it shows the team and manager</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamManagement;