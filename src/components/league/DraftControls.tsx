import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MultiLeagueApi, FantasyTeam } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';
import { Panel, Button, Badge, Alert } from '@/components/ui';

interface DraftControlsProps {
  leagueId: string;
  draftStatus: 'pending' | 'in_progress' | 'complete';
  draftMode: 'async' | 'live';
  draftAt?: string | null;
  draftPaused?: boolean;
  onDraftStarted: () => void;
}

const DraftControls: React.FC<DraftControlsProps> = ({
  leagueId,
  draftStatus,
  draftMode,
  draftAt,
  draftPaused = false,
  onDraftStarted,
}) => {
  const [order, setOrder] = useState<FantasyTeam[]>([]);
  const [loading, setLoading] = useState(draftStatus === 'pending');
  const [starting, setStarting] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [fillingBots, setFillingBots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderSaved, setOrderSaved] = useState(false);
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (draftStatus !== 'pending') return;
    MultiLeagueApi.getLeagueFantasyTeams(leagueId)
      .then(teams => setOrder(teams))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load teams'))
      .finally(() => setLoading(false));
  }, [leagueId, draftStatus]);

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    setOrder(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setOrderSaved(false);
  };

  const shuffle = () => {
    setOrder(prev => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    setOrderSaved(false);
  };

  const saveOrder = async () => {
    try {
      setSavingOrder(true);
      setError(null);
      await MultiLeagueApi.setDraftOrder(leagueId, order.map(t => t.id));
      setOrderSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft order');
    } finally {
      setSavingOrder(false);
    }
  };

  const startDraft = async () => {
    if (!window.confirm('Start the draft with this order? Joining closes and the order cannot be changed.')) return;
    try {
      setStarting(true);
      setError(null);
      await MultiLeagueApi.setDraftOrder(leagueId, order.map(t => t.id));
      await MultiLeagueApi.startDraft(leagueId, order.map(t => t.id));
      onDraftStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start draft');
    } finally {
      setStarting(false);
    }
  };

  const togglePause = async () => {
    try {
      setPausing(true);
      setError(null);
      if (draftPaused) {
        await MultiLeagueApi.resumeDraft(leagueId);
      } else {
        await MultiLeagueApi.pauseDraft(leagueId);
      }
      onDraftStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pause state');
    } finally {
      setPausing(false);
    }
  };

  const fillBots = async () => {
    try {
      setFillingBots(true);
      setError(null);
      await MultiLeagueApi.fillDraftBots(leagueId);
      const teams = await MultiLeagueApi.getLeagueFantasyTeams(leagueId);
      setOrder(teams);
      setOrderSaved(false);
      onDraftStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fill bots');
    } finally {
      setFillingBots(false);
    }
  };

  const pendingHint =
    draftMode === 'live'
      ? draftAt
        ? `Live draft auto-starts at ${new Date(draftAt).toLocaleString()} using whichever order is saved at that moment — you can re-save it anytime before then.`
        : 'Live draft needs a scheduled time in Draft Settings.'
      : 'Set the round-1 pick order, then start the draft.';

  return (
    <Panel>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-heading text-slate-50">Draft</h2>
          <p className="text-label text-slate-400 mt-1">
            {draftStatus === 'pending' && pendingHint}
            {draftStatus === 'in_progress' && (
              draftMode === 'live'
                ? 'Live draft in progress. Pause freezes the pick clock.'
                : 'The draft is in progress. You can make picks for absent managers in the draft room.'
            )}
            {draftStatus === 'complete' && 'The draft is complete — all 32 NFL teams are rostered.'}
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to={getLeagueUrl(leagueId, 'draft')}>Draft Room</Link>
        </Button>
      </div>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {draftStatus === 'in_progress' && (
        <div className="flex items-center gap-3 mb-2">
          <Badge variant={draftPaused ? 'warning' : 'default'}>
            {draftPaused ? 'Paused' : 'In progress'}
            {draftMode === 'live' ? ' · Live' : ' · Async'}
          </Badge>
          {draftMode === 'live' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={togglePause}
              disabled={pausing}
            >
              {pausing ? '...' : draftPaused ? 'Resume Draft' : 'Pause Draft'}
            </Button>
          )}
        </div>
      )}

      {draftStatus === 'complete' && (
        <Badge variant="success">Complete</Badge>
      )}

      {draftStatus === 'pending' && (
        loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : (
          <>
            <ol className="space-y-2 mb-4">
              {order.map((team, index) => (
                <li
                  key={team.id}
                  className="flex items-center gap-3 bg-slate-900/50 border border-slate-700/50 rounded-md px-3 py-2"
                >
                  <span className="w-6 text-center text-slate-400 font-mono text-caption">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-label font-medium text-white">{team.team_name}</span>
                    {team.manager_email && (
                      <span className="text-caption text-slate-500 ml-2">{team.manager_email.split('@')[0]}</span>
                    )}
                  </div>
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="px-2 py-1 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move up"
                  >↑</button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    className="px-2 py-1 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move down"
                  >↓</button>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={shuffle} disabled={order.length === 0}>
                Randomize Order
              </Button>

              {draftMode === 'live' ? (
                <Button
                  onClick={saveOrder}
                  disabled={savingOrder || order.length !== 8}
                  title={order.length !== 8 ? 'The draft needs exactly 8 fantasy teams' : ''}
                >
                  {savingOrder ? 'Saving...' : orderSaved ? 'Order Saved ✓' : 'Save Draft Order'}
                </Button>
              ) : (
                <Button
                  onClick={startDraft}
                  disabled={starting || order.length !== 8}
                  title={order.length !== 8 ? 'The draft needs exactly 8 fantasy teams' : ''}
                >
                  {starting ? 'Starting...' : 'Start Draft'}
                </Button>
              )}

              {isDev && order.length < 8 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={fillBots}
                  disabled={fillingBots}
                  title="Dev only: fill empty slots with unmanaged Bot teams"
                >
                  {fillingBots ? 'Filling...' : 'Fill with bots'}
                </Button>
              )}

              {order.length !== 8 && (
                <span className="text-label text-slate-500">{order.length}/8 teams joined</span>
              )}
            </div>
          </>
        )
      )}
    </Panel>
  );
};

export default DraftControls;
