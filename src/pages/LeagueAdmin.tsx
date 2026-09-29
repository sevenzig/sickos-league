import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MultiLeagueApi, FantasyTeam, LeagueMatchup, LeagueJoinCodeInfo } from '../utils/multiLeagueApi';
import { seasonMaxWeek, playoffEndWeek, type PlayoffTeams, type RegularSeasonWeeks } from '../utils/season';
import { getLeagueUrl, getInviteUrl } from '../utils/urlUtils';
import TeamManagement from '../components/league/TeamManagement';
import CommissionerLineups from '../components/league/CommissionerLineups';
import DraftControls from '../components/league/DraftControls';
import DraftSettingsEditor from '../components/league/DraftSettingsEditor';
import MemberManagement from '../components/league/MemberManagement';
import { Panel, Button, Badge, Input, Select } from '@/components/ui';
import { isArchivedSeason } from '../utils/isArchivedSeason';
import ArchivedSeasonBanner from '../components/league/ArchivedSeasonBanner';

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
  draft_mode: 'async' | 'live' | 'offline';
  draft_format: 'snake' | 'linear';
  draft_pick_seconds: number;
  draft_paused: boolean;
  playoff_teams: number;
  standings_tiebreaker: 'record_then_points' | 'points_then_record';
  regular_season_weeks?: number;
}

type ManualPair = { team1: string; team2: string };

function blankManualGrid(weeks = 7): ManualPair[][] {
  return Array.from({ length: weeks }, () =>
    Array.from({ length: 4 }, () => ({ team1: '', team2: '' }))
  );
}

function gridFromSchedule(rows: LeagueMatchup[], weeks = 7): ManualPair[][] {
  const grid = blankManualGrid(weeks);
  for (let week = 1; week <= weeks; week++) {
    const games = rows.filter(m => m.week === week && !m.is_playoff);
    games.slice(0, 4).forEach((game, i) => {
      grid[week - 1][i] = {
        team1: game.fantasy_team1_id,
        team2: game.fantasy_team2_id,
      };
    });
  }
  return grid;
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
  const [joinCodeInfo, setJoinCodeInfo] = useState<LeagueJoinCodeInfo | null>(null);
  const [savingJoinCode, setSavingJoinCode] = useState(false);
  const [joinCodeMessage, setJoinCodeMessage] = useState<string | null>(null);
  const [copiedJoinLink, setCopiedJoinLink] = useState(false);
  const [playoffTeams, setPlayoffTeams] = useState<PlayoffTeams>(4);
  const [regularSeasonWeeks, setRegularSeasonWeeks] = useState<RegularSeasonWeeks>(14);
  const [tiebreaker, setTiebreaker] = useState<'record_then_points' | 'points_then_record'>('record_then_points');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeam[]>([]);
  const [scheduleRows, setScheduleRows] = useState<LeagueMatchup[]>([]);
  const [manualGrid, setManualGrid] = useState<ManualPair[][]>(() => blankManualGrid(7));
  const [savingManual, setSavingManual] = useState(false);
  const [generatingPlayoffs, setGeneratingPlayoffs] = useState(false);

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
      if (leagueDetails) {
        const size = leagueDetails.playoff_teams;
        setPlayoffTeams(size === 5 || size === 6 ? size : 4);
        const rs = leagueDetails.regular_season_weeks;
        setRegularSeasonWeeks(rs === 15 || rs === 16 ? rs : 14);
        setTiebreaker(
          leagueDetails.standings_tiebreaker === 'points_then_record'
            ? 'points_then_record'
            : 'record_then_points'
        );
      }

      // Redirect non-owners to the main league page
      if (leagueDetails && leagueDetails.user_role !== 'owner') {
        navigate(getLeagueUrl(leagueId));
        return;
      }

      try {
        const codeInfo = await MultiLeagueApi.getLeagueJoinCode(leagueId);
        setJoinCodeInfo(codeInfo);
      } catch {
        // join-code may fail on older DBs; ignore
      }

      try {
        const [teams, rows] = await Promise.all([
          MultiLeagueApi.getLeagueFantasyTeams(leagueId),
          MultiLeagueApi.getLeagueSchedule(leagueId).catch(() => [] as LeagueMatchup[]),
        ]);
        setFantasyTeams(teams);
        setScheduleRows(rows);
        setManualGrid(gridFromSchedule(rows, 7));
      } catch {
        // Teams may not be readable yet; the schedule panel stays empty.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load league data');
    } finally {
      setLoading(false);
    }
  };

  const joinLinkAbsolute =
    joinCodeInfo?.code != null
      ? `${window.location.origin}${getInviteUrl(joinCodeInfo.code)}`
      : '';

  const copyJoinLink = () => {
    if (!joinLinkAbsolute) return;
    navigator.clipboard.writeText(joinLinkAbsolute).then(() => {
      setCopiedJoinLink(true);
      setTimeout(() => setCopiedJoinLink(false), 2000);
    });
  };

  const handleGenerateOrRotateJoinCode = async () => {
    if (!leagueId) return;
    const hadCode = Boolean(joinCodeInfo?.code);
    try {
      setSavingJoinCode(true);
      setJoinCodeMessage(null);
      const info = await MultiLeagueApi.generateJoinCode(leagueId);
      setJoinCodeInfo(info);
      setJoinCodeMessage(hadCode ? 'Join code rotated' : 'Join code generated');
    } catch (err) {
      setJoinCodeMessage(err instanceof Error ? err.message : 'Failed to update join code');
    } finally {
      setSavingJoinCode(false);
    }
  };

  const handleRevokeJoinCode = async () => {
    if (!leagueId) return;
    try {
      setSavingJoinCode(true);
      setJoinCodeMessage(null);
      await MultiLeagueApi.revokeJoinCode(leagueId);
      setJoinCodeInfo({ code: null, expires_at: null, status: 'none', invite_path: null });
      setJoinCodeMessage('Join code revoked');
    } catch (err) {
      setJoinCodeMessage(err instanceof Error ? err.message : 'Failed to revoke join code');
    } finally {
      setSavingJoinCode(false);
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
      const rows = await MultiLeagueApi.getLeagueSchedule(leagueId).catch(() => [] as LeagueMatchup[]);
      setScheduleRows(rows);

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

  const bracketLocked = scheduleRows.some(m => m.is_playoff);
  const finalWeek = playoffEndWeek(regularSeasonWeeks, playoffTeams);
  const lastRsWeek = scheduleRows.filter(m => m.week === regularSeasonWeeks && !m.is_playoff);
  const lastRsDone = lastRsWeek.length === 4 && lastRsWeek.every(m => m.is_complete && m.team1_score != null);
  const playoffRows = scheduleRows.filter(m => m.is_playoff);
  const latestPlayoffWeek = playoffRows.reduce((max, m) => Math.max(max, m.week), 0);
  const latestPlayoffDone = latestPlayoffWeek > 0 && playoffRows
    .filter(m => m.week === latestPlayoffWeek)
    .every(m => m.is_complete && m.team1_score != null);
  const championshipExists = scheduleRows.some(m => m.is_playoff && m.week === finalWeek);
  const canGeneratePlayoffs = lastRsDone && !championshipExists && (playoffRows.length === 0 || latestPlayoffDone);

  const handleRegularSeasonChange = (value: RegularSeasonWeeks) => {
    setRegularSeasonWeeks(value);
    if (value === 16 && playoffTeams !== 4) {
      setPlayoffTeams(4);
    }
  };

  const handleSaveSettings = async () => {
    if (!leagueId) return;
    try {
      setSavingSettings(true);
      setSettingsMessage(null);
      setError(null);
      await MultiLeagueApi.setLeagueSeasonSettings(leagueId, playoffTeams, tiebreaker, regularSeasonWeeks);
      setSettingsMessage('Season settings saved');
      await loadLeagueData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save season settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveManual = async () => {
    if (!leagueId) return;
    const matchups = manualGrid.flatMap((pairs, weekIndex) =>
      pairs.map(pair => ({
        week: weekIndex + 1,
        fantasy_team1_id: pair.team1,
        fantasy_team2_id: pair.team2,
      }))
    );
    try {
      setSavingManual(true);
      setError(null);
      await MultiLeagueApi.setLeagueSchedule(leagueId, matchups);
      setScheduleGenerated(true);
      const rows = await MultiLeagueApi.getLeagueSchedule(leagueId);
      setScheduleRows(rows);
      setManualGrid(gridFromSchedule(rows, 7));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSavingManual(false);
    }
  };

  const handleGeneratePlayoffs = async () => {
    if (!leagueId) return;
    try {
      setGeneratingPlayoffs(true);
      setError(null);
      await MultiLeagueApi.generatePlayoffs(leagueId);
      const rows = await MultiLeagueApi.getLeagueSchedule(leagueId);
      setScheduleRows(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate playoffs');
    } finally {
      setGeneratingPlayoffs(false);
    }
  };

  const updatePair = (weekIndex: number, pairIndex: number, side: 'team1' | 'team2', value: string) => {
    setManualGrid(prev => prev.map((week, wi) => (
      wi !== weekIndex ? week : week.map((pair, pi) => (
        pi !== pairIndex ? pair : { ...pair, [side]: value }
      ))
    )));
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

  // Server enforces: exactly 8 teams. Async/live: pre-season Randomize (also
  // auto-generates on draft start). Offline: manual 7-week template only.
  // Number(): pg bigints can arrive as strings ("8" === 8 is false).
  const teamCount = Number(league.fantasy_teams_count);
  const isOffline = league.draft_mode === 'offline';
  const canSetSchedule = teamCount === 8;
  const archivedSeason = isArchivedSeason(league.season);
  const scheduleHint = isOffline
    ? null
    : teamCount !== 8
      ? 'Schedule generation requires 8 fantasy teams'
      : `Randomizes weeks 1–${regularSeasonWeeks}. If you skip this, the schedule is created when the draft starts.`;

  return (
    <div className="space-y-8">
      {archivedSeason && <ArchivedSeasonBanner />}

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
              {!isOffline && (
                <Button
                  onClick={handleGenerateSchedule}
                  disabled={!canSetSchedule || generatingSchedule || archivedSeason}
                  title={scheduleHint ?? undefined}
                >
                  {generatingSchedule && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                  {generatingSchedule ? 'Randomizing...' : 'Randomize schedule'}
                </Button>
              )}
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
            {league.draft_mode === 'offline'
              ? 'Offline'
              : league.draft_at
                ? new Date(league.draft_at).toLocaleString()
                : 'TBD'}
          </div>
          <div className="text-label text-slate-400">
            Draft {league.draft_mode === 'live' ? '(Live)' : league.draft_mode === 'offline' ? '(Offline)' : '(Async)'}
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
          maxWeek={seasonMaxWeek(regularSeasonWeeks, playoffTeams, bracketLocked)}
        />

        <Panel>
          <h2 className="text-title text-slate-50 mb-2">Regular season</h2>
          {isOffline ? (
            <>
              <p className="text-label text-slate-400 mb-4">
                Assign weeks 1–7 (four games each, every team once). Weeks 8–14 repeat the same pairings with home/away flipped
                {regularSeasonWeeks >= 15 ? '; week 15 repeats week 1' : ''}
                {regularSeasonWeeks >= 16 ? '; week 16 repeats week 2' : ''}
                . Saving replaces weeks 1–{regularSeasonWeeks}, including weeks that already have scores.
              </p>
              {!canSetSchedule && (
                <p className="text-caption text-amber-400 mb-4">
                  Manual schedule requires 8 fantasy teams
                </p>
              )}
              <div className="space-y-4">
                {manualGrid.map((pairs, weekIndex) => (
                  <div key={weekIndex} className="space-y-2">
                    <div className="text-label font-medium text-slate-300">Week {weekIndex + 1}</div>
                    {pairs.map((pair, pairIndex) => (
                      <div key={pairIndex} className="flex items-center gap-2">
                        <Select
                          value={pair.team1}
                          onChange={(e) => updatePair(weekIndex, pairIndex, 'team1', e.target.value)}
                          className="flex-1"
                        >
                          <option value="">Team</option>
                          {fantasyTeams.map(team => (
                            <option key={team.id} value={team.id}>{team.team_name}</option>
                          ))}
                        </Select>
                        <span className="text-caption text-slate-500 shrink-0">vs</span>
                        <Select
                          value={pair.team2}
                          onChange={(e) => updatePair(weekIndex, pairIndex, 'team2', e.target.value)}
                          className="flex-1"
                        >
                          <option value="">Team</option>
                          {fantasyTeams.map(team => (
                            <option key={team.id} value={team.id}>{team.team_name}</option>
                          ))}
                        </Select>
                      </div>
                    ))}
                  </div>
                ))}
                <Button type="button" onClick={handleSaveManual} disabled={savingManual || !canSetSchedule || archivedSeason}>
                  {savingManual ? 'Saving...' : 'Save schedule'}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-label text-slate-400 mb-4">
              Weeks 1–{regularSeasonWeeks}, four games each week. Use Randomize above, or let the schedule create when the draft starts. Locked after a week is finalized or a score is recorded.
            </p>
          )}
          {canGeneratePlayoffs && (
            <div className="mt-6 border-t border-slate-700/30 pt-4">
              <p className="text-label text-slate-400 mb-3">
                Week {regularSeasonWeeks} is complete. Generate the next playoff round from the standings.
              </p>
              <Button type="button" onClick={handleGeneratePlayoffs} disabled={generatingPlayoffs || archivedSeason}>
                {generatingPlayoffs ? 'Generating...' : 'Generate playoffs'}
              </Button>
            </div>
          )}
        </Panel>

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
            <div className="space-y-1.5">
              <label htmlFor="adminRegularSeasonWeeks" className="text-label font-medium text-slate-300">
                Regular season ends
              </label>
              <Select
                id="adminRegularSeasonWeeks"
                value={regularSeasonWeeks}
                disabled={bracketLocked}
                onChange={(e) => handleRegularSeasonChange(Number(e.target.value) as RegularSeasonWeeks)}
              >
                <option value={14}>Week 14</option>
                <option value={15}>Week 15</option>
                <option value={16}>Week 16</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="adminPlayoffTeams" className="text-label font-medium text-slate-300">
                Playoff teams
              </label>
              <Select
                id="adminPlayoffTeams"
                value={playoffTeams}
                disabled={bracketLocked}
                onChange={(e) => setPlayoffTeams(Number(e.target.value) as PlayoffTeams)}
              >
                <option value={4}>4 teams (ends week {playoffEndWeek(regularSeasonWeeks, 4)})</option>
                {regularSeasonWeeks !== 16 && (
                  <>
                    <option value={5}>5 teams (ends week {playoffEndWeek(regularSeasonWeeks, 5)})</option>
                    <option value={6}>6 teams (ends week {playoffEndWeek(regularSeasonWeeks, 6)})</option>
                  </>
                )}
              </Select>
              {regularSeasonWeeks === 16 && (
                <p className="text-caption text-slate-500">
                  A 16-week regular season only supports a 4-team playoff (NFL ends at week 18).
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="adminTiebreaker" className="text-label font-medium text-slate-300">
                Standings tiebreaker
              </label>
              <Select
                id="adminTiebreaker"
                value={tiebreaker}
                disabled={bracketLocked}
                onChange={(e) => setTiebreaker(e.target.value as 'record_then_points' | 'points_then_record')}
              >
                <option value="record_then_points">Wins, then points</option>
                <option value="points_then_record">Points, then wins</option>
              </Select>
            </div>
            <div className="md:col-span-2 flex items-center gap-4">
              <Button type="button" onClick={handleSaveSettings} disabled={savingSettings || bracketLocked || archivedSeason}>
                {savingSettings ? 'Saving...' : 'Save season settings'}
              </Button>
              <p className="text-caption text-slate-500">
                {bracketLocked
                  ? 'Locked once the playoff bracket exists.'
                  : 'Editable until the first playoff game is created.'}
              </p>
              {settingsMessage && <p className="text-caption text-green-400">{settingsMessage}</p>}
            </div>
          </div>

          <div className="border-t border-slate-700/30 pt-6 space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-heading text-slate-100">Join code</h3>
                <Badge
                  variant={
                    joinCodeInfo?.status === 'active'
                      ? 'success'
                      : joinCodeInfo?.status === 'expired'
                        ? 'warning'
                        : 'warning'
                  }
                >
                  {joinCodeInfo?.status === 'active'
                    ? 'Active'
                    : joinCodeInfo?.status === 'expired'
                      ? 'Expired'
                      : 'None'}
                </Badge>
              </div>
              <p className="text-label text-slate-400 mb-4">
                Share one invite link. Anyone with the link can join until you revoke it, the draft starts, or the league is full.
              </p>
              {joinCodeInfo?.code && (
                <>
                  <div className="flex flex-col sm:flex-row gap-2 mb-3">
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
                  <p className="text-caption text-slate-500 mb-4 font-mono tracking-wider">
                    Code: {joinCodeInfo.code}
                    {joinCodeInfo.expires_at && (
                      <span className="text-slate-600 ml-2">
                        · expires {new Date(joinCodeInfo.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={handleGenerateOrRotateJoinCode}
                  disabled={savingJoinCode || archivedSeason}
                >
                  {savingJoinCode
                    ? 'Saving...'
                    : joinCodeInfo?.code
                      ? 'Rotate'
                      : 'Generate'}
                </Button>
                {joinCodeInfo?.code && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleRevokeJoinCode}
                    disabled={savingJoinCode || archivedSeason}
                  >
                    Revoke
                  </Button>
                )}
                {joinCodeMessage && (
                  <p
                    className={`text-caption ${
                      joinCodeMessage.toLowerCase().includes('fail')
                        ? 'text-red-400'
                        : 'text-green-400'
                    }`}
                  >
                    {joinCodeMessage}
                  </p>
                )}
              </div>
            </div>
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
