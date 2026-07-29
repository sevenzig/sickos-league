import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MultiLeagueApi, FantasyTeam } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';

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
      : 'Set the round-1 pick order, then start the snake draft.';

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Draft</h2>
          <p className="text-slate-400 text-sm mt-1">
            {draftStatus === 'pending' && pendingHint}
            {draftStatus === 'in_progress' && (
              draftMode === 'live'
                ? 'Live draft in progress. Pause freezes the pick clock.'
                : 'The draft is in progress. You can make picks for absent managers in the draft room.'
            )}
            {draftStatus === 'complete' && 'The draft is complete - all 32 NFL teams are rostered.'}
          </p>
        </div>
        <Link
          to={getLeagueUrl(leagueId, 'draft')}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md font-medium transition-colors flex-shrink-0"
        >
          Draft Room
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {draftStatus === 'in_progress' && (
        <div className="flex items-center gap-3 mb-2">
          <span className={`inline-block px-3 py-1 text-sm rounded-full ${
            draftPaused
              ? 'bg-orange-900/40 text-orange-300'
              : 'bg-yellow-900/40 text-yellow-300'
          }`}>
            {draftPaused ? 'Paused' : 'In progress'}
            {draftMode === 'live' ? ' · Live' : ' · Async'}
          </span>
          {draftMode === 'live' && (
            <button
              type="button"
              onClick={togglePause}
              disabled={pausing}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-600 text-white rounded-md text-sm font-medium transition-colors"
            >
              {pausing ? '...' : draftPaused ? 'Resume Draft' : 'Pause Draft'}
            </button>
          )}
        </div>
      )}

      {draftStatus === 'complete' && (
        <span className="inline-block px-3 py-1 bg-green-900/40 text-green-300 text-sm rounded-full">
          Complete
        </span>
      )}

      {draftStatus === 'pending' && (
        loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            <ol className="space-y-2 mb-4">
              {order.map((team, index) => (
                <li
                  key={team.id}
                  className="flex items-center gap-3 bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2"
                >
                  <span className="w-6 text-center text-slate-400 font-mono text-sm">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm font-medium">{team.team_name}</span>
                    {team.manager_email && (
                      <span className="text-slate-500 text-xs ml-2">{team.manager_email.split('@')[0]}</span>
                    )}
                  </div>
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="px-2 py-1 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    className="px-2 py-1 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={shuffle}
                disabled={order.length === 0}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md font-medium transition-colors"
              >
                Randomize Order
              </button>

              {draftMode === 'live' ? (
                <button
                  onClick={saveOrder}
                  disabled={savingOrder || order.length !== 8}
                  title={order.length !== 8 ? 'The draft needs exactly 8 fantasy teams' : ''}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
                >
                  {savingOrder ? 'Saving...' : orderSaved ? 'Order Saved' : 'Save Draft Order'}
                </button>
              ) : (
                <button
                  onClick={startDraft}
                  disabled={starting || order.length !== 8}
                  title={order.length !== 8 ? 'The draft needs exactly 8 fantasy teams' : ''}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
                >
                  {starting ? 'Starting...' : 'Start Draft'}
                </button>
              )}

              {isDev && order.length < 8 && (
                <button
                  type="button"
                  onClick={fillBots}
                  disabled={fillingBots}
                  title="Dev only: fill empty slots with unmanaged Bot teams"
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:bg-gray-600 text-white rounded-md font-medium transition-colors"
                >
                  {fillingBots ? 'Filling...' : 'Fill with bots'}
                </button>
              )}

              {order.length !== 8 && (
                <span className="text-slate-500 text-sm">{order.length}/8 teams joined</span>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
};

export default DraftControls;
