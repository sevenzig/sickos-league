import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MultiLeagueApi, Invitation } from '../utils/multiLeagueApi';

const InviteRedeem: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, signIn } = useAuth();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (code) {
      loadInvitation();
    }
  }, [code]);

  const loadInvitation = async () => {
    if (!code) return;

    try {
      setLoading(true);
      const inviteDetails = await MultiLeagueApi.getInvitationDetails(code);

      if (!inviteDetails || !inviteDetails.is_valid) {
        setError('This invitation is invalid or has expired');
      } else {
        setInvitation(inviteDetails);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async () => {
    if (!code || !user) return;

    try {
      setRedeeming(true);
      setError(null);

      const leagueId = await MultiLeagueApi.redeemInvite(code);

      // Redirect to the league dashboard
      navigate(`/leagues/${leagueId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join league');
    } finally {
      setRedeeming(false);
    }
  };

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (err) {
      setError('Failed to sign in');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-400">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
            <svg className="mx-auto h-12 w-12 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.864-.833-2.634 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-medium text-red-400 mb-2">Invalid Invitation</h3>
            <p className="text-slate-300 mb-4">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400">Invitation not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-8">
          <svg className="mx-auto h-16 w-16 text-blue-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M12 2l6.75 4.5M12 2L5.25 6.5" />
          </svg>
          <h1 className="text-3xl font-bold text-white">League Invitation</h1>
          <p className="text-slate-400 mt-2">
            You've been invited to join a Bad QB League
          </p>
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          {/* Invitation Details */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-white mb-2">
              {invitation.league_name}
            </h2>
            <div className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-900/50 text-blue-300">
              Slot #{invitation.slot_number}
              {invitation.team_name && ` - ${invitation.team_name}`}
            </div>
          </div>

          {/* Invitation Info */}
          <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-slate-300 mb-3">What you're joining:</h3>
            <ul className="text-sm text-slate-400 space-y-2">
              <li className="flex items-center">
                <svg className="h-4 w-4 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                8-team Bad QB League
              </li>
              <li className="flex items-center">
                <svg className="h-4 w-4 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Round-robin schedule (no playoffs)
              </li>
              <li className="flex items-center">
                <svg className="h-4 w-4 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Inverse scoring (worst QBs win)
              </li>
              <li className="flex items-center">
                <svg className="h-4 w-4 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                18-week season
              </li>
            </ul>
          </div>

          {/* Expiration Warning */}
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-yellow-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.864-.833-2.634 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p className="text-yellow-400 font-medium">Time Sensitive</p>
                <p className="text-yellow-300 text-sm">
                  This invitation expires on {new Date(invitation.expires_at).toLocaleDateString()} at{' '}
                  {new Date(invitation.expires_at).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          {!user ? (
            <div className="text-center">
              <p className="text-slate-400 mb-4">
                You need to sign in to join this league
              </p>
              <button
                onClick={handleSignIn}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
              >
                Sign In to Join League
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                  <p className="text-red-400">{error}</p>
                </div>
              )}

              <button
                onClick={handleRedeem}
                disabled={redeeming}
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-md font-medium transition-colors disabled:cursor-not-allowed"
              >
                {redeeming ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Joining League...
                  </span>
                ) : (
                  'Accept Invitation & Join League'
                )}
              </button>

              <button
                onClick={() => navigate('/')}
                className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md font-medium transition-colors"
              >
                Decline
              </button>
            </div>
          )}
        </div>

        {/* Help */}
        <div className="mt-8 text-center">
          <p className="text-slate-500 text-sm">
            Need help? Check out the{' '}
            <button
              onClick={() => navigate('/rules')}
              className="text-blue-400 hover:text-blue-300"
            >
              league rules
            </button>{' '}
            or contact your league commissioner.
          </p>
        </div>
      </div>
    </div>
  );
};

export default InviteRedeem;