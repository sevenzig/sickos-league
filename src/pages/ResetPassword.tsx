import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Label, Panel } from '@/components/ui';

const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const navigate = useNavigate();
  const { completeReset } = useAuth();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== passwordConfirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: resetError } = await completeReset(token, password);
    setLoading(false);
    if (resetError) {
      setError(resetError.message || 'This reset link is invalid or has expired');
      return;
    }
    navigate('/my-leagues', { replace: true });
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="text-center mb-8">
        <h1 className="text-title text-slate-50 mb-3">Choose a new password</h1>
      </div>
      <Panel>
        {!token ? (
          <div className="space-y-4">
            <p className="text-body text-slate-200">This reset link is invalid or has expired.</p>
            <Link
              to="/forgot-password"
              className="inline-block text-label text-slate-400 hover:text-white transition-colors"
            >
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-3">
                <p className="text-red-400 text-label">{error}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">New password</Label>
              <Input
                type="password"
                id="reset-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-password-confirm">Confirm password</Label>
              <Input
                type="password"
                id="reset-password-confirm"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Saving...' : 'Save password'}
            </Button>
            {error && (
              <Link
                to="/forgot-password"
                className="inline-block text-label text-slate-400 hover:text-white transition-colors"
              >
                Request a new link
              </Link>
            )}
          </form>
        )}
      </Panel>
    </div>
  );
};

export default ResetPassword;
