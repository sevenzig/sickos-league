import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';
import { getDevLeagueUrl } from '../../utils/urlUtils';

type Mode = 'async' | 'live';
type Step = string;

/**
 * Dev-only sandbox: one click → league + 7 bots + draft started → draft room.
 * Reuses real RPCs so you exercise the same path as production.
 */
const FeatDraftSandbox: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [lastLeagueId, setLastLeagueId] = useState<string | null>(null);

  const log = (msg: string) => setSteps((prev) => [...prev, msg]);

  const launch = async (mode: Mode) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setSteps([]);
    try {
      const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
      const name = `Draft Sandbox ${mode} ${stamp}`;

      log(`Creating ${mode} league…`);
      // Live: draft_at in the past so lobby is open; sandbox starts immediately after bots.
      const draftAt = mode === 'live' ? new Date(Date.now() - 5_000).toISOString() : null;

      const leagueId = await MultiLeagueApi.createLeague(name, 2025, 1, {
        ownerTeamName: 'You',
        draftMode: mode,
        draftAt,
        draftPickSeconds: mode === 'live' ? 30 : 90,
      });
      setLastLeagueId(leagueId);
      log(`League ${leagueId.slice(0, 8)}…`);

      log('Filling bots…');
      const added = await MultiLeagueApi.fillDraftBots(leagueId);
      log(`Added ${added} bots`);

      const teams = await MultiLeagueApi.getLeagueFantasyTeams(leagueId);
      if (teams.length !== 8) {
        throw new Error(`Expected 8 teams, got ${teams.length}`);
      }

      const ownerTeam =
        teams.find((t) => t.manager_user_id === user.id) || teams.find((t) => t.manager_user_id) || teams[0];
      const bots = teams.filter((t) => t.id !== ownerTeam.id && !t.manager_user_id);
      const others = teams.filter((t) => t.id !== ownerTeam.id && t.manager_user_id);
      // You first, then unmanaged bots (existing fill_draft_bots), then any other humans
      const order = [ownerTeam.id, ...bots.map((t) => t.id), ...others.map((t) => t.id)];
      if (order.length !== 8) {
        throw new Error(`Draft order length ${order.length}, expected 8`);
      }
      log(`Order: you + ${bots.length} bots${others.length ? ` + ${others.length} others` : ''}`);

      if (mode === 'async') {
        log('Starting async draft…');
        await MultiLeagueApi.startDraft(leagueId, order);
        log('Draft in progress');
      } else {
        log('Saving live order + starting now (bots auto-pick on their turns)…');
        await MultiLeagueApi.setDraftOrder(leagueId, order);
        await MultiLeagueApi.startDraft(leagueId, order);
        log('Live draft in progress with bots');
      }

      navigate(getDevLeagueUrl(leagueId, 'draft'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setBusy(false);
    }
  };

  if (!import.meta.env.DEV) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <p className="text-slate-400">Draft sandbox is only available in development builds.</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold text-white">Draft sandbox</h1>
          <p className="text-slate-400 text-sm">Sign in first, then come back to /dev/feat_draft.</p>
          <Link to="/" className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <p className="text-amber-400/80 text-xs uppercase tracking-wide mb-1">Dev only</p>
          <h1 className="text-2xl font-semibold">Draft sandbox</h1>
          <p className="text-slate-400 text-sm mt-1">
            Creates a throwaway league, fills 7 unmanaged bots via fill_draft_bots, starts the draft
            (you pick 1st; bots auto-pick on their turns), opens the draft room. Also:{' '}
            <Link to="/dev/draft-layouts" className="text-blue-400 hover:underline">
              compare draft layouts
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void launch('async')}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 rounded-md font-medium"
          >
            {busy ? 'Working…' : 'Launch async draft'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void launch('live')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded-md font-medium"
          >
            {busy ? 'Working…' : 'Launch live draft + bots'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {steps.length > 0 && (
          <ol className="font-mono text-xs text-slate-400 space-y-1 list-decimal list-inside">
            {steps.map((s, i) => (
              <li key={`${i}-${s}`}>{s}</li>
            ))}
          </ol>
        )}

        {lastLeagueId && (
          <p className="text-sm text-slate-500">
            Last league:{' '}
            <Link className="text-blue-400 hover:underline" to={getDevLeagueUrl(lastLeagueId)}>
              home
            </Link>
            {' · '}
            <Link className="text-blue-400 hover:underline" to={getDevLeagueUrl(lastLeagueId, 'draft')}>
              draft
            </Link>
            {' · '}
            <Link className="text-blue-400 hover:underline" to={getDevLeagueUrl(lastLeagueId, 'lineups')}>
              lineups
            </Link>
            {' · '}
            <Link className="text-blue-400 hover:underline" to={getDevLeagueUrl(lastLeagueId, 'schedule')}>
              schedule
            </Link>
            {' · '}
            <Link className="text-blue-400 hover:underline" to={getDevLeagueUrl(lastLeagueId, 'standings')}>
              standings
            </Link>
            {' · '}
            <Link className="text-blue-400 hover:underline" to={getDevLeagueUrl(lastLeagueId, 'admin')}>
              admin
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default FeatDraftSandbox;
