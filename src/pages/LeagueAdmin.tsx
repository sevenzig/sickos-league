import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MultiLeagueApi } from '../utils/multiLeagueApi';
import { getLeagueUrl } from '../utils/urlUtils';
import TeamManagement from '../components/league/TeamManagement';
import CommissionerLineups from '../components/league/CommissionerLineups';
import DraftControls from '../components/league/DraftControls';
import DraftSettingsEditor from '../components/league/DraftSettingsEditor';
import MemberManagement from '../components/league/MemberManagement';

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
  owner_user_id?: string;
  draft_status: 'pending' | 'in_progress' | 'complete';
  draft_mode: 'async' | 'live';
  draft_pick_seconds: number;
  draft_paused: boolean;
}

const LeagueAdmin: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const [league, setLeague] = useState<LeagueDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [scheduleGenerated, setScheduleGenerated] = useState(false);
  const [deletingLeague, setDeletingLeague] = useState(false);

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

      // Redirect non-owners to the main league page
      if (leagueDetails && leagueDetails.user_role !== 'owner') {
        navigate(getLeagueUrl(leagueId));
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load league data');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSchedule = async () => {
    if (!leagueId) return;

    try {
      setGeneratingSchedule(true);
      setError(null);

      console.log('Generating schedule for league:', leagueId);
      const result = await MultiLeagueApi.generateSchedule(leagueId);
      console.log('Schedule generation result:', result);

      setScheduleGenerated(true);

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setScheduleGenerated(false);
      }, 3000);

    } catch (err) {
      console.error('Schedule generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setGeneratingSchedule(false);
    }
  };

  const handleDeleteLeague = async () => {
    if (!leagueId || !league) return;

    const typed = window.prompt(
      `This permanently deletes "${league.name}" and all its data (teams, rosters, schedule, lineups). ` +
      `Type the league name to confirm:`
    );
    if (typed === null) return;
    if (typed.trim() !== league.name) {
      setError('League name did not match - deletion cancelled');
      return;
    }

    try {
      setDeletingLeague(true);
      setError(null);
      await MultiLeagueApi.deleteLeague(leagueId);
      navigate('/my-leagues');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete league');
      setDeletingLeague(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (error && !league) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-medium mb-2">Error Loading Admin Panel</h3>
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

  // Server enforces: exactly 8 teams, completed draft, pre-season only.
  // Number(): pg bigints can arrive as strings ("8" === 8 is false).
  const teamCount = Number(league.fantasy_teams_count);
  const canGenerateSchedule = teamCount === 8 && league.draft_status === 'complete';
  const scheduleHint =
    teamCount !== 8
      ? 'Schedule generation requires 8 fantasy teams'
      : league.draft_status !== 'complete'
        ? 'Schedule generation requires a completed draft'
        : '';

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <nav className="flex items-center space-x-2 text-sm text-slate-400 mb-4">
            <Link to="/my-leagues" className="hover:text-slate-300">My Leagues</Link>
            <span>→</span>
            <Link to={getLeagueUrl(league.id)} className="hover:text-slate-300">{league.name}</Link>
            <span>→</span>
            <span className="text-slate-300">Admin</span>
          </nav>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">{league.name} - Admin Panel</h1>
              <div className="flex items-center space-x-4 mt-2">
                <span className="text-slate-400">Season {league.season}</span>
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-900/50 text-blue-300">
                  Commissioner
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="flex space-x-3">
                <Link
                  to={getLeagueUrl(league.id)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md font-medium transition-colors"
                >
                  View League
                </Link>
                <button
                  onClick={handleGenerateSchedule}
                  disabled={!canGenerateSchedule || generatingSchedule}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-md font-medium transition-colors disabled:cursor-not-allowed flex items-center gap-2"
                  title={scheduleHint}
                >
                  {generatingSchedule && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                  {generatingSchedule ? 'Generating...' : 'Generate Schedule'}
                </button>
              </div>
              {scheduleHint && (
                <p className="text-xs text-amber-400">{scheduleHint}</p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {scheduleGenerated && (
          <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-green-600/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-400 font-medium">Schedule generated successfully!</p>
            </div>
          </div>
        )}

        {/* League Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="text-2xl font-bold text-white">{league.fantasy_teams_count}/8</div>
            <div className="text-slate-400 text-sm">Teams Filled</div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="text-2xl font-bold text-white">{league.teams_started_per_week}</div>
            <div className="text-slate-400 text-sm">Starters/Week</div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="text-2xl font-bold text-white">{league.member_count}</div>
            <div className="text-slate-400 text-sm">Members</div>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="text-2xl font-bold text-white">
              {league.draft_at ? new Date(league.draft_at).toLocaleString() : 'TBD'}
            </div>
            <div className="text-slate-400 text-sm">
              Draft {league.draft_mode === 'live' ? '(Live)' : '(Async)'}
            </div>
          </div>
        </div>

        {/* Admin Sections */}
        <div className="space-y-8">
          {/* Unified Team Management */}
          <TeamManagement
            leagueId={leagueId!}
            isOwner={true}
            maxTeams={8}
            ownerId={league.owner_user_id}
          />

          <DraftSettingsEditor
            leagueId={league.id}
            draftStatus={league.draft_status}
            draftMode={league.draft_mode || 'async'}
            draftAt={league.draft_at}
            draftPickSeconds={league.draft_pick_seconds || 90}
            onSaved={loadLeagueData}
          />

          {/* Draft controls (Phase 5.1: set order, start, jump to draft room) */}
          <DraftControls
            leagueId={league.id}
            draftStatus={league.draft_status}
            draftMode={league.draft_mode || 'async'}
            draftAt={league.draft_at}
            draftPaused={league.draft_paused}
            onDraftStarted={loadLeagueData}
          />

          {/* Member management (Phase 5.1: remove pre-draft, transfer commissioner) */}
          <MemberManagement
            leagueId={league.id}
            ownerUserId={league.owner_user_id}
            draftStatus={league.draft_status}
          />

          {/* Weekly Lineups (Phase 3.2: status, override, finalize) */}
          <CommissionerLineups
            leagueId={league.id}
            startersPerWeek={league.teams_started_per_week}
          />

          {/* League Settings */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">League Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  League Name
                </label>
                <input
                  type="text"
                  value={league.name}
                  readOnly
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">League name editing coming soon</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Teams Started Per Week
                </label>
                <input
                  type="number"
                  value={league.teams_started_per_week}
                  readOnly
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Cannot be changed after creation</p>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-red-900/10 border border-red-700/50 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-400 mb-4">Danger Zone</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-red-300 font-medium mb-2">Delete League</h3>
                <p className="text-slate-400 text-sm mb-3">
                  Permanently delete this league and all associated data. This action cannot be undone.
                </p>
                <button
                  onClick={handleDeleteLeague}
                  disabled={deletingLeague}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
                >
                  {deletingLeague ? 'Deleting...' : 'Delete League'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueAdmin;