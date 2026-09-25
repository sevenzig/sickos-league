import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AuthCheck from '../components/auth/AuthCheck';
import JoinWithCode from '../components/league/JoinWithCode';
import { MultiLeagueApi, type Invitation } from '../utils/multiLeagueApi';
import { Panel } from '@/components/ui';

const InviteRedeem: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [preview, setPreview] = useState<Invitation | null | undefined>(
    code ? undefined : null
  );
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setPreviewError(null);
        const data = await MultiLeagueApi.previewInviteCode(code);
        if (cancelled) return;
        if (!data) {
          setPreview(null);
          setPreviewError('This invite link is invalid or has expired.');
          return;
        }
        setPreview(data);
        if (!data.is_valid) {
          setPreviewError('This invite code has already been used or has expired.');
        }
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : 'Failed to load invite');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  const codeInvalid = Boolean(code && (previewError || (preview && !preview.is_valid)));
  const showJoin = !code || preview?.is_valid === true;

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="text-center mb-8">
        <h1 className="text-title text-slate-50 mb-3">
          {code ? 'Join with Invite' : 'Join a League'}
        </h1>
        {!code && (
          <p className="text-body text-slate-400 mb-6 leading-relaxed">
            Enter the invite code from your commissioner. Sign in or create an account to continue.
          </p>
        )}
        {code && preview === undefined && (
          <Panel className="mb-6">
            <div className="animate-pulse space-y-2">
              <div className="h-5 bg-slate-700 rounded w-2/3 mx-auto" />
              <div className="h-4 bg-slate-700 rounded w-full" />
            </div>
          </Panel>
        )}
        {preview && (
          <Panel className="mb-6 text-left">
            <h2 className="text-heading text-slate-50 mb-1">
              Invite to {preview.league_name}
            </h2>
            <p className="text-label text-slate-400">
              {preview.is_valid
                ? 'Sign in or create an account, then choose your team name.'
                : 'This invite can no longer be used.'}
            </p>
          </Panel>
        )}
        {previewError && (
          <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4 mb-6 text-left">
            <p className="text-red-400">{previewError}</p>
          </div>
        )}
      </div>

      {showJoin && !codeInvalid && (
        <AuthCheck
          inline
          message={
            code
              ? 'Sign in to join this league with your invite code.'
              : 'Sign in or create an account to redeem an invite code.'
          }
        >
          <JoinWithCode initialCode={code || ''} />
        </AuthCheck>
      )}
    </div>
  );
};

export default InviteRedeem;
