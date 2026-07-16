import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';
import { getLeagueUrl } from '../../utils/urlUtils';

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
      // Redirect to the league dashboard using proper league URL
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
          <h2 className="text-2xl font-light text-white mb-4">Join League</h2>
          <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-white mb-2">{invitation.league_name}</h3>
            <p className="text-slate-400 text-sm">
              You're about to join this Bad QB League. Choose a name for your fantasy team.
            </p>
          </div>
        </div>

        <form onSubmit={handleJoinLeague} className="space-y-6">
          {error && (
            <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="teamName" className="block text-sm font-medium text-slate-300 mb-2">
              Team Name
            </label>
            <input
              type="text"
              id="teamName"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Enter your team name"
              className="w-full px-3 py-2 bg-white/5 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              maxLength={50}
              required
            />
            <p className="text-xs text-slate-400 mt-1">
              Choose a unique name for your fantasy team (up to 50 characters)
            </p>
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep('code')}
              className="px-4 py-2 text-slate-400 hover:text-white"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-blue-600 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Joining...' : 'Join League'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-light text-white mb-4">Join a League</h2>
        <p className="text-slate-400 leading-relaxed">
          Enter the invite code shared by your league commissioner to join an existing league.
        </p>
      </div>

      <form onSubmit={handleCodeSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div>
          <label htmlFor="inviteCode" className="block text-sm font-medium text-slate-300 mb-2">
            Invite Code
          </label>
          <input
            type="text"
            id="inviteCode"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="Enter 8-character code (e.g., ABC123XY)"
            className="w-full px-3 py-2 bg-white/5 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-mono text-center text-lg tracking-wider"
            maxLength={8}
            style={{ textTransform: 'uppercase' }}
            required
          />
          <p className="text-xs text-slate-400 mt-1">
            Ask your league commissioner for the invite code
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !inviteCode.trim()}
          className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Validating...' : 'Continue'}
        </button>
      </form>
    </div>
  );
};

export default JoinWithCode;