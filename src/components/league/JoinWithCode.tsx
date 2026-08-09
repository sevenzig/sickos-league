import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';
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
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<any>(null);
  const [step, setStep] = useState<'code' | 'team-name'>('code');

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const validInvitation = await MultiLeagueApi.validateInviteCode(inviteCode.trim());

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
    } catch (err) {
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

  if (step === 'team-name' && invitation) {
    return (
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-title text-slate-50 mb-4">Join League</h2>
          <Panel className="mb-6 text-left">
            <h3 className="text-heading text-slate-50 mb-1">{invitation.league_name}</h3>
            <p className="text-label text-slate-400">
              You're about to join this Bad QB League. Choose a name for your fantasy team.
            </p>
          </Panel>
        </div>

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
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep('code')}
            >
              Back
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Joining...' : 'Join League'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-title text-slate-50 mb-3">Join a League</h2>
        <p className="text-body text-slate-400">
          Enter the invite code shared by your league commissioner to join an existing league.
        </p>
      </div>

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
