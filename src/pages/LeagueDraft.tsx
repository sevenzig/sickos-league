import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MultiLeagueApi, DraftState, FantasyTeam } from '../utils/multiLeagueApi';
import { db } from '../utils/db';
import { getLeagueUrl } from '../utils/urlUtils';
import { useAuth } from '../context/AuthContext';
import { NFL_TEAMS } from '../types';
import { getTeamAbbr, getTeamLogo } from '../utils/teamLogos';

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

const LeagueDraft: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();

  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [nflTeams, setNflTeams] = useState<NflTeamRow[]>([]);
  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeam[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [selectedNflTeamId, setSelectedNflTeamId] = useState<string | null>(null);
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
              <span className="text-[8px] text-slate-600">·</span>
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

  if (!draftState) {
    return (
      <div className="h-[100dvh] bg-slate-900 flex items-center justify-center px-4">
        <div className="bg-red-900/20 border border-red-700 rounded p-4 max-w-sm w-full text-center">
          <p className="text-red-400 text-sm mb-3">{error || 'Draft state unavailable'}</p>
          <Link to="/my-leagues" className="text-blue-400 text-sm hover:underline">
            Back to My Leagues
          </Link>
        </div>
      </div>
    );
  }

  const selectedTeamName = selectedNflTeamId
    ? nflTeams.find((t) => t.uuid_id === selectedNflTeamId)?.name
    : null;

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

  return (
    <div className="h-[100dvh] bg-slate-900 flex flex-col overflow-hidden">
      {/* Compact toolbar on mobile; a proper header bar on desktop */}
      <div className="flex-shrink-0 flex items-center gap-1.5 lg:gap-3 px-2 py-1 lg:px-6 lg:py-3 border-b border-slate-800 lg:border-slate-700/50 lg:bg-slate-900/60 text-xs lg:text-sm">
        <Link
          to={getLeagueUrl(leagueId!)}
          className="text-slate-500 hover:text-slate-300 px-1 flex-shrink-0"
        >
          ← League
        </Link>
        <span
          className={`min-w-0 flex-1 truncate font-medium lg:text-base ${
            isMyTurn
              ? 'text-green-300'
              : draftState.draft_paused
                ? 'text-orange-300'
                : draftState.draft_status === 'complete'
                  ? 'text-green-400'
                  : 'text-slate-200'
          }`}
        >
          {statusLabel}
          {draftState.draft_status === 'in_progress' && (
            <span className="text-slate-500 font-normal">
              {' '}
              · {draftState.draft_current_pick}/32
            </span>
          )}
          {isLive && (
            <span className="ml-1 text-[10px] text-blue-400 font-normal">LIVE</span>
          )}
        </span>
        {isLive &&
          draftState.draft_status === 'in_progress' &&
          !draftState.draft_paused &&
          pickRemainingMs != null &&
          !onClockIsBot && (
            <span
              className={`font-mono tabular-nums text-sm lg:text-lg flex-shrink-0 ${
                pickRemainingMs <= 10000 ? 'text-red-400' : 'text-white'
              }`}
              aria-live="polite"
            >
              {formatCountdown(pickRemainingMs)}
            </span>
          )}
        {isOwner && isLive && draftState.draft_status === 'in_progress' && (
          <button
            type="button"
            onClick={handlePauseToggle}
            disabled={submitting}
            className="px-1.5 py-0.5 lg:px-3 lg:py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded lg:rounded-md disabled:opacity-50"
          >
            {draftState.draft_paused ? 'Resume' : 'Pause'}
          </button>
        )}
        {draftState.draft_status === 'pending' && !isLive && isOwner && (
          <button
            type="button"
            onClick={handleStartDraft}
            disabled={submitting}
            className="px-1.5 py-0.5 lg:px-3 lg:py-1.5 bg-green-700 hover:bg-green-600 text-white rounded lg:rounded-md disabled:opacity-50"
          >
            Start
          </button>
        )}
      </div>

      {error && (
        <div className="flex-shrink-0 px-2 py-1 bg-red-950/80 border-b border-red-800">
          <p className="text-red-400 text-[11px] truncate">{error}</p>
        </div>
      )}

      {autoPickNotice && (
        <div className="flex-shrink-0 px-2 py-1 bg-amber-950/80 border-b border-amber-800">
          <p className="text-amber-300 text-[11px] truncate">{autoPickNotice}</p>
        </div>
      )}

      {pendingAsyncNoJob ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <p className="text-slate-300 text-sm mb-1">The draft hasn't started yet.</p>
          <p className="text-slate-500 text-xs">Waiting for the commissioner to start the draft.</p>
        </div>
      ) : (
      <div className="flex-1 min-h-0 flex gap-0 overflow-hidden">
        {/* 4×8 board — compact on mobile, larger showcase tiles on desktop */}
        <section className="flex-1 min-w-0 overflow-y-auto p-2 lg:p-8 lg:bg-slate-900/40" aria-label="Draft board">
          <p className="hidden lg:block text-xs uppercase tracking-wide text-slate-400 font-semibold mb-4 text-center">
            Available Teams
          </p>
          <div className="grid grid-cols-4 gap-1.5 lg:gap-3 w-fit mx-auto">
            {NFL_TEAMS.map((teamName) => {
              const nflTeam = nflTeamsByName.get(teamName);
              const taken = nflTeam ? takenInfo.get(nflTeam.uuid_id) : undefined;
              const isSelected = nflTeam?.uuid_id === selectedNflTeamId;
              const selectable = !!nflTeam && !taken && canPick && !submitting;
              const abbr = getTeamAbbr(teamName);
              const label = taken
                ? `${teamName}, pick ${taken.pickNumber}, ${taken.fantasyTeam}`
                : isSelected
                  ? `${teamName}, selected`
                  : teamName;
              const logo = getTeamLogo(teamName);

              return (
                <button
                  key={teamName}
                  type="button"
                  onClick={() =>
                    selectable && setSelectedNflTeamId(isSelected ? null : nflTeam!.uuid_id)
                  }
                  disabled={!selectable}
                  aria-label={label}
                  title={label}
                  className={`relative w-12 h-12 lg:w-20 lg:h-20 flex items-center justify-center rounded-sm lg:rounded-xl border overflow-hidden transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 ${
                    taken
                      ? 'bg-slate-950 border-slate-800 opacity-55 lg:opacity-70 cursor-not-allowed'
                      : isSelected
                        ? 'bg-green-900/50 border-green-500 lg:ring-2 lg:ring-green-400/50 lg:shadow-lg lg:shadow-green-500/20'
                        : selectable
                          ? 'bg-slate-800 border-slate-600 hover:border-blue-400 active:bg-slate-700 lg:hover:-translate-y-1 lg:hover:shadow-xl lg:hover:shadow-black/40 lg:hover:border-blue-400'
                          : 'bg-slate-800/70 border-slate-700 cursor-default'
                  }`}
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt=""
                      className={`w-[80%] h-[80%] object-contain pointer-events-none ${
                        taken ? 'lg:grayscale' : ''
                      }`}
                      draggable={false}
                    />
                  ) : (
                    <span className="text-[9px] lg:text-xs font-bold text-slate-400">{abbr}</span>
                  )}
                  {taken && (
                    <span className="hidden lg:flex absolute -top-1.5 -right-1.5 w-5 h-5 items-center justify-center rounded-full bg-slate-900 border border-slate-600 text-[10px] font-bold text-slate-300">
                      {taken.pickNumber}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Right: on-clock + pick history (order already baked into slots 1–32) */}
        <aside className="w-28 sm:w-[12.5rem] lg:w-96 flex-shrink-0 border-l border-slate-800 lg:border-slate-700/50 flex flex-col min-h-0 bg-slate-950/40 lg:bg-gradient-to-b lg:from-slate-800/60 lg:to-slate-900/60 lg:backdrop-blur-xl">
          <div
            className={`flex-shrink-0 px-1.5 py-1.5 lg:px-5 lg:py-5 border-b border-slate-800 lg:border-slate-700/50 ${
              isMyTurn ? 'lg:bg-green-500/10' : ''
            }`}
          >
            <p className="text-[9px] lg:text-xs uppercase tracking-wide text-slate-500 lg:text-slate-400 lg:font-semibold leading-none mb-0.5 lg:mb-2">
              On the clock
            </p>
            <div className="flex items-center gap-2 lg:gap-3">
              <div
                className={`hidden lg:flex flex-shrink-0 w-12 h-12 rounded-full items-center justify-center text-sm font-bold border-2 ${
                  isMyTurn
                    ? 'bg-green-500/20 border-green-400 text-green-300'
                    : 'bg-slate-800 border-slate-600 text-slate-300'
                }`}
              >
                {draftState.on_clock
                  ? initialsOf(
                      managerLabel(
                        fantasyById.get(draftState.on_clock.fantasy_team_id),
                        draftState.on_clock.team_name
                      )
                    )
                  : '—'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base lg:text-2xl font-bold text-white truncate leading-tight">
                  {draftState.on_clock
                    ? managerLabel(
                        fantasyById.get(draftState.on_clock.fantasy_team_id),
                        draftState.on_clock.team_name
                      )
                    : '—'}
                  {onClockIsBot && <span className="text-slate-500 text-sm lg:text-base font-normal"> · bot</span>}
                </p>
                {isLive && pickRemainingMs != null && !onClockIsBot && (
                  <p
                    className={`hidden lg:block font-mono text-xl font-bold tabular-nums mt-0.5 ${
                      pickRemainingMs <= 10000 ? 'text-red-400' : 'text-white'
                    }`}
                  >
                    {formatCountdown(pickRemainingMs)}
                  </p>
                )}
              </div>
            </div>
            {renderPickSlots(onClockRoster)}
          </div>

          {myFantasyTeamId && (
            <div className="flex-shrink-0 px-1.5 py-1.5 lg:px-5 lg:py-4 border-b border-slate-800 lg:border-slate-700/50">
              <p className="text-[9px] lg:text-xs uppercase tracking-wide text-slate-500 lg:text-slate-400 lg:font-semibold leading-none mb-0.5 lg:mb-2">
                Your picks
              </p>
              {renderPickSlots(myRoster)}
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <p className="hidden lg:block flex-shrink-0 px-5 pt-4 pb-2 text-xs uppercase tracking-wide text-slate-400 font-semibold">
              Draft History
            </p>
            <ol
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
              aria-label="Draft history picks 1 through 32"
            >
              {allPicksOrdered.length === 0 ? (
                <li className="px-1.5 py-2 lg:px-5 lg:py-3 text-[10px] lg:text-sm text-slate-500">
                  Start the draft to see order
                </li>
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
                      className={`flex items-center gap-0.5 lg:gap-3 px-1 py-px lg:px-5 lg:py-2 text-[10px] lg:text-sm leading-tight ${
                        isCurrent
                          ? 'bg-blue-900/40 lg:bg-blue-500/10 lg:border-l-2 lg:border-blue-400'
                          : isPast
                            ? 'opacity-90'
                            : 'text-slate-500'
                      }`}
                    >
                      <span className="font-mono text-slate-500 w-3.5 lg:w-5 flex-shrink-0 text-right tabular-nums">
                        {pick.pick_number}
                      </span>
                      <div className="w-5 h-5 lg:w-9 lg:h-9 flex-shrink-0 bg-slate-800 lg:rounded-md overflow-hidden flex items-center justify-center">
                        {logo ? (
                          <img src={logo} alt="" className="w-full h-full object-contain" draggable={false} />
                        ) : (
                          <span className="text-[7px] text-slate-600">—</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pl-0.5 lg:pl-1">
                        <p className={`truncate ${isCurrent ? 'text-blue-100 font-semibold' : 'text-slate-300 lg:text-slate-200'}`}>
                          {who}
                          {isCurrent && <span className="text-blue-400 font-normal"> ←</span>}
                        </p>
                        <p className="truncate text-slate-500 text-[9px] lg:text-xs">
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

      {canPick && selectedTeamName && (
        <div className="flex-shrink-0 px-2 pb-2 pt-1 lg:px-8 lg:pb-6 lg:pt-3 border-t border-slate-800 lg:border-slate-700/50">
          <button
            type="button"
            onClick={handleConfirmPick}
            disabled={submitting}
            className="w-full lg:max-w-md lg:mx-auto lg:flex py-2 lg:py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded lg:rounded-lg font-medium text-sm lg:text-base lg:shadow-lg lg:shadow-green-900/40"
          >
            {submitting
              ? 'Drafting...'
              : isMyTurn
                ? `Draft ${selectedTeamName}`
                : `Draft ${selectedTeamName} for ${draftState.on_clock?.team_name}`}
          </button>
        </div>
      )}
    </div>
  );
};

export default LeagueDraft;
