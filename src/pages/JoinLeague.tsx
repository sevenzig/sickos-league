import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AuthCheck from '../components/auth/AuthCheck';
import { useAuth } from '../context/AuthContext';
import { MultiLeagueApi, LeagueJoinInfo } from '../utils/multiLeagueApi';
import { getLeagueUrl } from '../utils/urlUtils';
import { Panel, Input, Button } from '@/components/ui';

const JoinLeague: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [info, setInfo] = useState<LeagueJoinInfo | null>(null);
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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

  const blockedReason = (): string | null => {
    if (!info) return null;
    if (!info.has_password) {
      return 'This league does not have a join password set yet. Ask the commissioner to set one.';
    }
    if (info.draft_status !== 'pending') {
      return "This league's draft has started; new members can no longer join.";
    }
    if (info.seats_remaining <= 0) {
      return 'This league is full (8 teams).';
    }
    return null;
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueId || !info) return;

    if (!password) {
      setError('Enter the league password');
      return;
    }
    if (teamName.trim().length < 3) {
      setError('Team name must be at least 3 characters');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const joinedId = await MultiLeagueApi.joinLeagueWithPassword(
        leagueId,
        password,
        teamName.trim()
      );
      navigate(getLeagueUrl(joinedId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join league');
      setSubmitting(false);
    }
  };

  const gate = blockedReason();

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

          {(error || gate) && (
            <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4 mb-6">
              <p className="text-red-400">{error || gate}</p>
            </div>
          )}

          {info && !gate && (
            <AuthCheck
              inline
              message="Sign in to join this league with the password from your commissioner."
            >
              <form onSubmit={handleJoin} className="space-y-6">
                <div className="space-y-1.5">
                  <label htmlFor="joinPassword" className="text-label font-medium text-slate-300">
                    League Password
                  </label>
                  <Input
                    type="password"
                    id="joinPassword"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password from your commissioner"
                    autoComplete="off"
                    required
                    minLength={6}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="teamName" className="text-label font-medium text-slate-300">
                    Team Name
                  </label>
                  <Input
                    type="text"
                    id="teamName"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Enter your team name"
                    maxLength={50}
                    required
                  />
                  <p className="text-caption text-slate-400">
                    Choose a unique name for your fantasy team (up to 50 characters)
                  </p>
                </div>

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Joining...' : 'Join League'}
                </Button>
              </form>
            </AuthCheck>
          )}
        </>
      )}
    </div>
  );
};

export default JoinLeague;
