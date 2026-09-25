import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiLeagueApi, type Invitation } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';
import { Panel, Input, Button } from '@/components/ui';

interface JoinWithCodeProps {
  initialCode?: string;
}

const JoinWithCode: React.FC<JoinWithCodeProps> = ({ initialCode = '' }) => {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(Boolean(initialCode.trim()));
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [step, setStep] = useState<'code' | 'team-name'>('code');

  useEffect(() => {
    const code = initialCode.trim();
    if (!code) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setBootstrapping(true);
      setError(null);
      try {
        const validInvitation = await MultiLeagueApi.previewInviteCode(code);
        if (cancelled) return;
        if (!validInvitation) {
          setError('Invalid or expired invite code');
          setStep('code');
          return;
        }
        if (!validInvitation.is_valid) {
          setError('This invite code has already been used or has expired');
          setStep('code');
          return;
        }
        setInvitation(validInvitation);
        setInviteCode(validInvitation.code);
        setStep('team-name');
      } catch {
        if (!cancelled) {
          setError('Failed to validate invite code');
          setStep('code');
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialCode]);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const validInvitation = await MultiLeagueApi.previewInviteCode(inviteCode.trim());

      if (!validInvitation) {
        setError('Invalid or expired invite code');
        return;
      }

      if (!validInvitation.is_valid) {
        setError('This invite code has already been used or has expired');
        return;
      }

      setInvitation(validInvitation);
      setStep('team-name');
    } catch {
      setError('Failed to validate invite code');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLeague = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!teamName.trim()) {
      setError('Please enter a team name');
      return;
    }

    if (teamName.trim().length < 3) {
      setError('Team name must be at least 3 characters');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const leagueId = await MultiLeagueApi.redeemInviteCode(inviteCode, teamName.trim());
      navigate(getLeagueUrl(leagueId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join league');
      setLoading(false);
    }
  };

  if (bootstrapping) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-6 bg-slate-700 rounded w-2/3 mx-auto" />
        <div className="h-10 bg-slate-700 rounded w-full" />
      </div>
    );
  }

  if (step === 'team-name' && invitation) {
    return (
      <div>
        {!initialCode.trim() && (
          <Panel className="mb-6 text-left">
            <h3 className="text-heading text-slate-50 mb-1">{invitation.league_name}</h3>
            <p className="text-label text-slate-400">
              Choose a name for your fantasy team.
            </p>
          </Panel>
        )}

        <form onSubmit={handleJoinLeague} className="space-y-6">
          {error && (
            <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4">
              <p className="text-red-400">{error}</p>
            </div>
          )}

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

          <div className="flex items-center justify-between pt-4">
            {!initialCode.trim() ? (
              <Button type="button" variant="ghost" onClick={() => setStep('code')}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={loading} className={!initialCode.trim() ? undefined : 'w-full'}>
              {loading ? 'Joining...' : 'Join League'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleCodeSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="inviteCode" className="text-label font-medium text-slate-300">
            Invite Code
          </label>
          <Input
            type="text"
            id="inviteCode"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="Enter 8-character code (e.g., ABC123XY)"
            maxLength={8}
            className="font-mono text-center text-lg tracking-wider uppercase"
            required
          />
          <p className="text-caption text-slate-400">
            Ask your league commissioner for the invite code
          </p>
        </div>

        <Button
          type="submit"
          disabled={loading || !inviteCode.trim()}
          className="w-full"
        >
          {loading ? 'Validating...' : 'Continue'}
        </Button>
      </form>
    </div>
  );
};

export default JoinWithCode;
