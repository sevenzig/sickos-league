import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MultiLeagueApi } from '../utils/multiLeagueApi';
import { getLeagueUrl, getLeagueJoinUrl } from '../utils/urlUtils';
import TeamManagement from '../components/league/TeamManagement';
import CommissionerLineups from '../components/league/CommissionerLineups';
import DraftControls from '../components/league/DraftControls';
import DraftSettingsEditor from '../components/league/DraftSettingsEditor';
import MemberManagement from '../components/league/MemberManagement';
import { Panel, Button, Badge, Input } from '@/components/ui';

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
  draft_format: 'snake' | 'linear';
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
  const [hasJoinPassword, setHasJoinPassword] = useState(false);
  const [newJoinPassword, setNewJoinPassword] = useState('');
  const [confirmJoinPassword, setConfirmJoinPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [copiedJoinLink, setCopiedJoinLink] = useState(false);

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

      try {
        const joinInfo = await MultiLeagueApi.getLeagueJoinInfo(leagueId);
        setHasJoinPassword(joinInfo.has_password);
      } catch {
        // join-info may fail on older DBs; ignore
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load league data');
    } finally {
      setLoading(false);
    }
  };

  const joinLinkAbsolute = league
    ? `${window.location.origin}${getLeagueJoinUrl(league.id)}`
    : '';

  const copyJoinLink = () => {
    if (!joinLinkAbsolute) return;
    navigator.clipboard.writeText(joinLinkAbsolute).then(() => {
      setCopiedJoinLink(true);
      setTimeout(() => setCopiedJoinLink(false), 2000);
    });
  };

  const handleRotatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueId) return;
    if (newJoinPassword.length < 6) {
      setPasswordMessage('Password must be at least 6 characters');
      return;
    }
    if (newJoinPassword !== confirmJoinPassword) {
      setPasswordMessage('Passwords do not match');
      return;
    }
    try {
      setSavingPassword(true);
      setPasswordMessage(null);
      await MultiLeagueApi.setLeagueJoinPassword(leagueId, newJoinPassword);
      setHasJoinPassword(true);
      setNewJoinPassword('');
      setConfirmJoinPassword('');
      setPasswordMessage('Join password updated');
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSavingPassword(false);
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
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (error && !league) {
    return (
      <div className="flex items-center justify-center py-24">
        <Panel className="max-w-md w-full text-center">
          <h3 className="text-heading text-red-400 mb-2">Error Loading Admin Panel</h3>
          <p className="text-slate-300 mb-4">{error}</p>
          <Button asChild>
            <Link to="/my-leagues">Back to My Leagues</Link>
          </Button>
        </Panel>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-slate-400 mb-4">League not found</p>
          <Button asChild variant="secondary">
            <Link to="/my-leagues">Back to My Leagues</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Server enforces: exactly 8 teams, pre-season only. Draft start also
  // auto-generates if the commissioner skips this step.
  // Number(): pg bigints can arrive as strings ("8" === 8 is false).
  const teamCount = Number(league.fantasy_teams_count);
  const canGenerateSchedule = teamCount === 8;
  const scheduleHint =
    teamCount !== 8
      ? 'Schedule generation requires 8 fantasy teams'
      : 'Randomizes matchups. If you skip this, the schedule is created when the draft starts.';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <nav className="flex items-center space-x-2 text-label text-slate-400 mb-4">
          <Link to="/my-leagues" className="hover:text-slate-300">My Leagues</Link>
          <span>→</span>
          <Link to={getLeagueUrl(league.id)} className="hover:text-slate-300">{league.name}</Link>
          <span>→</span>
          <span className="text-slate-300">Admin</span>
        </nav>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-display text-slate-50">{league.name} — Admin</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-body text-slate-400">Season {league.season}</span>
              <Badge variant="primary">Commissioner</Badge>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-3">
              <Button asChild variant="secondary">
                <Link to={getLeagueUrl(league.id)}>View League</Link>
              </Button>
              <Button
                onClick={handleGenerateSchedule}
                disabled={!canGenerateSchedule || generatingSchedule}
                title={scheduleHint}
              >
                {generatingSchedule && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {generatingSchedule ? 'Generating...' : 'Generate Schedule'}
              </Button>
            </div>
            {scheduleHint && (
              <p className={`text-caption ${teamCount !== 8 ? 'text-amber-400' : 'text-slate-400'}`}>
                {scheduleHint}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {scheduleGenerated && (
        <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Panel>
          <div className="text-display text-slate-50">{league.fantasy_teams_count}/8</div>
          <div className="text-label text-slate-400">Teams Filled</div>
        </Panel>
        <Panel>
          <div className="text-display text-slate-50">{league.teams_started_per_week}</div>
          <div className="text-label text-slate-400">Starters/Week</div>
        </Panel>
        <Panel>
          <div className="text-display text-slate-50">{league.member_count}</div>
          <div className="text-label text-slate-400">Members</div>
        </Panel>
        <Panel>
          <div className="text-heading text-slate-50 leading-snug">
            {league.draft_at ? new Date(league.draft_at).toLocaleString() : 'TBD'}
          </div>
          <div className="text-label text-slate-400">
            Draft {league.draft_mode === 'live' ? '(Live)' : '(Async)'}
          </div>
        </Panel>
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
          draftFormat={league.draft_format || 'snake'}
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
        <Panel>
          <h2 className="text-title text-slate-50 mb-4">League Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-1.5">
              <label className="text-label font-medium text-slate-300">
                League Name
              </label>
              <Input
                type="text"
                value={league.name}
                readOnly
              />
              <p className="text-caption text-slate-500">League name editing coming soon</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-label font-medium text-slate-300">
                Teams Started Per Week
              </label>
              <Input
                type="number"
                value={league.teams_started_per_week}
                readOnly
              />
              <p className="text-caption text-slate-500">Cannot be changed after creation</p>
            </div>
          </div>

          <div className="border-t border-slate-700/30 pt-6 space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-heading text-slate-100">Join Link & Password</h3>
                <Badge variant={hasJoinPassword ? 'success' : 'warning'}>
                  {hasJoinPassword ? 'Password set' : 'No password'}
                </Badge>
              </div>
              <p className="text-label text-slate-400 mb-4">
                Share this link and the join password. Players enter the password once; rotating it does not remove existing members.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <Input
                  type="text"
                  value={joinLinkAbsolute}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button type="button" variant="secondary" onClick={copyJoinLink}>
                  {copiedJoinLink ? 'Copied' : 'Copy Link'}
                </Button>
              </div>
            </div>

            <form onSubmit={handleRotatePassword} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="adminJoinPassword" className="text-label font-medium text-slate-300">
                  {hasJoinPassword ? 'New Password' : 'Set Password'}
                </label>
                <Input
                  type="password"
                  id="adminJoinPassword"
                  value={newJoinPassword}
                  onChange={(e) => setNewJoinPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="adminJoinPasswordConfirm" className="text-label font-medium text-slate-300">
                  Confirm Password
                </label>
                <Input
                  type="password"
                  id="adminJoinPasswordConfirm"
                  value={confirmJoinPassword}
                  onChange={(e) => setConfirmJoinPassword(e.target.value)}
                  placeholder="Re-enter password"
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="md:col-span-2 flex items-center gap-4">
                <Button type="submit" disabled={savingPassword || !newJoinPassword}>
                  {savingPassword ? 'Saving...' : hasJoinPassword ? 'Rotate Password' : 'Set Password'}
                </Button>
                {passwordMessage && (
                  <p className={`text-caption ${passwordMessage.includes('updated') || passwordMessage.includes('set') ? 'text-green-400' : 'text-red-400'}`}>
                    {passwordMessage}
                  </p>
                )}
              </div>
            </form>
          </div>
        </Panel>

        {/* Danger Zone */}
        <div className="bg-red-900/10 border border-red-700/50 rounded-panel p-6">
          <h2 className="text-title text-red-400 mb-4">Danger Zone</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-heading text-red-300 mb-2">Delete League</h3>
              <p className="text-body text-slate-400 mb-3">
                Permanently delete this league and all associated data. This action cannot be undone.
              </p>
              <Button
                variant="destructive"
                onClick={handleDeleteLeague}
                disabled={deletingLeague}
              >
                {deletingLeague ? 'Deleting...' : 'Delete League'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueAdmin;
