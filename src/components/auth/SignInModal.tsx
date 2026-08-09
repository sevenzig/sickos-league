import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
  /** When true, navigate to /my-leagues after successful auth. Off for AuthCheck (stay on protected route). */
  redirectOnSuccess?: boolean;
}

const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
  redirectOnSuccess = false,
}) => {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);

  useEffect(() => {
    if (isOpen) setMode(initialMode);
  }, [isOpen, initialMode]);

  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetFields = () => {
    setIdentifier('');
    setEmail('');
    setUsername('');
    setPassword('');
    setPasswordConfirm('');
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

    onClose();
    resetFields();
    setLoading(false);
    if (redirectOnSuccess) {
      navigate('/my-leagues');
    }
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-3">
              <p className="text-red-400 text-label">{error}</p>
            </div>
          )}

          {mode === 'signin' ? (
            <div className="space-y-1.5">
              <Label htmlFor="identifier">Username or email</Label>
              <Input
                type="text"
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="username or you@example.com"
                autoComplete="username"
                required
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="3–32 letters, numbers, or _"
                  autoComplete="username"
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_]{3,32}"
                  title="3–32 characters: letters, numbers, or underscore"
                  required
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signin' ? 'Enter your password' : 'At least 6 characters'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'signup' ? 6 : undefined}
            />
          </div>

          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="passwordConfirm">Confirm password</Label>
              <Input
                type="password"
                id="passwordConfirm"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={toggleMode}
              className="text-label text-slate-400 hover:text-white transition-colors"
            >
              {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
            </button>
            <Button type="submit" disabled={loading}>
              {loading
                ? mode === 'signin' ? 'Signing in...' : 'Creating account...'
                : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SignInModal;
