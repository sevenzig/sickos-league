import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export type AuthFormMode = 'signin' | 'signup';

interface AuthFormProps {
  initialMode?: AuthFormMode;
  onSuccess?: () => void;
  /** When true, primary button is full width and toggle sits underneath (join/invite gate). */
  stackedActions?: boolean;
  className?: string;
  /** Called when mode changes so parents (e.g. modal title) can stay in sync. */
  onModeChange?: (mode: AuthFormMode) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({
  initialMode = 'signin',
  onSuccess,
  stackedActions = false,
  className,
  onModeChange,
}) => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  const resetFields = () => {
    setIdentifier('');
    setEmail('');
    setUsername('');
    setPassword('');
    setPasswordConfirm('');
  };

  const setAuthMode = (next: AuthFormMode) => {
    if (next === mode) return;
    if (next === 'signup' && identifier.includes('@')) {
      setEmail(identifier.trim());
    }
    // Keep password on flip; only clear error.
    setError(null);
    setMode(next);
    onModeChange?.(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === 'signup') {
      if (password !== passwordConfirm) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
      const { error: authError } = await signUp(email, username, password);
      if (authError) {
        setError(authError.message || 'Sign up failed');
        setLoading(false);
        return;
      }
    } else {
      const { error: authError } = await signIn(identifier, password);
      if (authError) {
        setError(authError.message || 'Sign in failed');
        setLoading(false);
        return;
      }
    }

    resetFields();
    setLoading(false);
    onSuccess?.();
  };

  const isSignup = mode === 'signup';

  return (
    <form onSubmit={handleSubmit} className={className ?? 'space-y-4'}>
      {error && (
        <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-3">
          <p className="text-red-400 text-label">{error}</p>
        </div>
      )}

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isSignup ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!isSignup}
      >
        <div className="overflow-hidden space-y-4 min-h-0">
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              type="email"
              id="auth-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required={isSignup}
              tabIndex={isSignup ? undefined : -1}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-username">Username</Label>
            <Input
              type="text"
              id="auth-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3–32 letters, numbers, or _"
              autoComplete="username"
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_]{3,32}"
              title="3–32 characters: letters, numbers, or underscore"
              required={isSignup}
              tabIndex={isSignup ? undefined : -1}
            />
          </div>
        </div>
      </div>

      {!isSignup && (
        <div className="space-y-1.5">
          <Label htmlFor="auth-identifier">Username or email</Label>
          <Input
            type="text"
            id="auth-identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="username or you@example.com"
            autoComplete="username"
            required
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="auth-password">Password</Label>
        <Input
          type="password"
          id="auth-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isSignup ? 'At least 6 characters' : 'Enter your password'}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required
          minLength={isSignup ? 6 : undefined}
        />
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isSignup ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!isSignup}
      >
        <div className="overflow-hidden min-h-0">
          <div className="space-y-1.5 pb-0.5">
            <Label htmlFor="auth-password-confirm">Confirm password</Label>
            <Input
              type="password"
              id="auth-password-confirm"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              required={isSignup}
              minLength={6}
              tabIndex={isSignup ? undefined : -1}
            />
          </div>
        </div>
      </div>

      {stackedActions ? (
        <div className="space-y-3 pt-2">
          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? isSignup
                ? 'Creating account...'
                : 'Signing in...'
              : isSignup
                ? 'Create Account'
                : 'Log in'}
          </Button>
          <button
            type="button"
            onClick={() => setAuthMode(isSignup ? 'signin' : 'signup')}
            className="w-full text-center text-label text-slate-400 hover:text-white transition-colors"
          >
            {isSignup ? 'Have an account? Log in' : 'Need an account? Register'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between pt-4">
          <button
            type="button"
            onClick={() => setAuthMode(isSignup ? 'signin' : 'signup')}
            className="text-label text-slate-400 hover:text-white transition-colors"
          >
            {isSignup ? 'Have an account? Sign in' : 'Need an account? Sign up'}
          </button>
          <Button type="submit" disabled={loading}>
            {loading
              ? isSignup
                ? 'Creating account...'
                : 'Signing in...'
              : isSignup
                ? 'Create Account'
                : 'Sign In'}
          </Button>
        </div>
      )}
    </form>
  );
};

export default AuthForm;
