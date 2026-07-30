import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MultiLeagueApi, type RosterEntry } from '../../utils/multiLeagueApi';
import TeamLogo from '../TeamLogo';
import FantasyTeamAvatar from './FantasyTeamAvatar';

interface FantasyTeamRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  fantasyTeamId: string | null;
  teamName: string;
  logoUrl?: string | null;
}

const FantasyTeamRosterModal: React.FC<FantasyTeamRosterModalProps> = ({
  isOpen,
  onClose,
  fantasyTeamId,
  teamName,
  logoUrl,
}) => {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !fantasyTeamId) {
      setRoster([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    MultiLeagueApi.getTeamRoster(fantasyTeamId)
      .then((entries) => {
        if (cancelled) return;
        const sorted = [...entries].sort((a, b) => {
          const ap = a.draft_pick_number ?? Number.MAX_SAFE_INTEGER;
          const bp = b.draft_pick_number ?? Number.MAX_SAFE_INTEGER;
          return ap - bp;
        });
        setRoster(sorted);
      })
      .catch((err) => {
        if (cancelled) return;
        setRoster([]);
        setError(err instanceof Error ? err.message : 'Failed to load roster');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, fantasyTeamId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !fantasyTeamId) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fantasy-roster-title"
        className="relative w-full max-w-md bg-gradient-to-b from-slate-800/95 to-slate-900/95 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] border border-slate-700/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3 min-w-0">
            <FantasyTeamAvatar teamName={teamName} logoUrl={logoUrl} size="md" />
            <div className="min-w-0">
              <h2
                id="fantasy-roster-title"
                className="text-lg font-bold text-slate-50 truncate"
              >
                {teamName}
              </h2>
              <p className="text-xs text-slate-400">Season roster</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            aria-label="Close roster"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
              <p className="text-slate-400 text-sm">Loading roster...</p>
            </div>
          ) : error ? (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : roster.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">
              No roster yet — teams are assigned during the draft.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {roster.map((entry) => (
                <li
                  key={entry.nfl_team_id}
                  className="flex flex-col items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/50 p-3"
                >
                  <TeamLogo teamName={entry.nfl_team_name} size="lg" />
                  <span className="text-sm font-medium text-slate-200 text-center leading-tight">
                    {entry.nfl_team_name}
                  </span>
                  {entry.draft_pick_number != null && (
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      Pick {entry.draft_pick_number}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FantasyTeamRosterModal;
