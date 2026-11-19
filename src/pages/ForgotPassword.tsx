import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authForgotPassword } from '../utils/apiClient';
import { Button, Input, Label, Panel } from '@/components/ui';

const ForgotPassword: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: requestError } = await authForgotPassword(identifier);
    setLoading(false);
    if (requestError) {
      setError(requestError.message || 'Could not send a reset link');
      return;
    }
    setSent(true);
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="text-center mb-8">
        <h1 className="text-title text-slate-50 mb-3">Reset password</h1>
        <p className="text-body text-slate-400 leading-relaxed">
          Enter the username or email on your account. If it matches, we send a link that expires in 60 minutes.
        </p>
      </div>
      <Panel>
        {sent ? (
          <div className="space-y-4">
            <p className="text-body text-slate-200">
              If an account exists for that username or email, we sent a reset link.
            </p>
            <Link
              to="/"
              className="inline-block text-label text-slate-400 hover:text-white transition-colors"
            >
              Back to sign in
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
              <Label htmlFor="forgot-identifier">Username or email</Label>
              <Input
                type="text"
                id="forgot-identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="username or you@example.com"
                autoComplete="username"
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>
        )}
      </Panel>
    </div>
  );
};

export default ForgotPassword;
