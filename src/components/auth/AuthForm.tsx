import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authForgotPassword } from '../../utils/apiClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export type AuthFormMode = 'signin' | 'signup' | 'reset';

const RESET_PENDING_KEY = 'bqbl-reset-pending';

function hasPendingReset(): boolean {
  try {
    return sessionStorage.getItem(RESET_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

function setPendingReset(pending: boolean): void {
  try {
    if (pending) sessionStorage.setItem(RESET_PENDING_KEY, '1');
    else sessionStorage.removeItem(RESET_PENDING_KEY);
  } catch {
    // Private mode can block storage. The email link still opens /reset-password.
  }
}

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
  const { signIn, signUp, completeReset } = useAuth();
  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState('');

  useEffect(() => {
    if (initialMode === 'signin' && hasPendingReset()) {
      setMode('reset');
      return;
    }
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
    setResetCode('');
  };

  const setAuthMode = (next: AuthFormMode) => {
    if (next === mode) return;
    if (next === 'signup' && identifier.includes('@')) {
      setEmail(identifier.trim());
    }
    if (next === 'signin') {
      // Drop signup-only values so a collapsed username field cannot keep an
      // autofilled email (pattern rejects @/.) and block sign-in submit.
      setUsername('');
      setPasswordConfirm('');
      setResetCode('');
      setPendingReset(false);
      if (mode === 'reset') setPassword('');
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

    if (mode === 'reset') {
      if (password !== passwordConfirm) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
      const { error: resetError } = await completeReset(resetCode, password);
      if (resetError) {
        setError(resetError.message || 'This code is invalid or has expired');
        setLoading(false);
        return;
      }
      setPendingReset(false);
    } else if (mode === 'signup') {
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

  const sendResetCode = async () => {
    if (!identifier.trim()) {
      setError('Enter your username or email first');
      return;
    }
    setSendingCode(true);
    setError(null);
    const { error: requestError } = await authForgotPassword(identifier);
    setSendingCode(false);
    if (requestError) {
      setError(requestError.message || 'Could not send a code');
      return;
    }
    setPassword('');
    setPasswordConfirm('');
    setResetCode('');
    setPendingReset(true);
    setMode('reset');
    onModeChange?.('reset');
  };

  const showCodeEntry = () => {
    setError(null);
    setPendingReset(true);
    setMode('reset');
    onModeChange?.('reset');
  };

  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';

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
              disabled={!isSignup}
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
              autoComplete={isSignup ? 'username' : 'off'}
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_]{3,32}"
              title="3–32 characters: letters, numbers, or underscore"
              required={isSignup}
              disabled={!isSignup}
              tabIndex={isSignup ? undefined : -1}
            />
          </div>
        </div>
      </div>

      {!isSignup && !isReset && (
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

      {isReset && (
        <div className="space-y-1.5">
          <Label htmlFor="auth-reset-code">Code</Label>
          <Input
            type="text"
            id="auth-reset-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={resetCode}
            onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            required
            minLength={6}
            maxLength={6}
            pattern="[0-9]{6}"
          />
          <p className="text-label text-slate-400">
            If an account exists for that username or email, we sent a code to its email.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="auth-password">{isReset ? 'New password' : 'Password'}</Label>
        <Input
          type="password"
          id="auth-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isSignup || isReset ? 'At least 6 characters' : 'Enter your password'}
          autoComplete={isSignup || isReset ? 'new-password' : 'current-password'}
          required
          minLength={isSignup || isReset ? 6 : undefined}
        />
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isSignup || isReset ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!(isSignup || isReset)}
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
              required={isSignup || isReset}
              disabled={!(isSignup || isReset)}
              minLength={6}
              tabIndex={isSignup || isReset ? undefined : -1}
            />
          </div>
        </div>
      </div>

      {mode === 'signin' && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={showCodeEntry}
            className="text-label text-slate-400 hover:text-white transition-colors"
          >
            Enter code
          </button>
          <button
            type="button"
            onClick={sendResetCode}
            disabled={sendingCode}
            className="text-label text-slate-400 hover:text-white transition-colors"
          >
            {sendingCode ? 'Sending code...' : 'Forgot password?'}
          </button>
        </div>
      )}

      {stackedActions ? (
        <div className="space-y-3 pt-2">
          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? isReset
                ? 'Saving...'
                : isSignup
                  ? 'Creating account...'
                  : 'Signing in...'
              : isReset
                ? 'Save password'
                : isSignup
                  ? 'Create Account'
                  : 'Log in'}
          </Button>
          <button
            type="button"
            onClick={() => setAuthMode(isSignup || isReset ? 'signin' : 'signup')}
            className="w-full text-center text-label text-slate-400 hover:text-white transition-colors"
          >
            {isReset
              ? 'Back to sign in'
              : isSignup
                ? 'Have an account? Log in'
                : 'Need an account? Register'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between pt-4">
          <button
            type="button"
            onClick={() => setAuthMode(isSignup || isReset ? 'signin' : 'signup')}
            className="text-label text-slate-400 hover:text-white transition-colors"
          >
            {isReset
              ? 'Back to sign in'
              : isSignup
                ? 'Have an account? Sign in'
                : 'Need an account? Sign up'}
          </button>
          <Button type="submit" disabled={loading}>
            {loading
              ? isReset
                ? 'Saving...'
                : isSignup
                  ? 'Creating account...'
                  : 'Signing in...'
              : isReset
                ? 'Save password'
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
