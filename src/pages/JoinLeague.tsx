import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MultiLeagueApi, LeagueJoinInfo } from '../utils/multiLeagueApi';
import { getLeagueUrl } from '../utils/urlUtils';
import { Panel, Button } from '@/components/ui';

/** Soft-retired password join page. Commissioners share /invite/{CODE} instead. */
const JoinLeague: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [info, setInfo] = useState<LeagueJoinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await MultiLeagueApi.getLeagueJoinInfo(leagueId);
        if (cancelled) return;
        if (data.already_member) {
          navigate(getLeagueUrl(data.id), { replace: true });
          return;
        }
        setInfo(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load league');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [leagueId, navigate, user?.id]);

  return (
    <div className="max-w-md mx-auto py-12">
      {loading ? (
        <Panel>
          <div className="animate-pulse space-y-3">
            <div className="h-6 bg-slate-700 rounded w-2/3" />
            <div className="h-4 bg-slate-700 rounded w-full" />
            <div className="h-4 bg-slate-700 rounded w-1/2" />
          </div>
        </Panel>
      ) : (
        <>
          <div className="text-center mb-8">
            <h1 className="text-title text-slate-50 mb-3">Join League</h1>
            {info && (
              <Panel className="mb-6 text-left">
                <h2 className="text-heading text-slate-50 mb-1">{info.name}</h2>
                <p className="text-label text-slate-400">
                  Season {info.season} · {info.seats_remaining} seat
                  {info.seats_remaining === 1 ? '' : 's'} open
                </p>
              </Panel>
            )}
          </div>

          {(error || info) && (
            <div className="bg-amber-600/10 border border-amber-600/20 rounded-lg p-4 mb-6">
              <p className="text-amber-200 text-sm leading-relaxed">
                {error ||
                  'Ask your commissioner for the invite link. Leagues use one shared join code — open /invite or paste the link they sent you.'}
              </p>
            </div>
          )}

          <Button asChild className="w-full">
            <Link to="/invite">Enter invite code</Link>
          </Button>
        </>
      )}
    </div>
  );
};

export default JoinLeague;
