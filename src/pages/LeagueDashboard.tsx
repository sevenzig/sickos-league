import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MultiLeagueApi } from '../utils/multiLeagueApi';
import { getLeagueUrl } from '../utils/urlUtils';

interface LeagueDetails {
  id: string;
  name: string;
  season: number;
  teams_started_per_week: number;
  draft_at?: string;
  created_at: string;
  user_role: 'owner' | 'manager';
  member_count: number;
  fantasy_teams_count: number;
}

const LeagueDashboard: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [league, setLeague] = useState<LeagueDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (leagueId) {
      loadLeagueData();
    }
  }, [leagueId]);

  const loadLeagueData = async () => {
    if (!leagueId) return;

    try {
      setLoading(true);
      const leagueDetails = await MultiLeagueApi.getLeagueDetails(leagueId);
      setLeague(leagueDetails);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load league data');
    } finally {
      setLoading(false);
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
  const allSlotsFilled = league.fantasy_teams_count === 8;

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
            <div className="text-2xl font-bold text-white">{league.fantasy_teams_count}/8</div>
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

        {/* Admin Notice for Owners */}
        {isOwner && (
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-blue-300 mb-2">League Administration</h2>
                <p className="text-slate-400">
                  Manage team slots, invitation codes, and league settings in the admin panel.
                </p>
              </div>
              <Link
                to={getLeagueUrl(leagueId!, 'admin')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
              >
                Open Admin Panel
              </Link>
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link
            to={getLeagueUrl(leagueId!)}
            className="bg-slate-800 rounded-lg border border-slate-700 p-4 hover:border-slate-600 transition-colors"
          >
            <h3 className="text-white font-medium mb-2">League Home</h3>
            <p className="text-slate-400 text-sm">View matchups and standings</p>
            <div className="mt-3 flex items-center text-blue-400 text-sm">
              <span>View League →</span>
            </div>
          </Link>

          {isOwner && (
            <Link
              to={getLeagueUrl(leagueId!, 'admin')}
              className="bg-slate-800 rounded-lg border border-slate-700 p-4 hover:border-slate-600 transition-colors"
            >
              <h3 className="text-white font-medium mb-2">Admin Panel</h3>
              <p className="text-slate-400 text-sm">Manage teams and invites</p>
              <div className="mt-3 flex items-center text-blue-400 text-sm">
                <span>Manage →</span>
              </div>
            </Link>
          )}

          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 opacity-50">
            <h3 className="text-white font-medium mb-2">Schedule</h3>
            <p className="text-slate-400 text-sm">View all matchups</p>
            <p className="text-slate-500 text-xs mt-2">Coming Soon</p>
            {/* Future: Link to={getLeagueUrl(leagueId, 'schedule')} */}
          </div>
          <Link
            to={getLeagueUrl(leagueId!, 'lineups')}
            className="bg-slate-800 rounded-lg border border-slate-700 p-4 hover:border-slate-600 transition-colors"
          >
            <h3 className="text-white font-medium mb-2">Lineups</h3>
            <p className="text-slate-400 text-sm">Manage weekly lineups</p>
            <div className="mt-3 flex items-center text-blue-400 text-sm">
              <span>Set Lineup →</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LeagueDashboard;