import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MultiLeagueApi, TeamSlot } from '../utils/multiLeagueApi';

interface LeagueDetails {
  id: string;
  name: string;
  season: number;
  teams_started_per_week: number;
  draft_at?: string;
  created_at: string;
  user_role: 'owner' | 'manager';
  member_count: number;
  slots_filled: number;
}

const LeagueDashboard: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [league, setLeague] = useState<LeagueDetails | null>(null);
  const [slots, setSlots] = useState<TeamSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState<string | null>(null);

  useEffect(() => {
    if (leagueId) {
      loadLeagueData();
    }
  }, [leagueId]);

  const loadLeagueData = async () => {
    if (!leagueId) return;

    try {
      setLoading(true);
      const [leagueDetails, leagueSlots] = await Promise.all([
        MultiLeagueApi.getLeagueDetails(leagueId),
        MultiLeagueApi.getLeagueSlots(leagueId),
      ]);

      setLeague(leagueDetails);
      setSlots(leagueSlots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load league data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvite = async (slotId: string) => {
    if (!leagueId) return;

    try {
      setInviteLoading(slotId);
      await MultiLeagueApi.createSlotInvite(leagueId, slotId);
      await loadLeagueData(); // Refresh to show new invite
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation');
    } finally {
      setInviteLoading(null);
    }
  };

  const handleRevokeInvite = async (inviteCode: string) => {
    try {
      await MultiLeagueApi.revokeInvite(inviteCode);
      await loadLeagueData(); // Refresh to remove revoked invite
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invitation');
    }
  };

  const handleGenerateSchedule = async () => {
    if (!leagueId) return;

    try {
      await MultiLeagueApi.generateSchedule(leagueId);
      setError(null);
      // Show success message or redirect to schedule
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schedule');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading league...</p>
        </div>
      </div>
    );
  }

  if (error && !league) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-medium mb-2">Error Loading League</h3>
            <p className="text-slate-300">{error}</p>
            <Link
              to="/my-leagues"
              className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Back to My Leagues
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400">League not found</p>
          <Link
            to="/my-leagues"
            className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to My Leagues
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = league.user_role === 'owner';
  const allSlotsFilled = league.slots_filled === 8;

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <nav className="flex items-center space-x-2 text-sm text-slate-400 mb-2">
              <Link to="/my-leagues" className="hover:text-slate-300">My Leagues</Link>
              <span>→</span>
              <span className="text-slate-300">{league.name}</span>
            </nav>
            <h1 className="text-3xl font-bold text-white">{league.name}</h1>
            <div className="flex items-center space-x-4 mt-2">
              <span className="text-slate-400">Season {league.season}</span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                isOwner ? 'bg-blue-900/50 text-blue-300' : 'bg-green-900/50 text-green-300'
              }`}>
                {league.user_role}
              </span>
            </div>
          </div>
          {isOwner && (
            <div className="flex space-x-3">
              <button
                onClick={handleGenerateSchedule}
                disabled={!allSlotsFilled}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-md font-medium transition-colors disabled:cursor-not-allowed"
                title={!allSlotsFilled ? 'Fill all slots before generating schedule' : ''}
              >
                Generate Schedule
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* League Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="text-2xl font-bold text-white">{league.slots_filled}/8</div>
            <div className="text-slate-400 text-sm">Teams Filled</div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="text-2xl font-bold text-white">{league.teams_started_per_week}</div>
            <div className="text-slate-400 text-sm">Starters/Week</div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="text-2xl font-bold text-white">{league.member_count}</div>
            <div className="text-slate-400 text-sm">Members</div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="text-2xl font-bold text-white">
              {league.draft_at ? new Date(league.draft_at).toLocaleDateString() : 'TBD'}
            </div>
            <div className="text-slate-400 text-sm">Draft Date</div>
          </div>
        </div>

        {/* Team Slots */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-6">Team Slots</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {slots.map((slot) => (
              <div
                key={slot.slot_id}
                className="bg-slate-700 rounded-lg border border-slate-600 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center text-white font-medium">
                      {slot.slot_number}
                    </div>
                    <div>
                      <div className="text-white font-medium">
                        {slot.team_name || `Slot ${slot.slot_number}`}
                      </div>
                      {slot.manager_email && (
                        <div className="text-slate-400 text-sm">{slot.manager_email}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {slot.manager_user_id ? (
                      <span className="px-2 py-1 bg-green-900/50 text-green-300 text-xs rounded-full">
                        Filled
                      </span>
                    ) : slot.has_active_invite ? (
                      <span className="px-2 py-1 bg-yellow-900/50 text-yellow-300 text-xs rounded-full">
                        Invited
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-slate-600 text-slate-300 text-xs rounded-full">
                        Open
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {isOwner && (
                  <div className="flex items-center justify-between">
                    {!slot.manager_user_id && !slot.has_active_invite && (
                      <button
                        onClick={() => handleCreateInvite(slot.slot_id)}
                        disabled={inviteLoading === slot.slot_id}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm rounded-md transition-colors disabled:cursor-not-allowed"
                      >
                        {inviteLoading === slot.slot_id ? 'Creating...' : 'Send Invite'}
                      </button>
                    )}

                    {slot.has_active_invite && slot.invite_code && (
                      <div className="flex items-center space-x-2 flex-1">
                        <input
                          type="text"
                          value={`${window.location.origin}/invite/${slot.invite_code}`}
                          readOnly
                          className="flex-1 px-2 py-1 bg-slate-600 text-slate-300 text-xs rounded border-0 focus:outline-none"
                        />
                        <button
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/invite/${slot.invite_code}`)}
                          className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-300 text-xs rounded"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => handleRevokeInvite(slot.invite_code!)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                        >
                          Revoke
                        </button>
                      </div>
                    )}

                    {slot.manager_user_id && (
                      <span className="text-slate-400 text-sm">Occupied</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 opacity-50">
            <h3 className="text-white font-medium mb-2">Schedule</h3>
            <p className="text-slate-400 text-sm">View matchups and results</p>
            <p className="text-slate-500 text-xs mt-2">Coming Soon</p>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 opacity-50">
            <h3 className="text-white font-medium mb-2">Lineups</h3>
            <p className="text-slate-400 text-sm">Manage weekly lineups</p>
            <p className="text-slate-500 text-xs mt-2">Coming Soon</p>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 opacity-50">
            <h3 className="text-white font-medium mb-2">Standings</h3>
            <p className="text-slate-400 text-sm">League standings and stats</p>
            <p className="text-slate-500 text-xs mt-2">Coming Soon</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueDashboard;