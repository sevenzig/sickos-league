import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MultiLeagueApi, DraftState } from '../utils/multiLeagueApi';
import { db } from '../utils/db';
import { getLeagueUrl } from '../utils/urlUtils';
import { useAuth } from '../context/AuthContext';
import TeamLogo from '../components/TeamLogo';
import { NFL_TEAMS } from '../types';

interface NflTeamRow {
  uuid_id: string;
  name: string;
}

const POLL_INTERVAL_MS = 10000;

const LeagueDraft: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();

  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [nflTeams, setNflTeams] = useState<NflTeamRow[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [selectedNflTeamId, setSelectedNflTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const loadDraftState = useCallback(async () => {
    if (!leagueId) return;
    try {
      const state = await MultiLeagueApi.getDraftState(leagueId);
      setDraftState(state);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load draft state');
    }
  }, [leagueId]);

  // Initial load: league details, NFL teams, draft state
  useEffect(() => {
    const load = async () => {
      if (!leagueId) return;
      try {
        setLoading(true);
        const [details, teamsResult] = await Promise.all([
          MultiLeagueApi.getLeagueDetails(leagueId),
          db.from('teams').select('uuid_id, name').eq('is_nfl', true).order('name'),
        ]);
        if (details) {
          setIsOwner(details.user_role === 'owner');
          setLeagueName(details.name);
        }
        if (teamsResult.error) throw teamsResult.error;
        setNflTeams(teamsResult.data || []);
        await loadDraftState();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load draft');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [leagueId, loadDraftState]);

  // Poll while the draft is in progress; refresh on window focus
  useEffect(() => {
    const inProgress = draftState?.draft_status === 'in_progress';
    if (inProgress) {
      pollRef.current = window.setInterval(loadDraftState, POLL_INTERVAL_MS);
    }
    const onFocus = () => loadDraftState();
    window.addEventListener('focus', onFocus);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [draftState?.draft_status, loadDraftState]);

  const takenByNflTeamId = useMemo(() => {
    const map = new Map<string, string>(); // nfl_team_id -> fantasy team name
    for (const pick of draftState?.picks || []) {
      if (pick.nfl_team_id) map.set(pick.nfl_team_id, pick.fantasy_team_name);
    }
    return map;
  }, [draftState]);

  const nflTeamsByName = useMemo(() => {
    const map = new Map<string, NflTeamRow>();
    for (const t of nflTeams) map.set(t.name, t);
    return map;
  }, [nflTeams]);

  const madePicks = useMemo(
    () => (draftState?.picks || []).filter((p) => p.nfl_team_id).sort((a, b) => b.pick_number - a.pick_number),
    [draftState]
  );

  const isMyTurn =
    draftState?.draft_status === 'in_progress' &&
    !!user &&
    draftState.on_clock?.manager_user_id === user.id;
  const canPick = isMyTurn || (isOwner && draftState?.draft_status === 'in_progress');

  const handleStartDraft = async () => {
    if (!leagueId) return;
    try {
      setSubmitting(true);
      setError(null);
      await MultiLeagueApi.startDraft(leagueId);
      await loadDraftState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start draft');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPick = async () => {
    if (!leagueId || !selectedNflTeamId) return;
    try {
      setSubmitting(true);
      setError(null);
      if (isMyTurn) {
        await MultiLeagueApi.makeDraftPick(leagueId, selectedNflTeamId);
      } else {
        await MultiLeagueApi.makeDraftPickFor(leagueId, selectedNflTeamId);
      }
      setSelectedNflTeamId(null);
      await loadDraftState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make pick');
      // Someone may have picked first; refresh the board
      await loadDraftState();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading draft room...</p>
        </div>
      </div>
    );
  }

  if (!draftState) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-medium mb-2">Error Loading Draft</h3>
            <p className="text-slate-300">{error || 'Draft state unavailable'}</p>
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

  const selectedTeamName = selectedNflTeamId
    ? nflTeams.find((t) => t.uuid_id === selectedNflTeamId)?.name
    : null;

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <nav className="flex items-center space-x-2 text-sm text-slate-400 mb-2">
            <Link to="/my-leagues" className="hover:text-slate-300">My Leagues</Link>
            <span>→</span>
            <Link to={getLeagueUrl(leagueId!)} className="hover:text-slate-300">{leagueName || 'League'}</Link>
            <span>→</span>
            <span className="text-slate-300">Draft</span>
          </nav>
          <h1 className="text-3xl font-bold text-white">Draft Room</h1>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Status banner */}
        {draftState.draft_status === 'pending' && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-2">Draft has not started</h2>
            <p className="text-slate-400 mb-4">
              Once all 8 teams have joined, the commissioner can start the draft. Draft order is randomized.
            </p>
            {isOwner && (
              <button
                onClick={handleStartDraft}
                disabled={submitting}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-md font-medium transition-colors"
              >
                {submitting ? 'Starting...' : 'Start Draft'}
              </button>
            )}
          </div>
        )}

        {draftState.draft_status === 'in_progress' && draftState.on_clock && (
          <div
            className={`rounded-lg p-4 mb-6 border ${
              isMyTurn
                ? 'bg-green-900/30 border-green-600'
                : 'bg-blue-900/20 border-blue-700/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-lg font-semibold ${isMyTurn ? 'text-green-300' : 'text-blue-300'}`}>
                  {isMyTurn
                    ? "You're on the clock!"
                    : `On the clock: ${draftState.on_clock.team_name}`}
                </p>
                <p className="text-slate-400 text-sm">
                  Pick {draftState.draft_current_pick} of 32
                </p>
              </div>
              {canPick && selectedTeamName && (
                <button
                  onClick={handleConfirmPick}
                  disabled={submitting}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-md font-medium transition-colors"
                >
                  {submitting
                    ? 'Drafting...'
                    : isMyTurn
                      ? `Draft ${selectedTeamName}`
                      : `Draft ${selectedTeamName} for ${draftState.on_clock.team_name}`}
                </button>
              )}
            </div>
          </div>
        )}

        {draftState.draft_status === 'complete' && (
          <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 mb-6">
            <p className="text-green-400 font-medium">
              Draft complete! All 32 NFL teams have been assigned.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Draft board */}
          <div className="lg:col-span-3">
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Draft Board</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {NFL_TEAMS.map((teamName) => {
                  const nflTeam = nflTeamsByName.get(teamName);
                  const takenBy = nflTeam ? takenByNflTeamId.get(nflTeam.uuid_id) : undefined;
                  const isSelected = nflTeam?.uuid_id === selectedNflTeamId;
                  const selectable = !!nflTeam && !takenBy && canPick && !submitting;

                  return (
                    <button
                      key={teamName}
                      onClick={() => selectable && setSelectedNflTeamId(isSelected ? null : nflTeam!.uuid_id)}
                      disabled={!selectable}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        takenBy
                          ? 'bg-slate-900/60 border-slate-700 opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'bg-green-900/40 border-green-500'
                            : selectable
                              ? 'bg-slate-700/50 border-slate-600 hover:border-blue-500 cursor-pointer'
                              : 'bg-slate-700/50 border-slate-600 cursor-default'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <TeamLogo teamName={teamName} size="md" />
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{teamName}</p>
                          {takenBy && (
                            <p className="text-slate-500 text-xs truncate">{takenBy}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pick history sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Pick History</h2>
              {madePicks.length === 0 ? (
                <p className="text-slate-500 text-sm">No picks yet</p>
              ) : (
                <ul className="space-y-3 max-h-[32rem] overflow-y-auto">
                  {madePicks.map((pick) => (
                    <li key={pick.pick_number} className="flex items-center gap-3">
                      <span className="text-slate-500 text-xs w-10 flex-shrink-0">
                        {pick.round}.{((pick.pick_number - 1) % 8) + 1}
                      </span>
                      {pick.nfl_team_name && <TeamLogo teamName={pick.nfl_team_name} size="sm" />}
                      <div className="min-w-0">
                        <p className="text-white text-sm truncate">{pick.nfl_team_name}</p>
                        <p className="text-slate-500 text-xs truncate">{pick.fantasy_team_name}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Upcoming picks */}
            {draftState.draft_status === 'in_progress' && (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 mt-6">
                <h2 className="text-lg font-semibold text-white mb-4">Up Next</h2>
                <ul className="space-y-2">
                  {draftState.picks
                    .filter((p) => !p.nfl_team_id)
                    .slice(0, 5)
                    .map((pick) => (
                      <li key={pick.pick_number} className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">Pick {pick.pick_number}</span>
                        <span className="text-slate-300 truncate ml-2">{pick.fantasy_team_name}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueDraft;
