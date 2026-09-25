import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MultiLeagueApi, DraftState, FantasyTeam } from '../utils/multiLeagueApi';
import { db } from '../utils/db';
import { getLeagueUrl } from '../utils/urlUtils';
import { useAuth } from '../context/AuthContext';
import { NFL_TEAMS } from '../types';
import { getTeamAbbr, getTeamLogo } from '../utils/teamLogos';
import { Panel, Badge, Button } from '@/components/ui';
import DraftControls from '../components/league/DraftControls';

interface NflTeamRow {
  uuid_id: string;
  name: string;
}

const ASYNC_POLL_MS = 10000;
const LIVE_POLL_MS = 2000;

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function managerLabel(team: FantasyTeam | undefined, fallback: string): string {
  if (!team) return fallback;
  if (!team.manager_user_id) return team.team_name;
  const email = team.manager_email?.split('@')[0];
  return email || team.team_name;
}

/** Two-letter avatar initials for the desktop on-the-clock card. */
function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

function OfflineDraftRoom({
  leagueId,
  draftState,
  isOwner,
  nflTeams,
  error,
  onReload,
}: {
  leagueId: string;
  draftState: DraftState;
  isOwner: boolean;
  nflTeams: NflTeamRow[];
  error: string | null;
  onReload: () => Promise<void>;
}) {
  const [selectedPick, setSelectedPick] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const nflById = useMemo(() => {
    const map = new Map<string, NflTeamRow>();
    for (const team of nflTeams) map.set(team.uuid_id, team);
    return map;
  }, [nflTeams]);

  const nflByName = useMemo(() => {
    const map = new Map<string, NflTeamRow>();
    for (const team of nflTeams) map.set(team.name, team);
    return map;
  }, [nflTeams]);

  const takenIds = useMemo(() => {
    const map = new Map<string, number>();
    if (draftState.draft_status === 'complete') {
      for (const pick of draftState.picks) {
        if (pick.nfl_team_id) map.set(pick.nfl_team_id, pick.pick_number);
      }
      return map;
    }
    for (const [pickNumber, nflId] of Object.entries(assignments)) {
      map.set(nflId, Number(pickNumber));
    }
    return map;
  }, [assignments, draftState]);

  const filledCount = draftState.draft_status === 'complete'
    ? draftState.picks.filter((pick) => pick.nfl_team_id).length
    : Object.keys(assignments).length;
  const canAssign = isOwner && draftState.draft_status === 'in_progress';
  const canFinalize = canAssign && filledCount === 32 && !submitting;

  const assignTeam = (nflId: string) => {
    if (!canAssign || selectedPick == null) return;
    if (assignments[selectedPick] === nflId) {
      setAssignments((prev) => {
        const next = { ...prev };
        delete next[selectedPick];
        return next;
      });
      return;
    }
    if (takenIds.has(nflId)) return;
    setAssignments((prev) => ({ ...prev, [selectedPick]: nflId }));
  };

  const finalize = async () => {
    if (!canFinalize) return;
    if (!window.confirm('Finalize this draft? Rosters lock and cannot be changed.')) return;
    try {
      setSubmitting(true);
      setLocalError(null);
      const picks = Object.entries(assignments).map(([pickNumber, nflId]) => ({
        pick_number: Number(pickNumber),
        nfl_team_id: nflId,
      }));
      await MultiLeagueApi.setOfflineDraftPicks(leagueId, picks);
      setAssignments({});
      setSelectedPick(null);
      await onReload();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to finalize draft');
    } finally {
      setSubmitting(false);
    }
  };

  if (draftState.draft_status === 'pending') {
    return (
      <div className="min-h-[100dvh] bg-slate-900 px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <Link to={getLeagueUrl(leagueId)} className="text-caption text-slate-400 hover:text-slate-200">
            ← League
          </Link>
          {isOwner ? (
            <DraftControls
              leagueId={leagueId}
              draftStatus="pending"
              draftMode="offline"
              onDraftStarted={() => { void onReload(); }}
            />
          ) : (
            <Panel>
              <h1 className="text-heading text-slate-50 mb-1">Offline draft</h1>
              <p className="text-label text-slate-400">
                The commissioner assigns NFL teams after the off-platform draft.
              </p>
            </Panel>
          )}
        </div>
      </div>
    );
  }

  const picks = [...draftState.picks].sort((a, b) => a.pick_number - b.pick_number);
  const shownError = localError || error;

  return (
    <div className="h-[100dvh] bg-slate-900 flex flex-col overflow-hidden">
      <header className="flex-shrink-0 flex items-center gap-2 px-3.5 py-3 lg:px-6 border-b border-slate-800 bg-slate-950">
        <Link to={getLeagueUrl(leagueId)} className="text-caption text-slate-400 hover:text-slate-200 flex-shrink-0">
          ←
        </Link>
        <p className="flex-1 min-w-0 text-label font-semibold text-white truncate">
          {draftState.draft_status === 'complete'
            ? 'Draft complete'
            : 'Commissioner assigning rosters'}
        </p>
        <Badge variant={draftState.draft_status === 'complete' ? 'success' : 'warning'}>
          {filledCount}/32
        </Badge>
        {canAssign && (
          <Button type="button" size="sm" onClick={finalize} disabled={!canFinalize}>
            {submitting ? 'Locking...' : 'Finalize draft'}
          </Button>
        )}
      </header>

      {shownError && (
        <div className="flex-shrink-0 px-3 py-1.5 bg-danger/10 border-b border-danger/30">
          <p className="text-caption text-danger truncate">{shownError}</p>
        </div>
      )}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <p className="flex-shrink-0 text-caption uppercase tracking-wider text-slate-500 font-semibold px-3 pt-3 pb-1.5 lg:px-6">
            {canAssign
              ? selectedPick == null
                ? 'Select an empty pick, then a team'
                : `Pick ${selectedPick} — tap a team`
              : 'Assigned teams'}
          </p>
          <div className="flex-1 min-h-0 px-2.5 pb-3 lg:px-4">
            <div className="h-full min-h-0 grid grid-cols-4 grid-rows-8 gap-1.5 lg:grid-cols-8 lg:grid-rows-4 lg:gap-2">
              {NFL_TEAMS.map((teamName) => {
                const nfl = nflByName.get(teamName);
                const takenPick = nfl ? takenIds.get(nfl.uuid_id) : undefined;
                const selected = nfl != null && selectedPick != null && assignments[selectedPick] === nfl.uuid_id;
                const logo = getTeamLogo(teamName);
                const abbr = getTeamAbbr(teamName);
                return (
                  <button
                    key={teamName}
                    type="button"
                    disabled={!canAssign || selectedPick == null || (takenPick != null && !selected)}
                    onClick={() => nfl && assignTeam(nfl.uuid_id)}
                    aria-label={takenPick ? `${teamName}, pick ${takenPick}` : teamName}
                    className={`relative min-h-0 min-w-0 w-full h-full flex items-center justify-center rounded-lg border overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? 'bg-emerald-950/50 border-emerald-400 ring-1 ring-emerald-400/50'
                        : takenPick
                          ? 'bg-slate-950 border-slate-800 opacity-45'
                          : 'bg-slate-800/90 border-slate-700 hover:border-slate-500 active:bg-slate-700'
                    } disabled:cursor-default`}
                  >
                    {logo ? (
                      <img
                        src={logo}
                        alt=""
                        className={`w-[60%] h-[60%] object-contain pointer-events-none ${takenPick ? 'grayscale' : ''}`}
                        draggable={false}
                      />
                    ) : (
                      <span className={`text-caption ${takenPick ? 'text-slate-600' : 'text-slate-300'}`}>{abbr}</span>
                    )}
                    {takenPick != null && (
                      <span className="absolute top-0.5 right-0.5 min-w-[1.1rem] h-4 px-0.5 flex items-center justify-center rounded-full bg-slate-900 border border-slate-600 text-[10px] font-bold text-slate-300 leading-none">
                        {takenPick}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="hidden lg:flex w-80 flex-shrink-0 border-l border-slate-800 flex-col min-h-0 bg-slate-950/50">
          <p className="flex-shrink-0 px-4 pt-3 pb-2 text-caption uppercase tracking-wide text-slate-400 font-semibold">
            Draft order
          </p>
          <ol className="flex-1 min-h-0 overflow-y-auto overscroll-contain" aria-label="Offline draft picks 1 through 32">
            {picks.map((pick) => {
              const localId = assignments[pick.pick_number];
              const nflId = draftState.draft_status === 'complete' ? pick.nfl_team_id : localId;
              const nflName = nflId ? nflById.get(nflId)?.name ?? pick.nfl_team_name : null;
              const logo = nflName ? getTeamLogo(nflName) : null;
              const isSelected = selectedPick === pick.pick_number;
              return (
                <li key={pick.pick_number}>
                  <button
                    type="button"
                    disabled={!canAssign}
                    onClick={() => setSelectedPick(pick.pick_number)}
                    className={`w-full flex items-center gap-2 px-4 py-1.5 text-label leading-tight text-left ${
                      isSelected ? 'bg-primary/10 border-l-2 border-primary' : ''
                    } disabled:cursor-default`}
                  >
                    <span className="font-mono text-caption text-slate-500 w-5 flex-shrink-0 text-right tabular-nums">
                      {pick.pick_number}
                    </span>
                    <div className="w-7 h-7 flex-shrink-0 bg-slate-800 rounded-md overflow-hidden flex items-center justify-center">
                      {logo ? (
                        <img src={logo} alt="" className="w-full h-full object-contain" draggable={false} />
                      ) : (
                        <span className="text-caption text-slate-600">—</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate ${isSelected ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>
                        {pick.fantasy_team_name}
                      </p>
                      <p className="truncate text-caption text-slate-500">
                        {nflName ? getTeamAbbr(nflName) : '—'}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>

      <div className="lg:hidden flex-shrink-0 max-h-40 overflow-y-auto border-t border-slate-800">
        <div className="grid grid-cols-2">
          {picks.map((pick) => {
            const localId = assignments[pick.pick_number];
            const nflId = draftState.draft_status === 'complete' ? pick.nfl_team_id : localId;
            const nflName = nflId ? nflById.get(nflId)?.name ?? pick.nfl_team_name : null;
            const isSelected = selectedPick === pick.pick_number;
            return (
              <button
                key={pick.pick_number}
                type="button"
                disabled={!canAssign}
                onClick={() => setSelectedPick(pick.pick_number)}
                className={`px-3 py-2 text-left text-caption border-b border-slate-800 ${
                  isSelected ? 'bg-primary/10 text-white' : 'text-slate-400'
                }`}
              >
                {pick.pick_number}. {pick.fantasy_team_name}
                {nflName ? ` · ${getTeamAbbr(nflName)}` : ''}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const LeagueDraft: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();

  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [nflTeams, setNflTeams] = useState<NflTeamRow[]>([]);
  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeam[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPickNotice, setAutoPickNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const pollRef = useRef<number | null>(null);
  const clockRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const currentPickRef = useRef<HTMLLIElement | null>(null);
  const myFantasyTeamIdRef = useRef<string | null>(null);
  const autoPickTimeoutRef = useRef<number | null>(null);
  const originalTitleRef = useRef(document.title);

  const loadDraftState = useCallback(async () => {
    if (!leagueId) return;
    try {
      const state = await MultiLeagueApi.getDraftState(leagueId);
      if (!mountedRef.current) return;
      setDraftState((prev) => {
        const myId = myFantasyTeamIdRef.current;
        const prevPick = prev?.draft_current_pick;
        if (myId && prevPick != null && state.draft_current_pick !== prevPick) {
          const completed = state.picks.find((p) => p.pick_number === prevPick);
          if (completed?.fantasy_team_id === myId && completed.is_auto && completed.nfl_team_name) {
            setAutoPickNotice(`Auto-picked ${completed.nfl_team_name} — you missed the clock.`);
            if (autoPickTimeoutRef.current != null) window.clearTimeout(autoPickTimeoutRef.current);
            autoPickTimeoutRef.current = window.setTimeout(() => setAutoPickNotice(null), 6000);
          }
        }
        return state;
      });
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load draft state');
    }
  }, [leagueId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (autoPickTimeoutRef.current != null) window.clearTimeout(autoPickTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!leagueId) return;
      try {
        setLoading(true);
        const [details, teamsResult, fantasy] = await Promise.all([
          MultiLeagueApi.getLeagueDetails(leagueId),
          db.from('teams').select('uuid_id, name').eq('is_nfl', true).order('name'),
          MultiLeagueApi.getLeagueFantasyTeams(leagueId),
        ]);
        if (cancelled) return;
        if (details) {
          setIsOwner(details.user_role === 'owner');
        }
        if (teamsResult.error) throw teamsResult.error;
        setNflTeams(teamsResult.data || []);
        setFantasyTeams(fantasy || []);
        await loadDraftState();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load draft');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [leagueId, loadDraftState]);

  const pendingAsyncNoJob =
    draftState?.draft_status === 'pending' && draftState.draft_mode === 'async' && !isOwner;

  const isLive = draftState?.draft_mode === 'live';
  const roomOpensAt = draftState?.room_opens_at ? new Date(draftState.room_opens_at).getTime() : null;
  const draftAtMs = draftState?.draft_at ? new Date(draftState.draft_at).getTime() : null;
  const roomClosed =
    isLive &&
    draftState?.draft_status === 'pending' &&
    roomOpensAt != null &&
    nowMs < roomOpensAt;

  useEffect(() => {
    clockRef.current = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      if (clockRef.current != null) {
        window.clearInterval(clockRef.current);
        clockRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const shouldPoll =
      draftState?.draft_status === 'in_progress' ||
      (isLive && draftState?.draft_status === 'pending' && !roomClosed);

    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (shouldPoll) {
      const interval = isLive ? LIVE_POLL_MS : ASYNC_POLL_MS;
      pollRef.current = window.setInterval(loadDraftState, interval);
    }

    const onFocus = () => {
      void loadDraftState();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      window.removeEventListener('focus', onFocus);
    };
  }, [draftState?.draft_status, isLive, roomClosed, loadDraftState]);

  const takenInfo = useMemo(() => {
    const map = new Map<string, { fantasyTeam: string; pickNumber: number }>();
    for (const pick of draftState?.picks || []) {
      if (pick.nfl_team_id) {
        map.set(pick.nfl_team_id, {
          fantasyTeam: pick.fantasy_team_name,
          pickNumber: pick.pick_number,
        });
      }
    }
    return map;
  }, [draftState]);

  const nflTeamsByName = useMemo(() => {
    const map = new Map<string, NflTeamRow>();
    for (const t of nflTeams) map.set(t.name, t);
    return map;
  }, [nflTeams]);

  const allPicksOrdered = useMemo(
    () => [...(draftState?.picks || [])].sort((a, b) => a.pick_number - b.pick_number),
    [draftState]
  );

  const fantasyById = useMemo(() => {
    const map = new Map<string, FantasyTeam>();
    for (const t of fantasyTeams) map.set(t.id, t);
    return map;
  }, [fantasyTeams]);

  const onClockRoster = useMemo(() => {
    const teamId = draftState?.on_clock?.fantasy_team_id;
    if (!teamId) return [];
    return allPicksOrdered.filter((p) => p.fantasy_team_id === teamId && p.nfl_team_name);
  }, [draftState?.on_clock?.fantasy_team_id, allPicksOrdered]);

  const myFantasyTeamId = useMemo(
    () => (user ? fantasyTeams.find((t) => t.manager_user_id === user.id)?.id ?? null : null),
    [fantasyTeams, user]
  );

  useEffect(() => {
    myFantasyTeamIdRef.current = myFantasyTeamId;
  }, [myFantasyTeamId]);

  const myRoster = useMemo(() => {
    if (!myFantasyTeamId) return [];
    return allPicksOrdered.filter((p) => p.fantasy_team_id === myFantasyTeamId && p.nfl_team_name);
  }, [myFantasyTeamId, allPicksOrdered]);

  /** Viewport-fitting board: 4×8 mobile, 8×4 desktop. */
  const renderTeamGrid = () => (
    <div className="h-full min-h-0 grid grid-cols-4 grid-rows-8 gap-1.5 lg:grid-cols-8 lg:grid-rows-4 lg:gap-2">
      {NFL_TEAMS.map((teamName) => {
        const nflTeam = nflTeamsByName.get(teamName);
        const taken = nflTeam ? takenInfo.get(nflTeam.uuid_id) : undefined;
        const isSelected = selectedTeam === teamName;
        const abbr = getTeamAbbr(teamName);
        const logo = getTeamLogo(teamName);
        const label = taken
          ? `${teamName}, pick ${taken.pickNumber}, ${taken.fantasyTeam}`
          : isSelected
            ? `${teamName}, selected`
            : teamName;

        return (
          <button
            key={teamName}
            type="button"
            onClick={() => setSelectedTeam(isSelected ? null : teamName)}
            aria-label={label}
            aria-pressed={isSelected}
            title={label}
            className={`relative min-h-0 min-w-0 w-full h-full flex items-center justify-center rounded-lg border overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              taken
                ? 'bg-slate-950 border-slate-800 opacity-45'
                : isSelected
                  ? 'bg-emerald-950/50 border-emerald-400 ring-1 ring-emerald-400/50'
                  : 'bg-slate-800/90 border-slate-700 hover:border-slate-500 active:bg-slate-700'
            }`}
          >
            {logo ? (
              <img
                src={logo}
                alt=""
                className={`w-[60%] h-[60%] object-contain pointer-events-none ${taken ? 'grayscale' : ''}`}
                draggable={false}
              />
            ) : (
              <span className={`text-caption ${taken ? 'text-slate-600' : 'text-slate-300'}`}>{abbr}</span>
            )}
            {taken && (
              <span className="absolute top-0.5 right-0.5 min-w-[1.1rem] h-4 px-0.5 flex items-center justify-center rounded-full bg-slate-900 border border-slate-600 text-[10px] font-bold text-slate-300 leading-none"> {/* design-token-ok: pick badge in dense draft grid */}
                {taken.pickNumber}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderPickSlots = (roster: typeof onClockRoster) => (
    <div className="mt-1 lg:mt-2 grid grid-cols-4 gap-px lg:gap-2">
      {Array.from({ length: 4 }, (_, i) => {
        const pick = roster[i];
        const logo = pick?.nfl_team_name ? getTeamLogo(pick.nfl_team_name) : null;
        return (
          <div
            key={i}
            className="w-5 h-5 sm:w-6 sm:h-6 lg:w-10 lg:h-10 bg-slate-800 lg:bg-slate-800/80 border border-slate-700/60 lg:rounded-lg flex items-center justify-center overflow-hidden"
            title={pick?.nfl_team_name || 'Empty'}
          >
            {logo ? (
              <img src={logo} alt="" className="w-full h-full object-contain" draggable={false} />
            ) : (
              <span className="text-[8px] text-slate-600">·</span> // design-token-ok: empty-slot dot in draft grid - visual only
            )}
          </div>
        );
      })}
    </div>
  );

  useEffect(() => {
    currentPickRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [draftState?.draft_current_pick]);

  const onClockIsBot =
    draftState?.on_clock != null && draftState.on_clock.manager_user_id == null;

  const isMyTurn =
    draftState?.draft_status === 'in_progress' &&
    !draftState.draft_paused &&
    !!user &&
    draftState.on_clock?.manager_user_id === user.id;

  useEffect(() => {
    document.title = isMyTurn ? '⏰ Your pick — Bad QB League' : originalTitleRef.current;
    return () => {
      document.title = originalTitleRef.current;
    };
  }, [isMyTurn]);

  const canPick =
    (isMyTurn || (isOwner && draftState?.draft_status === 'in_progress' && !onClockIsBot)) &&
    !draftState?.draft_paused;

  const selectedNflTeam = selectedTeam ? nflTeamsByName.get(selectedTeam) : undefined;
  const selectedTaken = selectedNflTeam ? takenInfo.get(selectedNflTeam.uuid_id) : undefined;
  const selectedSelectable = !!selectedNflTeam && !selectedTaken && canPick && !submitting;

  const pickDeadlineMs = draftState?.draft_pick_deadline
    ? new Date(draftState.draft_pick_deadline).getTime()
    : null;
  const pickRemainingMs =
    isLive && draftState?.draft_status === 'in_progress' && !draftState.draft_paused && pickDeadlineMs
      ? pickDeadlineMs - nowMs
      : null;

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

  const handlePauseToggle = async () => {
    if (!leagueId || !draftState) return;
    try {
      setSubmitting(true);
      setError(null);
      if (draftState.draft_paused) {
        await MultiLeagueApi.resumeDraft(leagueId);
      } else {
        await MultiLeagueApi.pauseDraft(leagueId);
      }
      await loadDraftState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pause');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPick = async () => {
    const teamId = selectedNflTeam?.uuid_id;
    if (!leagueId || !teamId) return;
    try {
      setSubmitting(true);
      setError(null);
      if (isMyTurn) {
        await MultiLeagueApi.makeDraftPick(leagueId, teamId);
      } else {
        await MultiLeagueApi.makeDraftPickFor(leagueId, teamId);
      }
      setSelectedTeam(null);
      await loadDraftState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make pick');
      await loadDraftState();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[100dvh] bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (draftState?.draft_mode === 'offline' && leagueId) {
    return (
      <OfflineDraftRoom
        leagueId={leagueId}
        draftState={draftState}
        isOwner={isOwner}
        nflTeams={nflTeams}
        error={error}
        onReload={loadDraftState}
      />
    );
  }

  if (!draftState) {
    return (
      <div className="h-[100dvh] bg-slate-900 flex items-center justify-center px-4">
        <Panel className="max-w-sm w-full text-center">
          <p className="text-red-400 text-label mb-3">{error || 'Draft state unavailable'}</p>
          <Link to="/my-leagues" className="text-blue-400 text-label hover:underline">
            Back to My Leagues
          </Link>
        </Panel>
      </div>
    );
  }

  if (roomClosed && roomOpensAt != null) {
    return (
      <div className="h-[100dvh] bg-slate-900 flex flex-col items-center justify-center px-4">
        <p className="text-slate-400 text-sm mb-2">Room opens in</p>
        <p className="text-3xl font-mono text-white">{formatCountdown(roomOpensAt - nowMs)}</p>
        {draftAtMs && (
          <p className="text-slate-500 text-xs mt-2">Starts {new Date(draftAtMs).toLocaleString()}</p>
        )}
        <Link to={getLeagueUrl(leagueId!)} className="mt-4 text-sm text-slate-400 hover:text-white">
          ← League
        </Link>
      </div>
    );
  }

  const statusLabel =
    draftState.draft_status === 'complete'
      ? 'Complete'
      : draftState.draft_paused
        ? 'Paused'
        : draftState.draft_status === 'pending'
          ? isLive
            ? draftAtMs && nowMs < draftAtMs
              ? `Starts ${formatCountdown(draftAtMs - nowMs)}`
              : 'Lobby'
            : 'Not started'
          : isMyTurn
            ? "You're up"
            : onClockIsBot
              ? `${draftState.on_clock?.team_name} (bot)`
              : draftState.on_clock?.team_name || '—';

  const onClockName = draftState.on_clock
    ? managerLabel(
        fantasyById.get(draftState.on_clock.fantasy_team_id),
        draftState.on_clock.team_name
      )
    : statusLabel;

  const stagedMeta = !selectedTeam
    ? 'Tap a team below'
    : selectedTaken
      ? `Taken · pick ${selectedTaken.pickNumber}`
      : selectedSelectable
        ? isMyTurn
          ? 'Ready to draft'
          : `For ${draftState.on_clock?.team_name}`
        : canPick
          ? 'Available'
          : draftState.draft_paused
            ? 'Draft paused'
            : 'Waiting for pick';

  return (
    <div className="h-[100dvh] bg-slate-900 flex flex-col overflow-hidden">
      {/* Top bar — option 5 */}
      <header className="flex-shrink-0 flex items-center gap-2 px-3.5 py-3 lg:px-6 border-b border-slate-800 bg-slate-950">
        <Link
          to={getLeagueUrl(leagueId!)}
          className="text-caption text-slate-400 hover:text-slate-200 flex-shrink-0"
        >
          ←
        </Link>
        <p className="flex-1 min-w-0 text-label font-semibold text-white truncate">
          {draftState.draft_status === 'in_progress'
            ? `${onClockName}'s pick`
            : statusLabel}
        </p>
        {isMyTurn && (
          <span className="text-[10px] font-bold tracking-wide bg-emerald-500 text-emerald-950 px-1.5 py-0.5 rounded flex-shrink-0"> {/* design-token-ok: YOU badge chip matches layout option 5 */}
            YOU
          </span>
        )}
        {isLive &&
          draftState.draft_status === 'in_progress' &&
          !draftState.draft_paused &&
          pickRemainingMs != null &&
          !onClockIsBot && (
            <span
              className={`font-mono tabular-nums text-label font-bold flex-shrink-0 ${
                pickRemainingMs <= 10000 ? 'text-danger' : 'text-amber-400'
              }`}
              aria-live="polite"
            >
              {formatCountdown(pickRemainingMs)}
            </span>
          )}
        {isLive && (
          <Badge variant="danger" className="flex-shrink-0">
            LIVE
          </Badge>
        )}
        {isOwner && isLive && draftState.draft_status === 'in_progress' && (
          <Button type="button" variant="secondary" size="sm" onClick={handlePauseToggle} disabled={submitting}>
            {draftState.draft_paused ? 'Resume' : 'Pause'}
          </Button>
        )}
        {draftState.draft_status === 'pending' && !isLive && isOwner && (
          <Button type="button" variant="primary" size="sm" onClick={handleStartDraft} disabled={submitting}>
            Start
          </Button>
        )}
      </header>

      {error && (
        <div className="flex-shrink-0 px-3 py-1.5 bg-danger/10 border-b border-danger/30">
          <p className="text-caption text-danger truncate">{error}</p>
        </div>
      )}
      {autoPickNotice && (
        <div className="flex-shrink-0 px-3 py-1.5 bg-warning/10 border-b border-warning/30">
          <p className="text-caption text-warning truncate">{autoPickNotice}</p>
        </div>
      )}

      {pendingAsyncNoJob ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <p className="text-label text-slate-300 mb-1">The draft hasn't started yet.</p>
          <p className="text-caption text-slate-500">Waiting for the commissioner to start the draft.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Staged card — option 5 */}
            <div className="flex-shrink-0 mx-3 mt-2 mb-2 lg:mx-6 rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-800/80 to-slate-900 p-3.5 flex flex-col items-center gap-2">
              <div
                className={`w-28 h-28 overflow-hidden flex items-center justify-center bg-slate-800 ${
                  selectedTeam && !selectedTaken
                    ? 'border-[3px] border-emerald-400'
                    : 'border-[3px] border-slate-600'
                }`}
              >
                {selectedTeam && getTeamLogo(selectedTeam) ? (
                  <img
                    src={getTeamLogo(selectedTeam)!}
                    alt=""
                    className={`w-[72%] h-[72%] object-contain ${selectedTaken ? 'grayscale opacity-60' : ''}`}
                    draggable={false}
                  />
                ) : selectedTeam ? (
                  <span className="text-3xl font-black text-white">{getTeamAbbr(selectedTeam)}</span>
                ) : (
                  <span className="text-caption text-slate-500 px-2 text-center">Tap a team</span>
                )}
              </div>
              <p className="text-heading font-bold text-center m-0">
                {selectedTeam || 'Select a team'}
              </p>
              <p className="text-caption text-slate-400 m-0">{stagedMeta}</p>
              <button
                type="button"
                disabled={!selectedSelectable}
                onClick={handleConfirmPick}
                className={`w-full h-11 rounded-xl text-label font-bold mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selectedSelectable
                    ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                {submitting
                  ? 'Drafting…'
                  : selectedTaken
                    ? 'Taken'
                    : selectedTeam
                      ? 'Draft this team'
                      : 'Draft this team'}
              </button>
            </div>

            {/* Labeled board — option 5 */}
            <div className="flex-1 min-h-0 flex flex-col px-2.5 pb-3 lg:px-4">
              <p className="text-caption uppercase tracking-wider text-slate-500 font-semibold mb-1.5 px-1">
                Tap to select
              </p>
              <div className="flex-1 min-h-0">{renderTeamGrid()}</div>
            </div>
          </div>

          {/* Desktop history sidebar */}
          <aside className="hidden lg:flex w-80 flex-shrink-0 border-l border-slate-800 flex-col min-h-0 bg-slate-950/50">
            <div
              className={`flex-shrink-0 px-4 py-4 border-b border-slate-800 ${
                isMyTurn ? 'bg-success/10' : ''
              }`}
            >
              <p className="text-caption uppercase tracking-wide text-slate-400 font-semibold mb-2">
                On the clock
              </p>
              <div className="flex items-center gap-3">
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-caption font-bold border-2 ${
                    isMyTurn
                      ? 'bg-success/20 border-success text-success'
                      : 'bg-slate-800 border-slate-600 text-slate-300'
                  }`}
                >
                  {draftState.on_clock ? initialsOf(onClockName) : '—'}
                </div>
                <p className="text-label text-white truncate min-w-0 flex-1">
                  {draftState.on_clock ? onClockName : '—'}
                  {onClockIsBot && <span className="text-slate-500"> · bot</span>}
                </p>
              </div>
              {renderPickSlots(onClockRoster)}
            </div>

            {myFantasyTeamId && (
              <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800">
                <p className="text-caption uppercase tracking-wide text-slate-400 font-semibold mb-2">
                  Your picks
                </p>
                {renderPickSlots(myRoster)}
              </div>
            )}

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <p className="flex-shrink-0 px-4 pt-3 pb-2 text-caption uppercase tracking-wide text-slate-400 font-semibold">
                Draft History
              </p>
              <ol
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
                aria-label="Draft history picks 1 through 32"
              >
                {allPicksOrdered.length === 0 ? (
                  <li className="px-4 py-3 text-caption text-slate-500">Start the draft to see order</li>
                ) : (
                  allPicksOrdered.map((pick) => {
                    const isCurrent = pick.pick_number === draftState.draft_current_pick;
                    const isPast = !!pick.nfl_team_id;
                    const logo = pick.nfl_team_name ? getTeamLogo(pick.nfl_team_name) : null;
                    const who = managerLabel(
                      fantasyById.get(pick.fantasy_team_id),
                      pick.fantasy_team_name
                    );
                    return (
                      <li
                        key={pick.pick_number}
                        ref={isCurrent ? currentPickRef : undefined}
                        className={`flex items-center gap-2 px-4 py-1.5 text-label leading-tight ${
                          isCurrent
                            ? 'bg-primary/10 border-l-2 border-primary'
                            : isPast
                              ? 'opacity-90'
                              : 'text-slate-500'
                        }`}
                      >
                        <span className="font-mono text-caption text-slate-500 w-5 flex-shrink-0 text-right tabular-nums">
                          {pick.pick_number}
                        </span>
                        <div className="w-7 h-7 flex-shrink-0 bg-slate-800 rounded-md overflow-hidden flex items-center justify-center">
                          {logo ? (
                            <img src={logo} alt="" className="w-full h-full object-contain" draggable={false} />
                          ) : (
                            <span className="text-caption text-slate-600">—</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate ${isCurrent ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>
                            {who}
                            {isCurrent && <span className="text-primary font-normal"> ←</span>}
                          </p>
                          <p className="truncate text-caption text-slate-500">
                            {pick.nfl_team_name
                              ? getTeamAbbr(pick.nfl_team_name)
                              : isCurrent
                                ? 'picking…'
                                : '—'}
                          </p>
                        </div>
                      </li>
                    );
                  })
                )}
              </ol>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default LeagueDraft;
