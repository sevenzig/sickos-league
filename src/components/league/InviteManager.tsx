import React, { useState, useEffect } from 'react';
import { MultiLeagueApi, Invitation } from '../../utils/multiLeagueApi';

interface InviteManagerProps {
  leagueId: string;
  isOwner: boolean;
}

const InviteManager: React.FC<InviteManagerProps> = ({ leagueId, isOwner }) => {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInvitations();
  }, [leagueId]);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      const data = await MultiLeagueApi.getLeagueInvitations(leagueId);
      setInvitations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  const generateNewCode = async () => {
    if (!isOwner) return;

    try {
      setGenerating(true);
      setError(null);

      await MultiLeagueApi.generateInviteCode(leagueId);
      await loadInvitations(); // Reload to show the new code
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite code');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      // Could add a toast notification here
    });
  };

  const activeInvitations = invitations.filter(inv => inv.is_valid);
  const usedInvitations = invitations.filter(inv => !inv.is_valid && inv.used_at);

  if (loading) {
    return (
      <div className="bg-white/5 border border-slate-700 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-slate-700 rounded w-3/4"></div>
            <div className="h-3 bg-slate-700 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-white">Invite Codes</h3>
        {isOwner && (
          <button
            onClick={generateNewCode}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating...' : 'Generate Code'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {activeInvitations.length === 0 && usedInvitations.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-slate-400 mb-4">No invite codes yet</p>
          {isOwner && (
            <p className="text-slate-500 text-sm">
              Generate invite codes to share with friends so they can join your league
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active Invitations */}
          {activeInvitations.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Active Codes</h4>
              <div className="space-y-3">
                {activeInvitations.map((invitation) => (
                  <div key={invitation.code} className="bg-slate-800/50 border border-slate-600 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <code className="text-lg font-mono text-blue-400 bg-blue-600/10 px-3 py-1 rounded">
                            {invitation.code}
                          </code>
                          <span className="text-xs text-green-400 bg-green-600/10 px-2 py-1 rounded">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          Expires: {new Date(invitation.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(invitation.code)}
                        className="px-3 py-2 text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 rounded-md transition-colors"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Used Invitations */}
          {usedInvitations.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Used Codes</h4>
              <div className="space-y-2">
                {usedInvitations.map((invitation) => (
                  <div key={invitation.code} className="bg-slate-800/30 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <code className="text-sm font-mono text-slate-500">
                          {invitation.code}
                        </code>
                        <span className="text-xs text-slate-500 bg-slate-600/20 px-2 py-1 rounded">
                          Used
                        </span>
                      </div>
                      {invitation.used_at && (
                        <span className="text-xs text-slate-500">
                          Used {new Date(invitation.used_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isOwner && (
        <div className="mt-6 p-4 bg-blue-600/10 border border-blue-600/20 rounded-lg">
          <h4 className="text-sm font-medium text-blue-300 mb-2">How it works</h4>
          <ul className="text-xs text-slate-400 space-y-1">
            <li>• Generate invite codes to share with friends</li>
            <li>• Each code can be used once to join your league</li>
            <li>• Players will choose their team name when joining</li>
            <li>• Codes expire after 30 days if unused</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default InviteManager;