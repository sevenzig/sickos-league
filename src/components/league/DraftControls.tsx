import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MultiLeagueApi, FantasyTeam } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';

interface DraftControlsProps {
  leagueId: string; // full league UUID
  draftStatus: 'pending' | 'in_progress' | 'complete';
  onDraftStarted: () => void;
}

// Phase 5.1: commissioner draft controls - set the pick order and start the
// draft from the admin panel. Pick overrides live in the draft room itself.
const DraftControls: React.FC<DraftControlsProps> = ({ leagueId, draftStatus, onDraftStarted }) => {
  const [order, setOrder] = useState<FantasyTeam[]>([]);
  const [loading, setLoading] = useState(draftStatus === 'pending');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  };

  const startDraft = async () => {
    if (!window.confirm('Start the draft with this order? Joining closes and the order cannot be changed.')) return;
    try {
      setStarting(true);
      setError(null);
      await MultiLeagueApi.startDraft(leagueId, order.map(t => t.id));
      onDraftStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start draft');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Draft</h2>
          <p className="text-slate-400 text-sm mt-1">
            {draftStatus === 'pending' && 'Set the round-1 pick order, then start the snake draft.'}
            {draftStatus === 'in_progress' && 'The draft is in progress. You can make picks for absent managers in the draft room.'}
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
        <span className="inline-block px-3 py-1 bg-yellow-900/40 text-yellow-300 text-sm rounded-full">
          In progress
        </span>
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

            <div className="flex items-center gap-3">
              <button
                onClick={shuffle}
                disabled={order.length === 0}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md font-medium transition-colors"
              >
                Randomize Order
              </button>
              <button
                onClick={startDraft}
                disabled={starting || order.length !== 8}
                title={order.length !== 8 ? 'The draft needs exactly 8 fantasy teams' : ''}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
              >
                {starting ? 'Starting...' : 'Start Draft'}
              </button>
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
